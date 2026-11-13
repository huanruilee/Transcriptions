/**
 * scripts/lib/paragraphLayoutPlanner.js
 *
 * 依據《釋量論·成量品 32-1.pdf》排版標準：
 * 1. 將過碎的段落重組為 150～350 字自然段（完整保留每個 sent-X 的時間軸與 ID）。
 * 2. 依講課脈絡在主要義理轉折處產生「1. 標題」「2. 標題」編號小標（約每 3～6 段一個小標）。
 * 3. 提供書面閱讀版 Markdown 輸出（renderReadableMarkdown）。
 */

const HEADING_SYSTEM_PROMPT = [
  '你是佛教經論講記的編輯，請參考《釋量論·成量品》講記範本的章節小標風格，為已分好段的講記加上主題式編號小標。',
  '規範：',
  '1. 小標格式固定為「1. 簡明義理標題」、「2. 簡明義理標題」……（8～16 字以內，清楚點出該大段核心義理）。',
  '2. 粒度：每 3～6 個自然段設一個小標即可，不要每一段都加標題。第一段通常應有「1. ...」小標。',
  '3. 只回傳嚴格 JSON：{"headings":[{"paragraphId":"p_1","heading":"1. 解釋開經偈"},{"paragraphId":"p_5","heading":"2. 一切問題都源自於不了解真相"}]}',
].join('\n');

function cjkLen(text) {
  return String(text ?? '').replace(/\s+/g, '').length;
}

function endsWithTerminalPunctuation(text) {
  return /[。！？…」』）]$/.test(String(text ?? '').trim());
}

/**
 * 將過碎的段落合併為約 150～350 字的自然段，同時完整保留所有 sentences 與時間軸。
 * @param {object} session
 * @param {object} [options]
 * @returns {object}
 */
export function mergeParagraphsByLayout(session, options = {}) {
  const minChars = Number(options.minChars ?? 160);
  const maxChars = Number(options.maxChars ?? 340);
  const preserveExistingHeadings = options.preserveExistingHeadings !== false;

  const updated = structuredClone(session);
  const sourceParagraphs = Array.isArray(session?.paragraphs) ? session.paragraphs : [];
  const flatSentences = [];

  for (const p of sourceParagraphs) {
    const existingHeading = preserveExistingHeadings && p.heading ? p.heading : null;
    for (let i = 0; i < (p.sentences ?? []).length; i++) {
      flatSentences.push({
        sentence: structuredClone(p.sentences[i]),
        forceBreakHeading: i === 0 ? existingHeading : null,
      });
    }
  }

  const merged = [];
  let bucket = [];
  let bucketChars = 0;
  let bucketHeading = null;

  const flush = () => {
    if (bucket.length === 0) return;
    const idx = merged.length + 1;
    merged.push({
      id: `p_${idx}`,
      heading: bucketHeading,
      start: Number(bucket[0].start ?? 0),
      end: Number(bucket[bucket.length - 1].end ?? 0),
      sentences: bucket,
    });
    bucket = [];
    bucketChars = 0;
    bucketHeading = null;
  };

  for (const item of flatSentences) {
    const s = item.sentence;
    if (item.forceBreakHeading && bucket.length > 0) {
      flush();
    }
    if (bucket.length === 0 && item.forceBreakHeading) {
      bucketHeading = item.forceBreakHeading;
    }

    bucket.push(s);
    bucketChars += cjkLen(s.text);

    const isTerminal = endsWithTerminalPunctuation(s.text);
    if ((bucketChars >= minChars && isTerminal) || bucketChars >= maxChars) {
      flush();
    }
  }
  flush();

  updated.paragraphs = merged;
  return updated;
}

/**
 * 呼叫 LLM 為自然段分配「1. ...」「2. ...」編號義理小標。
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function assignSectionHeadingsWithLlm({
  session,
  endpoint = 'http://100.113.144.100:18765/v1',
  model = 'nvidia/Qwen3.8-27B-NVFP4',
  apiKey = '',
  fetchImpl = globalThis.fetch,
  timeoutMs = 120000,
}) {
  const url = endpoint.endsWith('/chat/completions')
    ? endpoint
    : `${endpoint.replace(/\/+$/, '')}/chat/completions`;

  const summaries = (session?.paragraphs ?? []).map((p) => {
    const fullText = (p.sentences ?? []).map((s) => s.text).join('');
    return {
      paragraphId: p.id,
      preview: fullText.slice(0, 120),
      charCount: fullText.length,
    };
  });

  if (summaries.length === 0) return session;

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetchImpl(url, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 2048,
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        { role: 'system', content: HEADING_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            sessionTitle: session?.title ?? '',
            paragraphs: summaries,
          }),
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`LLM 小標產生失敗: HTTP ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const content = String(data?.choices?.[0]?.message?.content ?? '').trim();
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : content;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return session;

  let parsed = { headings: [] };
  try {
    parsed = JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return session;
  }

  const headingMap = new Map();
  for (const h of parsed?.headings ?? []) {
    const pid = String(h?.paragraphId ?? '').trim();
    const text = String(h?.heading ?? '').trim();
    if (pid && text) headingMap.set(pid, text);
  }

  const updated = structuredClone(session);
  for (const p of updated.paragraphs ?? []) {
    if (headingMap.has(p.id)) {
      p.heading = headingMap.get(p.id);
    } else {
      p.heading = null;
    }
  }
  return updated;
}

/**
 * 輸出對標《釋量論·成量品 32-1.pdf》版型的純淨閱讀 Markdown。
 * @param {object} session
 * @returns {string}
 */
export function renderReadableMarkdown(session) {
  const lines = [];
  lines.push(`# ${session?.title ?? `第 ${session?.sessionId ?? ''} 講`}`);
  if (session?.pageRange) {
    lines.push(`> 頁碼範圍：${session.pageRange}`);
  }
  lines.push('');

  for (const p of session?.paragraphs ?? []) {
    if (p.heading) {
      lines.push(`## ${p.heading}`);
      lines.push('');
    }
    const text = (p.sentences ?? [])
      .map((s) => String(s.text ?? '').trim())
      .filter(Boolean)
      .join('');
    if (text) {
      lines.push(text);
      lines.push('');
    }
  }
  return lines.join('\n');
}

/**
 * scripts/lib/llmOmissionAudit.js
 *
 * 使用 OpenAI-compatible LLM（例如地端 Qwen vLLM 或雲端 API）逐段檢查講次逐字稿，
 * 專門找出「規則表以外、但文義／教理上疑似 ASR 漏字或吞字」的句子，
 * 以便接續送交 GX10 Whisper 進行局部雙軌重辨識。
 */

const DEFAULT_SYSTEM_PROMPT = [
  '你是佛教經論講記的 ASR 掉字稽核員。',
  '請逐句檢查輸入段落（含前後文），只找出「文義或佛學名相上明顯疑似少字／漏字／吞字」的句子。',
  '注意：',
  '1. 不要挑剔口語贅字、語氣詞或標點符號。',
  '2. 只回報真正懷疑漏掉實質詞彙或名相前綴／後綴的句子（例如「六度的最後一個波羅蜜多」少「般若」，或某句話語法突然斷裂缺主詞／動詞／名相字）。',
  '3. 只回傳嚴格 JSON，格式為：',
  '{"suspects":[{"sentenceId":"sent-13","reason":"60字內說明為何疑似漏字","suspectedMissingTerm":"疑似缺少的詞彙","promptHints":["相關名相1","相關名相2"]}]}',
  '若該段無疑似掉字，請回傳 {"suspects":[]}。',
].join('\n');

/**
 * 將講次段落切分為適合 LLM 審核的批次（每批包含前後句語境）。
 * @param {object} session
 * @param {number} [maxCharsPerBatch=2400]
 * @returns {Array<object>}
 */
export function buildLlmAuditBatches(session, maxCharsPerBatch = 2400) {
  const paragraphs = Array.isArray(session?.paragraphs) ? session.paragraphs : [];
  const batches = [];
  let current = [];
  let currentChars = 0;

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const p = paragraphs[pIdx];
    const sentences = (p.sentences ?? []).map((s) => ({
      id: String(s.id ?? ''),
      text: String(s.text ?? ''),
    }));
    if (sentences.length === 0) continue;

    const prevParagraph = pIdx > 0 ? paragraphs[pIdx - 1] : null;
    const nextParagraph = pIdx + 1 < paragraphs.length ? paragraphs[pIdx + 1] : null;
    const prevTail = prevParagraph?.sentences?.slice(-1)[0]?.text ?? '';
    const nextHead = nextParagraph?.sentences?.[0]?.text ?? '';

    const item = {
      paragraphId: p.id ?? `p_${pIdx + 1}`,
      heading: p.heading ?? null,
      prevContext: prevTail,
      nextContext: nextHead,
      sentences,
    };
    const estChars = JSON.stringify(item).length;

    if (current.length > 0 && currentChars + estChars > maxCharsPerBatch) {
      batches.push({ sessionTitle: session?.title ?? '', paragraphs: current });
      current = [];
      currentChars = 0;
    }
    current.push(item);
    currentChars += estChars;
  }

  if (current.length > 0) {
    batches.push({ sessionTitle: session?.title ?? '', paragraphs: current });
  }
  return batches;
}

/**
 * 從 LLM 回應文字中安全解析 JSON 物件（支援 markdown code fence）。
 * @param {string} rawText
 * @returns {object}
 */
export function parseLlmSuspectsJson(rawText) {
  const text = String(rawText ?? '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return { suspects: [] };
  }
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return Array.isArray(parsed?.suspects) ? parsed : { suspects: [] };
  } catch {
    return { suspects: [] };
  }
}

/**
 * 呼叫 OpenAI-compatible chat/completions 執行 LLM 語意掉字稽核。
 * @param {object} params
 * @returns {Promise<Array<object>>}
 */
export async function auditSessionWithLlm({
  session,
  endpoint,
  model = 'Qwen3.8-27B',
  apiKey = '',
  fetchImpl = globalThis.fetch,
  timeoutMs = 120000,
}) {
  if (!endpoint) {
    throw new Error('缺少 LLM endpoint（請提供 --llm-endpoint 或設定 LLM_ENDPOINT / QWEN_ENDPOINT）');
  }
  const url = endpoint.endsWith('/chat/completions')
    ? endpoint
    : `${endpoint.replace(/\/+$/, '')}/chat/completions`;

  const sentenceLookup = new Map();
  const paragraphs = Array.isArray(session?.paragraphs) ? session.paragraphs : [];
  const flat = [];
  for (const p of paragraphs) {
    for (const s of p.sentences ?? []) {
      flat.push({ paragraph: p, sentence: s });
    }
  }
  for (let i = 0; i < flat.length; i++) {
    const { paragraph, sentence } = flat[i];
    const id = String(sentence.id ?? `idx-${i}`);
    sentenceLookup.set(id, {
      sentenceId: id,
      paragraphId: paragraph.id ?? null,
      heading: paragraph.heading ?? null,
      start: Number(sentence.start ?? 0),
      end: Number(sentence.end ?? 0),
      text: String(sentence.text ?? ''),
      prevText: i > 0 ? String(flat[i - 1].sentence.text ?? '') : '',
      nextText: i + 1 < flat.length ? String(flat[i + 1].sentence.text ?? '') : '',
    });
  }

  const batches = buildLlmAuditBatches(session);
  const collected = new Map();

  for (const batch of batches) {
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
          { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(batch) },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`LLM 請求失敗: HTTP ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    const parsed = parseLlmSuspectsJson(content);

    for (const suspect of parsed.suspects) {
      const sid = String(suspect?.sentenceId ?? '').trim();
      const meta = sentenceLookup.get(sid);
      if (!meta) continue;

      const finding = {
        ruleId: 'llm-semantic-omission',
        severity: 'medium',
        matchedText: meta.text,
        suggestedTerm: suspect?.suspectedMissingTerm ? String(suspect.suspectedMissingTerm).trim() : null,
        reason: String(suspect?.reason ?? 'LLM 語意稽核疑似漏字').trim(),
        promptHints: Array.isArray(suspect?.promptHints)
          ? suspect.promptHints.map((h) => String(h).trim()).filter(Boolean)
          : [],
      };

      if (collected.has(sid)) {
        collected.get(sid).findings.push(finding);
      } else {
        collected.set(sid, { ...meta, findings: [finding] });
      }
    }
  }

  return [...collected.values()];
}

/**
 * 合併「規則稽核」與「LLM 語意稽核」的疑慮句清單（依 sentenceId 去重並保留雙方 findings）。
 * @param {Array<object>} ruleFindings
 * @param {Array<object>} llmFindings
 * @returns {Array<object>}
 */
export function mergeAuditFindings(ruleFindings, llmFindings) {
  const byId = new Map();
  for (const item of [...(ruleFindings ?? []), ...(llmFindings ?? [])]) {
    if (!item?.sentenceId) continue;
    if (byId.has(item.sentenceId)) {
      const existing = byId.get(item.sentenceId);
      existing.findings.push(...(item.findings ?? []));
    } else {
      byId.set(item.sentenceId, {
        ...item,
        findings: [...(item.findings ?? [])],
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.start - b.start);
}

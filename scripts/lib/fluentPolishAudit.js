/**
 * scripts/lib/fluentPolishAudit.js
 *
 * 「流暢講記版」逐段修訂提案模組（對標《釋量論·成量品 32-1.pdf》編輯規範）：
 * - 依據上下文與（若有）GX10 局部重辨識證據，補齊漏字／名相殘缺
 * - 修正標點符號（問號、頓號、書名號《》／篇名號〈〉、全形雙破折號「──」、分號「；」、冒號「：」）
 * - 適度精簡過度重複或無實義的口語贅詞，同時透過 Prompt 紅線與程式化安全閘門雙重防護：
 *   1. 禁止跨句搬移文字（保護每句的時間軸對應）
 *   2. 禁止誤刪實義副詞與邏輯連詞（如「剛好」「因此」「如果」「沒有」）
 */

import { buildLlmAuditBatches } from './llmOmissionAudit.js';

const FLUENT_SYSTEM_PROMPT = [
  '你是佛教經論講記的資深文字編輯，請參考《釋量論·成量品》講記範本，將課堂逐字稿修訂為「流暢講記版」。',
  '修訂原則：',
  '1. 【補齊漏字與名相】若句中明顯因 ASR 吞字或口語省略導致名相殘缺（例如「六度的最後一個波羅蜜多」缺「般若」），或有提供 reAsrHint 音訊證據，請補齊正確名相（如「般若波羅蜜多」）；不得自行編造原文沒有的新論點。',
  '2. 【標點與用字規範（臺灣繁體書面語）】',
  '   - 疑問句／反問句必用「？」；強調語氣適度用「！」。',
  '   - 並列名相用頓號「、」；並列分句或正反對比用分號「；」；引出問句／舉例／引文用冒號「：」。',
  '   - 語氣轉折、同位語定義或引出說明可使用全形雙破折號「──」。',
  '   - 經論書名用《》，篇名用〈〉；引用或專有名詞強調用「」。',
  '   - 稱佛陀用「祂」，思惟用「思惟」。',
  '3. 【精簡口語冗詞（必須保持文義）】只可刪除無實義的純口語雜訊（如連續結巴重複「這個這個」、過密的句中語助詞「呢」「啊」「嘛」、句首過渡「那，」「好，那」「就是說」）。',
  '4. 【兩條絕對紅線】',
  '   - 嚴禁跨句搬移文字：每句只能修該句時間軸內的話，絕不可把上一句或下一句的詞搬過來。',
  '   - 嚴禁刪除實義詞彙：時間／程度／邏輯／否定副詞與連詞（如「剛好」「已經」「因此」「所以」「但是」「如果」「沒有」「不要」）必須完整保留。',
  '5. 【只列需修改句】若該句已通順且標點正確，不要列入 changes。',
  '只回傳嚴格 JSON：',
  '{"changes":[{"sentenceId":"sent-13","proposedText":"其實所有的準備，都是為了去衝這一波、那一波──般若波羅蜜多。","categories":["missing-term","oral-filler","punctuation"],"reason":"補齊「般若」，精簡口語「呢」，並以破折號與頓號整理句構。"}]}',
  '若整批都無須修改，回傳 {"changes":[]}。',
].join('\n');

const PROTECTED_CONTENT_WORDS = [
  '剛好',
  '已經',
  '突然',
  '原來',
  '因為',
  '所以',
  '但是',
  '不過',
  '如果',
  '假使',
  '只要',
  '沒有',
  '不要',
  '不能',
  '不可',
  '無法',
  '必須',
  '應該',
];

export function parsePolishChangesJson(rawText) {
  const text = String(rawText ?? '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return { changes: [] };
  }
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return Array.isArray(parsed?.changes) ? parsed : { changes: [] };
  } catch {
    return { changes: [] };
  }
}

/**
 * 將先前的 audit_and_reasr_session 報告整理成 per-sentence 提示對照表。
 * @param {object|null} auditReport
 * @returns {Map<string, object>}
 */
export function buildReAsrHintMap(auditReport) {
  const map = new Map();
  for (const r of auditReport?.reAsrResults ?? []) {
    for (const sid of r.sentenceIds ?? []) {
      map.set(sid, {
        rawText: r.rawText ?? '',
        guidedText: r.guidedText ?? '',
        recoveredTerms: r.recoveredTerms ?? [],
        expectedTerms: r.expectedTerms ?? [],
      });
    }
  }
  return map;
}

function normalizeCjkOnly(text) {
  return String(text ?? '').replace(/[^\u4e00-\u9fff]/g, '');
}

/**
 * 程式化安全閘門：檢查提案是否違反「防跨句搬字」或「防誤刪實義詞」紅線。
 * @param {object} params
 * @returns {{ safe: boolean, guardReason: string | null }}
 */
export function validatePolishProposal({
  originalText,
  proposedText,
  prevText = '',
  nextText = '',
  reAsrHint = null,
}) {
  const orig = String(originalText ?? '');
  const prop = String(proposedText ?? '').trim();

  if (!prop) {
    return { safe: false, guardReason: 'empty-proposal' };
  }

  // 1. 實義詞保留檢查
  for (const word of PROTECTED_CONTENT_WORDS) {
    if (orig.includes(word) && !prop.includes(word)) {
      return { safe: false, guardReason: `content-word-omitted:${word}` };
    }
  }

  // 2. 跨句搬字檢查：若提案新增了原本只存在於相鄰句的 >=3 字連續漢字片段（且非 reAsrHint 證實的詞），攔截之
  const origCjk = normalizeCjkOnly(orig);
  const propCjk = normalizeCjkOnly(prop);
  const neighborCjk = `${normalizeCjkOnly(prevText)} ${normalizeCjkOnly(nextText)}`;
  const hintCjk = normalizeCjkOnly(
    `${reAsrHint?.rawText ?? ''} ${reAsrHint?.guidedText ?? ''} ${(reAsrHint?.expectedTerms ?? []).join('')}`,
  );

  for (let len = 3; len <= propCjk.length; len++) {
    for (let i = 0; i <= propCjk.length - len; i++) {
      const gram = propCjk.slice(i, i + len);
      if (origCjk.includes(gram)) continue;
      if (hintCjk.includes(gram)) continue;
      if (neighborCjk.includes(gram)) {
        return { safe: false, guardReason: `cross-sentence-move:${gram}` };
      }
    }
  }

  return { safe: true, guardReason: null };
}

/**
 * 呼叫 LLM 產生全講次「流暢講記版」修訂提案（含安全閘門攔截紀錄）。
 * @param {object} params
 * @returns {Promise<{ proposals: Array<object>, blockedByGuard: Array<object> }>}
 */
export async function generateFluentPolishProposals({
  session,
  auditReport = null,
  endpoint = 'http://100.113.144.100:18765/v1',
  model = 'nvidia/Qwen3.8-27B-NVFP4',
  apiKey = '',
  fetchImpl = globalThis.fetch,
  timeoutMs = 120000,
  maxCharsPerBatch = 1100,
  concurrency = 4,
}) {
  const url = endpoint.endsWith('/chat/completions')
    ? endpoint
    : `${endpoint.replace(/\/+$/, '')}/chat/completions`;

  const flat = [];
  for (const p of session?.paragraphs ?? []) {
    for (const s of p.sentences ?? []) {
      flat.push({ paragraph: p, sentence: s });
    }
  }

  const sentenceLookup = new Map();
  for (let i = 0; i < flat.length; i++) {
    const { paragraph, sentence } = flat[i];
    const sid = String(sentence.id ?? '');
    sentenceLookup.set(sid, {
      sentenceId: sid,
      paragraphId: paragraph.id ?? null,
      start: Number(sentence.start ?? 0),
      end: Number(sentence.end ?? 0),
      originalText: String(sentence.text ?? ''),
      prevText: i > 0 ? String(flat[i - 1].sentence.text ?? '') : '',
      nextText: i + 1 < flat.length ? String(flat[i + 1].sentence.text ?? '') : '',
    });
  }

  const hintMap = buildReAsrHintMap(auditReport);
  const batches = buildLlmAuditBatches(session, maxCharsPerBatch);
  const proposals = new Map();
  const blockedByGuard = new Map();

  const processBatch = async (batch) => {
    const enrichedBatch = {
      ...batch,
      paragraphs: batch.paragraphs.map((p) => ({
        ...p,
        sentences: p.sentences.map((s) => {
          const hint = hintMap.get(s.id);
          return hint ? { ...s, reAsrHint: hint } : s;
        }),
      })),
    };

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const res = await fetchImpl(url, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 4096,
        chat_template_kwargs: { enable_thinking: false },
        messages: [
          { role: 'system', content: FLUENT_SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(enrichedBatch) },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`LLM 請求失敗: HTTP ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    const parsed = parsePolishChangesJson(content);

    for (const item of parsed.changes) {
      const sid = String(item?.sentenceId ?? '').trim();
      const orig = sentenceLookup.get(sid);
      if (!orig) continue;

      const proposedText = String(item?.proposedText ?? '').trim();
      if (!proposedText || proposedText === orig.originalText) continue;

      const guard = validatePolishProposal({
        originalText: orig.originalText,
        proposedText,
        prevText: orig.prevText,
        nextText: orig.nextText,
        reAsrHint: hintMap.get(sid) ?? null,
      });

      const entry = {
        sentenceId: orig.sentenceId,
        paragraphId: orig.paragraphId,
        start: orig.start,
        end: orig.end,
        originalText: orig.originalText,
        proposedText,
        categories: Array.isArray(item?.categories)
          ? item.categories.map((c) => String(c).trim()).filter(Boolean)
          : [],
        reason: String(item?.reason ?? '').trim(),
      };

      if (!guard.safe) {
        blockedByGuard.set(sid, { ...entry, guardReason: guard.guardReason });
        continue;
      }

      proposals.set(sid, entry);
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, batches.length));
  let cursor = 0;
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < batches.length) {
        const idx = cursor++;
        await processBatch(batches[idx]);
      }
    }),
  );

  return {
    proposals: [...proposals.values()].sort((a, b) => a.start - b.start),
    blockedByGuard: [...blockedByGuard.values()].sort((a, b) => a.start - b.start),
  };
}

/**
 * 將修訂提案套用至講次 JSON 的深拷貝（不更動段落與時間軸結構）。
 * @param {object} session
 * @param {Array<object>} proposals
 * @returns {object}
 */
export function applyPolishProposals(session, proposals) {
  const byId = new Map(proposals.map((p) => [p.sentenceId, p]));
  const updated = structuredClone(session);
  let appliedCount = 0;

  for (const p of updated.paragraphs ?? []) {
    for (const s of p.sentences ?? []) {
      const hit = byId.get(String(s.id ?? ''));
      if (hit) {
        s.text = hit.proposedText;
        appliedCount++;
      }
    }
  }

  updated._meta = {
    ...(updated._meta ?? {}),
    proofread: 'human-verified-dharma-pipeline',
    fluentPolished: true,
    fluentPolishedCount: appliedCount,
  };
  return updated;
}

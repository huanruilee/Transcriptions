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
  '   - 本逐字稿原為短句字幕切分（多數句尾沒有標點，合併成段後會黏成一長串無標點文字）。凡是句尾缺少標點、導致與下一句黏連的短句，**必須在適當斷句處補上「，」「。」「？」「！」**，絕不可留下一整串超過 25 字無標點的長句！',
  '   - 一律使用全形臺灣正體標點（禁止半形 `,` `?` `!` `:` `;` 與中文之間的空白）；不得出現簡體字或錯別字（如「隻有」應為「只有」，「會觀／會官」應為「慧觀」，「提佛舌納」應為「毗婆舍那」，「自信成就」應為「自性成就」，「原起法」應為「緣起法」）。',
  '   - 疑問句／反問句必用「？」；強調語氣適度用「！」。',
  '   - 並列名相用頓號「、」；並列分句或正反對比用分號「；」；引出問句／舉例／引文用冒號「：」。',
  '   - 語氣轉折、同位語定義或引出說明可使用全形雙破折號「──」。',
  '   - 經論書名用《》，篇名用〈〉；引用或專有名詞強調用「」。',
  '   - 稱佛陀用「祂」，思惟用「思惟」。',
  '3. 【精簡口語冗詞（必須保持文義）】只可刪除無實義的純口語雜訊（如連續結巴重複「這個這個」「然後，然後呢，」「那麼你就／你就什麼」「去／去持著它」、過密的句中語助詞「呢」「啊」「嘛」、句首多餘的「好，」「好。」）。若上一句尾與下一句首重複同一個詞（如「那麼你就」＋「你就什麼」），請精簡下一句重複的詞。',
  '4. 【兩條絕對紅線】',
  '   - 嚴禁跨句搬移文字：每句只能修該句時間軸內的話，絕不可把上一句或下一句的詞搬過來。',
  '   - 嚴禁刪除實義詞彙：時間／程度／邏輯／否定副詞與連詞（如「剛好」「已經」「因此」「所以」「但是」「如果」「沒有」「不要」）必須完整保留。',
  '5. 【積極修訂】凡是句尾缺標點、有半形標點或空白、含錯別字／簡體字／口語重複者，都必須列入 changes。只有已經標點完整、用字正確且無贅詞的句子才略過。',
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

const S2T_HOMOGRAPH_MAP = {
  这: '這',
  里: '裡',
  为: '為',
  们: '們',
  观: '觀',
  官: '觀',
  会: '會',
  体: '體',
  发: '發',
  觉: '覺',
  学: '學',
  证: '證',
  无: '無',
  义: '義',
  实: '實',
  时: '時',
  说: '說',
  话: '話',
  对: '對',
  隻: '只',
  写: '寫',
  与: '與',
  于: '於',
  从: '從',
  门: '門',
  问: '問',
  间: '間',
  个: '個',
  么: '麼',
  来: '來',
  去: '去',
  到: '到',
  还: '還',
  进: '進',
  过: '過',
  着: '著',
  见: '見',
  现: '現',
  经: '經',
  论: '論',
  佛: '佛',
  法: '法',
  僧: '僧',
  禅: '禪',
  师: '師',
  讲: '講',
  课: '課',
  义: '義',
  谛: '諦',
  缘: '緣',
  起: '起',
  性: '性',
  空: '空',
};

function normalizeHomographCjk(text) {
  return [...normalizeCjkOnly(text)].map((ch) => S2T_HOMOGRAPH_MAP[ch] ?? ch).join('');
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

  // 2. 句義錨定檢查（防 ID 錯位覆寫）：若無 reAsrHint 證據且原句 >= 5 字，修訂後至少須保留原句 50% 以上的漢字重疊
  const origCjk = normalizeCjkOnly(orig);
  const origHomo = normalizeHomographCjk(orig);
  const propCjk = normalizeCjkOnly(prop);
  const propHomo = normalizeHomographCjk(prop);
  const hintCjk = normalizeCjkOnly(
    `${reAsrHint?.rawText ?? ''} ${reAsrHint?.guidedText ?? ''} ${(reAsrHint?.expectedTerms ?? []).join('')}`,
  );

  if (!hintCjk && origHomo.length >= 5 && propHomo.length >= 4) {
    const origChars = [...origHomo];
    let matched = 0;
    let searchFrom = 0;
    for (const ch of propHomo) {
      const pos = origChars.indexOf(ch, searchFrom);
      if (pos !== -1) {
        matched++;
        searchFrom = pos + 1;
      }
    }
    const overlapRatio = matched / Math.min(origHomo.length, propHomo.length);
    if (overlapRatio < 0.5) {
      return { safe: false, guardReason: 'ungrounded-rewrite' };
    }
  }

  // 3. 跨句搬字檢查：若提案新增了原本只存在於相鄰句的 >=3 字連續漢字片段（且非 reAsrHint 證實或繁簡／同音字修正），攔截之
  const neighborCjk = `${normalizeCjkOnly(prevText)} ${normalizeCjkOnly(nextText)}`;

  for (let len = 3; len <= propCjk.length; len++) {
    for (let i = 0; i <= propCjk.length - len; i++) {
      const gram = propCjk.slice(i, i + len);
      if (origCjk.includes(gram)) continue;
      if (origHomo.includes(normalizeHomographCjk(gram))) continue;
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
  timeoutMs = 300000,
  maxCharsPerBatch = 1100,
  concurrency = 3,
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

    const payload = JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 4096,
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        { role: 'system', content: FLUENT_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(enrichedBatch) },
      ],
    });

    let res;
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(timeoutMs),
          body: payload,
        });
        if (res.ok || res.status < 500) break;
        lastErr = new Error(`LLM 請求失敗: HTTP ${res.status} ${res.statusText}`);
      } catch (err) {
        lastErr = err;
      }
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }

    if (!res) throw lastErr;
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

const DETERMINISTIC_TYPO_REPLACEMENTS = [
  [/\uFFFD+/g, ''],
  [/([\u4e00-\u9fff])[０-９]+([\u4e00-\u9fff])/g, '$1$2'],
  [/([\u4e00-\u9fff])[０-９]+$/g, '$1'],
  [/^[０-９]+([\u4e00-\u9fff])/g, '$1'],
  [/([\u4e00-\u9fff]),\s*/g, '$1，'],
  [/([\u4e00-\u9fff])\?\s*/g, '$1？'],
  [/([\u4e00-\u9fff])!\s*/g, '$1！'],
  [/([\u4e00-\u9fff]):\s*/g, '$1：'],
  [/([\u4e00-\u9fff]);\s*/g, '$1；'],
  [/([\u4e00-\u9fff]{2,})\s+([\u4e00-\u9fff]{2,})/g, '$1，$2'],
  [/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, '$1$2'],
  [/不是隻有/g, '不是只有'],
  [/隻有/g, '只有'],
  [/隻要/g, '只要'],
  [/提佛舌納/g, '毗婆舍那'],
  [/會官/g, '慧觀'],
  [/會觀/g, '慧觀'],
  [/自信成就/g, '自性成就'],
  [/原起法/g, '緣起法'],
  [/一元而存在/g, '依緣而存在'],
  [/这里/g, '這裡'],
  [/这个/g, '這個'],
  [/我们/g, '我們'],
  [/写唯我/g, '寫「唯我」'],
  [/写为我/g, '寫「唯我」'],
  [/思維/g, '思惟'],
  [/這個這個/g, '這個'],
  [/那個那個/g, '那個'],
  [/就是就是/g, '就是'],
  [/獲得獲證/g, '獲證'],
  [/然後，然後/g, '然後'],
];

/**
 * 確定性排版與錯字清理：清除 U+FFFD、全形亂碼數字、半形標點、中文字間空白與常見 ASR 錯字。
 * @param {object} session
 * @returns {object}
 */
export function cleanSessionTypography(session) {
  const updated = structuredClone(session);
  for (const p of updated.paragraphs ?? []) {
    for (const s of p.sentences ?? []) {
      let t = String(s.text ?? '').trim();
      for (const [re, rep] of DETERMINISTIC_TYPO_REPLACEMENTS) {
        t = t.replace(re, rep);
      }
      s.text = t;
    }
  }
  return updated;
}

const PUNCTUATE_GAP_PROMPT = [
  '你是佛教講記資深編輯。以下段落中的句子原本是未標點的短字幕切分，導致合併閱讀時黏成一長串無標點文字。',
  '請為「所有缺少適當標點或有口語重複／結巴的句子」補上正確的臺灣正體全形標點（，、。、？、！、：、；、「」），並精簡無實義的純口語重複（如「那麼你就／你就什麼」「去／去持著它」「好，」「然後，然後呢，」）。',
  '絕對紅線：不得跨句搬移文字，不得刪除實義副詞與連詞（如「因為」「所以」「但是」「如果」「沒有」「已經」）。',
  '只回傳嚴格 JSON，key 為 sentence id，value 為修訂後文字（只列需修改的句子）：',
  '{"changes":{"sent-1":"補上標點後的句子。","sent-2":"另一句，"}}',
].join('\n');

function hasUnpunctuatedRun(paragraph, minCjkRun = 26) {
  const joined = (paragraph.sentences ?? []).map((s) => s.text).join('');
  const segments = joined.split(/[，。？！：；、──「」《》〈〉,.?!:;]/);
  return segments.some((seg) => normalizeCjkOnly(seg).length >= minCjkRun);
}

/**
 * 針對合併後仍存在「超過 26 字無標點長串」的段落，逐段進行精準補標點與去結巴修訂。
 */
export async function ensureParagraphPunctuation({
  session,
  endpoint = 'http://100.113.144.100:18765/v1',
  model = 'nvidia/Qwen3.8-27B-NVFP4',
  apiKey = '',
  fetchImpl = globalThis.fetch,
  timeoutMs = 300000,
}) {
  const targetParagraphs = (session?.paragraphs ?? []).filter((p) => hasUnpunctuatedRun(p, 26));
  if (targetParagraphs.length === 0) {
    return { session, fixedCount: 0 };
  }

  const url = endpoint.endsWith('/chat/completions')
    ? endpoint
    : `${endpoint.replace(/\/+$/, '')}/chat/completions`;

  const flat = (session?.paragraphs ?? []).flatMap((p) => p.sentences ?? []);
  const idxById = new Map(flat.map((s, i) => [s.id, i]));
  const sentenceById = new Map(flat.map((s) => [s.id, s]));

  const proposals = new Map();
  // 每次處理 1 個段落，避免 JSON 過長截斷
  for (const p of targetParagraphs) {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const payload = JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 4096,
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        { role: 'system', content: PUNCTUATE_GAP_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            paragraphId: p.id,
            heading: p.heading ?? null,
            sentences: (p.sentences ?? []).map((s) => ({ id: s.id, text: s.text })),
          }),
        },
      ],
    });

    let res;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(timeoutMs),
          body: payload,
        });
        if (res.ok || res.status < 500) break;
      } catch {
        if (attempt === 3) res = null;
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
    if (!res || !res.ok) continue;

    const data = await res.json();
    const rawContent = String(data?.choices?.[0]?.message?.content ?? '').trim();
    const fenced = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : rawContent;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) continue;

    let parsed;
    try {
      parsed = JSON.parse(candidate.slice(start, end + 1));
    } catch {
      continue;
    }

    const changesObj = parsed?.changes;
    const entries = Array.isArray(changesObj)
      ? changesObj.map((item) => [String(item?.sentenceId ?? '').trim(), String(item?.proposedText ?? '').trim()])
      : Object.entries(changesObj ?? {}).map(([k, v]) => [String(k).trim(), String(v ?? '').trim()]);

    for (const [sid, proposedText] of entries) {
      const orig = sentenceById.get(sid);
      if (!orig || !proposedText || proposedText === orig.text) continue;
      const idx = idxById.get(sid) ?? -1;
      const guard = validatePolishProposal({
        originalText: orig.text,
        proposedText,
        prevText: idx > 0 ? flat[idx - 1].text : '',
        nextText: idx >= 0 && idx + 1 < flat.length ? flat[idx + 1].text : '',
      });
      if (guard.safe) {
        proposals.set(sid, proposedText);
      }
    }
  }

  if (proposals.size === 0) {
    return { session, fixedCount: 0 };
  }

  const updated = structuredClone(session);
  for (const p of updated.paragraphs ?? []) {
    for (const s of p.sentences ?? []) {
      const next = proposals.get(s.id);
      if (next) s.text = next;
    }
  }
  return { session: updated, fixedCount: proposals.size };
}

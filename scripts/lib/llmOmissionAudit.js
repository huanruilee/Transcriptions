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
  // estChars 只估算段落本身；實際 payload 還有 sessionTitle、段落陣列外框等額外字元。
  // 留一點餘裕，避免剛好貼齊上限時實際請求超標。
  const effectiveLimit = Math.floor(maxCharsPerBatch * 0.95);
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

    if (current.length > 0 && currentChars + estChars > effectiveLimit) {
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

  // 單一超大段落（如早期課程僅有 1 個自然段）會讓整段變成一個批次，
  // 送進 LLM 後回應被 max_tokens 截斷 → finish_reason=length → 解析不到 JSON → 稽核靜默失效。
  // 這裡把超過上限的段落再切成多個子批次，確保每個請求都在模型可回應的規模內。
  const safeBatches = [];
  for (const batch of batches) {
    const oversized = batch.paragraphs.filter((p) => JSON.stringify(p).length > effectiveLimit);
    const normal = batch.paragraphs.filter((p) => JSON.stringify(p).length <= effectiveLimit);
    if (normal.length > 0) {
      safeBatches.push({ sessionTitle: batch.sessionTitle, paragraphs: normal });
    }
    for (const para of oversized) {
      const chunks = splitOversizedParagraph(para, effectiveLimit);
      for (const chunk of chunks) {
        safeBatches.push({ sessionTitle: batch.sessionTitle, paragraphs: [chunk] });
      }
    }
  }
  return safeBatches;
}

/**
 * 把超過字元上限的單一段落切成多個子段落（保留前一句作 prevContext 以維持語意銜接）。
 * @param {object} paragraph
 * @param {number} maxChars
 * @returns {Array<object>}
 */
function splitOversizedParagraph(paragraph, maxChars) {
  const sentences = Array.isArray(paragraph?.sentences) ? paragraph.sentences : [];
  if (sentences.length === 0) return [paragraph];

  const chunks = [];
  let current = [];
  let currentChars = 0;

  const pushChunk = (list, isFirst) => {
    if (list.length === 0) return;
    chunks.push({
      ...paragraph,
      // 子段落標記切分來源，避免下游把它當成原文的獨立段落 ID
      paragraphId: isFirst ? paragraph.paragraphId : `${paragraph.paragraphId}#part${chunks.length + 1}`,
      sentences: list,
      prevContext: isFirst ? (paragraph.prevContext ?? '') : (list[0].text ?? ''),
      nextContext: isFirst ? (paragraph.nextContext ?? '') : (list[list.length - 1].text ?? ''),
    });
  };

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const itemChars = JSON.stringify({ ...s, prevContext: '', nextContext: '' }).length;
    if (current.length > 0 && currentChars + itemChars > maxChars) {
      pushChunk(current, chunks.length === 0);
      current = [];
      currentChars = 0;
    }
    current.push(s);
    currentChars += itemChars;
  }
  pushChunk(current, chunks.length === 0);

  return chunks;
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
    return { suspects: [], parseFailed: true };
  }
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    if (!Array.isArray(parsed?.suspects)) {
      return { suspects: [], parseFailed: true };
    }
    return { suspects: parsed.suspects, parseFailed: false };
  } catch {
    return { suspects: [], parseFailed: true };
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
  timeoutMs = 300000,
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

    const payload = JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 2048,
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(batch) },
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
        if (res.ok || (res.status < 500 && res.status !== 429 && res.status !== 408)) break;
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
    const finishReason = data?.choices?.[0]?.finish_reason ?? '';

    // 截斷偵測：finish_reason=length 表示回應被 max_tokens 截斷，JSON 不完整 → 稽核會靜默失效。
    // 這時必須報錯而不是回傳空結果，否則「沒抓到漏字」與「根本沒檢查」長得一模一樣。
    if (finishReason === 'length') {
      throw new Error(
        `LLM 語意稽核回應遭截斷（finish_reason=length），批次過大或 max_tokens 不足；本次批次稽核未生效`,
      );
    }

    const parsed = parseLlmSuspectsJson(content);
    if (parsed.parseFailed) {
      throw new Error(
        `LLM 語意稽核回應無法解析為 JSON（批次過大或回應異常），本次批次稽核未生效`,
      );
    }

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

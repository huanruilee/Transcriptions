---
name: transcript-pipeline
description: Stage 0～7 單向轉稿與品管流水線（含 Re-ASR、冗詞清除與碎句整併、分段小標、Stage 5 專家通讀與導讀同步）
---

# Stage 0～7 單向轉稿與品管流水線

1. **Stage 0（Domain Grounding）**：確認講者、道場住持、教材底本與關聯經論，建立課程名相表。
2. **Stage 1（Raw ASR）**：以 Whisper large-v3 轉出帶 `[start, end]` 時間戳的原始 `sent-X`。
3. **Stage 2（名相偵測 ＋ GX10 Re-ASR）**：先以規則與 LLM 找出疑似聽錯、漏字與幻覺區間，呼叫 GX10 Whisper（`100.113.144.100:8010`）雙軌重辨識還原正字（若該講次已完成 Stage 1/2/5 定稿，可用 `--skip-reasr=true` 略過）。
4. **Stage 3A／3B（冗詞清除、碎句整併與依語意順句）**：執行 `consolidateFillersAndFragments`、`generateFluentPolishProposals`（`eNeural glm53-flash` 優先，次之 `GX10 Qwen3.8-27B`，`concurrency = 1`）與 `ensureParagraphPunctuation`。
5. **Stage 4（官方提綱優先與自然段重組）**：只要該講 YouTube 說明欄附有時間碼提綱，直接以官方時間碼與標題為唯一章節切點並停用模型自創標題；章節內切分為無標題之 150～350 字自然段。僅於無官方提綱時，方配置模型或科判 `1. ...`、`2. ...` 編號義理小標。
6. **Stage 5（Agent 佛法專家逐段通讀審核，不可省略）**：主控 Agent 親自通讀全文，同時驗收「佛法名相／義理 100% 正確」及「零發語詞（無 `呃/嗯/啊`）、無破碎逗號斷句」。
7. **Stage 6（`contentOverview` 與 `sourceDigest` 同步）**：內文與 `sent-X` 定稿後才同步 `evidence[]` 與 `computeSourceDigest(transcript)`。
8. **Stage 7（CI 閘門與上線驗證）**：通過 `npm run summaries:audit`、`npm run test:v2`、`npm test` 後提交 PR（`--merge`），並確認 `deploy.yml` 與 `github.io` 實頁上線。
9. **大組共學低 Token 批次精煉與分波迭代（Study Group Upgrade Pattern）**：
   - **極簡雙段呼叫（`eNeural / glm53-flash` 優先）**：90% 格式與正字交由本地確定性規則處理；僅對單講壓縮送出 **Prompt A（結構、3–7 題核心研討問句、`法師開示摘要`）** 與 **Prompt B（`20%–100%` 區段取樣補齊講記尾段至結尾迴向）**，嚴禁將全文反覆送往高階雲端模型。
   - **API 直連避坑**：批次呼叫 `eNeural` 時應使用 **Node IPv4 SSE Streaming 直連**（`family: 4`、`stream: true`、`reasoning_effort: 'none'`、讀取 `/Users/henry/.hermes/.env` 的 `ENEURAL_API_KEY`），`hermes` CLI 僅作單次失敗備援，避免 `state.db` 鎖定與 IPv6 卡頓。
   - **分波試點與冪等護欄**：先以 1 講試點＋審查，再分波推進；腳本必須具備 URL 遮罩（保護 `watch?v=`）、`HH:MM:SS → [▶ mm:ss]` 換算、上下文同音字正則（如保護「建立他宗」與「無法值遇」）、未閉合引號修補及 `###` 標題去重冪等性。
10. **Model-Agnostic 單趟校對標準 CLI（`scripts/onepass_proofread.py`）**：
    - 優先使用版控 Prompt（`prompts/onepass_proofread_v2.md`）與 `python3 scripts/onepass_proofread.py --course <課程> --session <講次> --provider minimax --apply` 完成 4-chunk 單趟合句與校訂（含確定性 `speaker`/簡繁/`<=35` 句拆段/小標節流防呆），並以 `node scripts/check_session.mjs --file <session.json> --strict` 作為開 PR 前必過門檻。

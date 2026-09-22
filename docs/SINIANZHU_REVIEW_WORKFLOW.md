# 四念住逐稿品質審查流程

## 目的

npm test 只驗證 repository regression；它不等於逐稿內容已可發布。四念住必須另外通過逐堂 release ledger。

## 流程

1. Candidate inventory
   - session ID、YouTube ID、candidate provenance 正確。
   - publicationState 保持 candidate-review-required。

2. Structure gate
   - JSON schema、paragraph/sentence、timestamp 單調。
   - OpenCC Traditional Chinese purity。
   - 不得有 prompt leak、空句或已知黑名單詞。

3. Audio gate
   - 必須有穩定可播放的 audioUrl。
   - 每堂抽查開頭、結尾、heading 邊界、corrections 與低信心片段。
   - 沒有可播放音訊時，狀態必須是 BLOCKED，不能偽造 URL。

4. Semantic gate
   - 審查佛學名相、偈頌、專有名詞與 LLM corrections。
   - 所有 reviewNeeded 句子都必須有人工決定。
   - 每堂至少 6 個可用 headings；不足時必須人工重分段或標記 blocked。
   - 沒有底本時，只能宣稱音訊/格式通過，不得宣稱教義正確。

5. Release gate
   - npm run audit:sinianzhu:check
   - npm run test:sinianzhu:release
   - 兩者都通過後，才可將 session/course 從 candidate-review-required 改成 published。

## 指令

npm run audit:sinianzhu
npm run audit:sinianzhu:check
npm run test:sinianzhu:release

Ledger 預設輸出到：
reviews/evidence/sinianzhu/review_ledger.json

每次 ledger 都必須與 commit hash 一起保存，並由人工 reviewer 確認音訊與語義抽樣結果。

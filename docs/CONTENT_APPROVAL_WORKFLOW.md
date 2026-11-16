# 逐字稿內容核定流程

## 狀態定義

- `candidate`：機器或編輯流程產生的候選稿，不能宣稱內容已核定。
- `review-ready`：結構、來源與候選內容已備齊，等待內容審閱。
- `approved`：具備可追溯的內容核准紀錄，且 validator 驗證通過。
- `published`：已核定並被網站正式發布；`published` 同樣必須具備核准紀錄。

`待核定` 只可標示在有明確不確定證據的句子；它不是整份逐字稿的預設標籤。

## 升級條件

每一個要從 `candidate` 或 `review-ready` 升級的講次，必須在對應的 evidence 目錄建立：

`reviews/evidence/<course>/playlist-<reviewEvidenceId>/content_review_approval.json`

檔案格式如下：

```json
{
  "schema": "transcription-content-approval/v1",
  "decision": "APPROVED",
  "scope": "full-session",
  "sessionId": "01",
  "approvedBy": "github:<reviewer>",
  "approvedAt": "2026-09-24T00:00:00.000Z",
  "source": {
    "contentReviewPath": "playlist-01/content_review.json",
    "contentReviewSha256": "<sha256>",
    "publishedSessionPath": "sessions/session_01.json",
    "publishedSessionSha256": "<sha256>"
  },
  "review": {
    "audioSampleRanges": [{ "start": 120, "end": 150, "result": "aligned" }],
    "unresolvedIssueIds": []
  }
}
```

在 `course.json` 中，講次必須同時設為 `status: "approved"` 或 `"published"`；對應的 session JSON 必須設為**完全相同**的 `transcriptStatus`。核准時間必須是 ISO UTC（例如 `2026-09-24T00:00:00.000Z`）。若 evidence 的 playlist 名稱不同，額外設定 `reviewEvidenceId`。

## 驗證與核准

```sh
node scripts/validate_content_approval.mjs \
  --course-dir courses/2025釋量論第二品大組共學 \
  --evidence-dir reviews/evidence/study-group-2025
```

此 validator 會拒絕：缺失的核准檔、不是 full-session 的核准、沒有核准者或時間、沒有音訊對照樣本、尚存未解議題，及候選／發布內容在核准後被修改的情況。

## 分工

1. 校對 Agent 產生候選稿、來源 hash、音訊對照與衝突清單。
2. 獨立審查 Agent 檢查衝突清單與抽樣，不可自行簽核。
3. 人工 reviewer 在 GitHub 審閱內容與證據，提交核准記錄。
4. 維護者把狀態升為 `approved` 或 `published`，並執行 validator、相關單元測試及完整 regression。

人工核准是內容聲明的責任邊界；Agent 的任務是減少需要人工判讀的範圍，而不是取代這個責任。

# 36A 雙軌品質試點與交接

日期：2026-10-22（Asia/Taipei）。目標：完成整體改進計劃，以 36A 供使用者在線上驗收。此文件為工作紀錄，不是完成聲明。

## 範圍與來源

- 分支 `codex/session36a-quality-pilot`，隔離 worktree `/Users/henry/.codex/worktrees/session36a-quality-pilot/Transcriptions`。
- 基準 main `1dfb32203418cf22436090cb169e69fb57ae08c0`；固定來源 hash 與原摘要見 `reviews/evidence/session36a-quality/baseline.json`。
- 正式變更僅 36A、必要共用同步／驗證工具及範例規範；不批次修改其他講次，不合併 PR #271 的未驗收音訊實驗。
- 原典頁 104、111–114；讀取 36B 開頭核對實際跨講界線。原典只能支持文字，不證明音訊讀過。
- 官方公開音檔 HTTP 200、audio/mpeg，28,333,456 bytes，SHA256 `24c177f3a2806c7a298dde94cf4a91ad0158b0887169269e70a429463d0f23b0`；本地舊下載與官方檔逐 byte hash 相同。

## 驗收清單

- [x] 固定基準：29 段、147 句整理講記、176 句課堂原話、8 標題。
- [x] RED 重現失效 ID／同 ID 不同文字不可沿用已審查摘要；同步失敗不得部分寫入。
- [x] 共用同步 fail closed，僅接受與新來源綁定且重新審查的摘要，不把失效引證指到第一句。
- [x] 逐點重審導讀，區分自宗、他宗批評、引述與問答（新8點，MiniMax獨立重審，Codex查引證）。
- [x] 全講兩軌模型比對、讀誦原文及 36A/36B 界線檢查；ledger與分歧裁決保存。這不是逐字音訊人工驗收。
- [x] 音訊來源／runtime／ASR 證據、時間碼分級及16句代表性聲學證據獨立核對（不宣稱人工聽核）。
- [x] 本地網站、Markdown、HTML、大綱、課堂原話與下載一致；讀者看得見估算／待核的差異。
- [x] 本地摘要／校稿證據／goldenStandard／完整 Node／前端／build／瀏覽器驗證。
- [ ] 固定 commit 的獨立 review PASS，GitHub review threads 解決。
- [ ] 合併、同 SHA CI／Pages 部署成功、實頁與下載驗證，提供使用者線上驗收連結。

## 發布檢查與回復界線

使用deploy-checklist規範：靜態網站無資料庫遷移、無新權限或feature flag。合併前必須最終commit獨立review及CI全綠；合併後Pages部署必須指向同一main SHA。正式實頁核對摘要、提醒、原話抽屜、30項原音清單及實際TXT下載。無伺服器端延遲／錯誤率監控，不能聲稱有此監測。

回復觸發：36A無法載入、下載丟句、原話物件變動、摘要立場錯誤、節錄404或末句不能播。先保持PR未合併並修正；若部署後才出現，使用新revert PR回復本次merge，不force-push、不覆寫main、不動PR271。

本地實頁已確認8點摘要、4個科判、提醒與原話抽屜；實際TXT下載全176句及閱讀提醒。發現官方MP3瀏覽器採短檔頭長度；已以完整解碼結果製作30段轉碼節錄（約5MB）供覆核，保留來源hash、原音區間及各檔hash，不提交完整音檔。最後p29-v11在瀏覽器duration24.947813秒，播放至24.801776秒後自動停止，沒有media error。原網站完整音軌仍指官方檔案，覆核頁另有官方連結。

核心獨立review見independent-review-core.md：內容與同步PASS，淺層CI缺少baseline git物件P1已用獨立基準雜湊修正；最後還需新固定commit含音訊節錄的follow-up review。驗收目標是「可讓使用者線上驗收」，不是替使用者宣告人工聽核或全庫校稿完成。

最後畫面檢查另發現36A祖先誤掛在己一五地下。依p21/63/64/240補上己二第六地同層父節點，只將指定四個既有庚子科換父；依p80把祖先「醜二」更正為「丑二」。所有既有節點其他欄位、關聯與順序保全測試通過；新父節點時間0且待審，不冒充已聽核錨點。出版品科判頁首亦改正「戊二、破他生」為「寅二」，並區分巳三、巳四是課程前後段而非彼此父子。第七至十地等其他既有結構問題不屬本試點，沒有一併修改。

CI39771991576實際因runner缺ffmpeg失敗，已在acceptance workflow明確安裝ffmpeg並印版本；保留30段完整解碼檢查，沒有改成skip。最後本地完整Node651pass/4skip、前端98pass、build成功，摘要301/301valid；36A實頁breadcrumb已實際確認己二及丑二，仍為4個科判節點。

## 模型與授權

Qwen 為主要逐段稽核，MiniMax 僅處理五點摘要與分歧，Codex／獨立 reviewer 決定採納。已授權逐字稿傳送私人 GX10 與 MiniMax；不使用 Eneural production。實測 GX10 8001 回報 Qwen3.8-27B／llama.cpp Q4_K，8010 為 CUDA int8 large-v3-turbo，不宣稱完整 large-v3 或詞級時間戳。

自動核准曾因「音訊未明列授權」拒絕；驗證完整音檔為官方無登入公開來源及 hash 後，審查已核准本次私人 GX10 Whisper 核對。不得將音訊本體提交 Git。

## 現況與續跑

主 Agent：來源、音訊、逐段模型審查、36A 內容及最終發布。Darwin Agent：只改同步工具與測試，不改正式 36A。每個 gate 更新此文件或 PR checkpoint。

音訊ASR與Qwen八批已完成，不要重跑。第二輪MiniMax候選覆核也已完成（29段，唯一p17模型分歧已按原話駁回，見review-decisions.md）。`overview-v1`是中間來源，不能套到最終正文；已使用`overview-v2`重新審查後同步。新正文29段150句，原話176句全部物件不變。

音訊完整解碼3558.3478125秒，MP3檔頭估算3541.668秒不可靠；full-asr末句3557.34秒有效，不刪尾句。全176句ASR比較僅為聲學輔助，159句達文字覆蓋門檻、17句待聽核，全部humanListened=false。新線上清單含分層抽樣16句及待核17句，去重30句。保留疑點供使用者在線上聽核，不冒充人工確認。

已重建Markdown／HTML／session／outline，移除四個與36A無關的TOC關聯，保留全部其他講次與節點。UI及TXT下載帶閱讀提醒；課堂原話抽屜不再對36A宣稱逐字忠實已驗收。`render_study_guide_html.py <path>`現在只處理明列檔案；無參數才沿用全資料夾模式。

`scripts/plan_session36a_revision.mjs`是初輪一次性嚴格替換計劃，已套用後再次執行應失敗，不得藉此重套；後續三項保守修改另見content-followup.json。候選製作使用`sync_study_guide_to_session.py 36A --candidate-dir <new-empty-dir>`，正式同步必須附審查過的`--overview-file`，兩種模式不能混用。

發現問題時，先修精確來源及測試，禁止只更新 digest 讓檢查通過。回復以新 revert PR 保留歷史。完成前按本清單逐項查證，不把結構全綠當成內容或聲學驗收。

# 第 30、31 講音文校準

狀態：兩講完整首輪候選已產生，第二輪風險區段重辨識中；尚未替換正式閱讀器的時間。閱讀核定不變，未逐句人工聽核。
來源 commit：`3cc6514697caea78f813edfa192b3dc11ddf81c3`。第 30 講 546 句，第 31 講 545 句。

## 問題與修復契約

歷史 commit `01002cb04760664b5389de0e5c6b30cce5b03193` 為保持時間單調而推動部分邊界；這可改善排序，不能證明錄音對應。現有長句被擠到 0.5 秒的案例須被攔下。歷史新舊時間差不是實測聲學誤差；不能整批回復歷史時間後宣稱校準完成。

正文、句 ID、順序、reading approval 與原始 session 都保持不變。校準另有候選及逐句舊／新時間帳本；未匹配不插值、不補 0.5 秒、不以舊時間填充。來源 digest、全音訊 hash、模型實際版本、聲學 word index 與邊界均可追溯。

## 參考資料預檢

2026-10-24 直接讀取兩支 YouTube metadata（yt-dlp；影片內容下載 403，但說明欄及總長可取得）。說明欄明列以下官方聲音檔，已重新下載；不是把 repo 既存副本當最新版。

| 講次 | 影片 | 官方聲音檔 | 影片秒數／官方音檔秒數 |
| --- | --- | --- | --- |
| 30 | `f2eRxEqCsZA` | Drive `124EVflDzP3_lAKT1Lak_q_PKiizyOtPO` | 5229／5228.800 |
| 31 | `IMn5Akoyypk` | Drive `1Ie5xyNY7d4h7n_F8YF-r15m2F5EaNCmO` | 5626／5625.757 |

影片說明亦列共同上課講義 `1KopDUuRlruWtYNMqjrR3V9XKaLhlW_xU`，及文字附件 30=`1CHayTjnTOdxZ8siYtt0w-TbL-8krM2X1`、31=`1ZL1vSXsbr20OpnzNyKJQFkb5wRreVmYO`。本次不修改正文，不把整編文字作聲學 gold；上述文字／講義未重新下載核正文版本。既有閱讀核定仍只代表閱讀確認。

GPU 上既有 MP3 的 hash 與官方音檔不同，因此實際比較兩者在 100、1300、2600、3900 秒及末段的 8 秒聲波，8kHz mono、搜尋 ±0.1 秒的相關峰。兩講各五點相關度均超過 0.99；30 講穩定編碼偏移 -0.047875 秒，31 講為 0。這是同音源／時間軸的抽樣證據，不是逐句人工聽核，亦不是直接解碼 YouTube 影音比對。完整數值、hash 見 `reviews/evidence/shiliang-30-31-calibration/audio-identity.json`。

## 實際執行與檢查

GPU 服務實際為 faster-whisper 1.2.1。既有 HTTP API 忽略 `word_timestamps`，不提供 word 級邊界；本次在既有容器內用獨立程序、既有 CUDA/int8 模型與音檔執行，未修改或重啟正式服務。音訊留在本機／使用者自有 GX10，不進 Git。

`transcribe_shiliang_calibration_words.py` 是本次隔離工作程序，需既有模型 cache 及 `/tmp/calibration-20261024/30.mp3`、`31.mp3`；不是通用服務啟動器。`verify_shiliang_audio_identity.py` 需 numpy、ffmpeg 與本地工作目錄中的官方／GPU 音檔，重算同音源證據。

```sh
node --test tests/unit/audioCalibration*.test.js
# 繁簡匹配需 opencc-python-reimplemented；安裝在隔離環境。
python3 scripts/build_audio_calibration_candidate.py --source SOURCE.json --evidence WORDS.json --output CANDIDATE.json
node scripts/audit_audio_calibration.mjs SOURCE.json CANDIDATE.json WORDS.json AUDIO_IDENTITY.json
```

`npm test` 自動執行反例、真實長句風險及 builder 的不插值契約。校準 audit 另外核對實際聲學檔 hash 與每句 word 邊界；缺少證據、錯影片、變更正文、缺句、低匹配或未解決風險都失敗。新建候選的 `identityVerified` 預設 false，不能因生成完成即發布。

結構與聲學 replay 分開判定：後者從實際 ASR 文字以繁簡正規化及 LCS 獨立重算匹配與缺字，並核對模型 revision／版本／總長；identity manifest 亦須由 digest 綁定，不能只信 `identityVerified`。

目前瀏覽器 CI 攔截 YouTube 音訊：只證明閱讀器工程行為，尚未加入以校準產物驅動的實際點擊秒數案例。聲學全句校準與該點擊案例未完成前，不能宣稱正式時間已修復。

## 首輪進度與未解決風險

Test patterns 已由 PR #299 合併，commit `13c3ff5b18434efed74b08ede1a43929aa743944` 的主分支 CI 通過。獨立工程複核在固定 `a6ebdc8` PASS，限檢查器／候選工具；不是校準結果的驗收。

30 講完整字級辨識完成：1,762 段、5228.774 秒；對回 546 句，其中 96 句初步列 review（87 句低匹配、40 句首尾缺字，類別有重疊）。完整 audit 仍 FAIL，正式時間未變。六句沒有可靠全局匹配，保留 null，不用舊時間填滿。

首輪實測出現閱讀順序與聲音順序的衝突：正文 sent-101 是「之前的那個例子…」，sent-102 是「現在的這個例子…」；本次 ASR 在 948.16–952.70 秒先辨識「現在…」，953.26–960.41 秒後辨識「之前…」。這是 ASR 診斷、未人工聽核；證據在 `first-pass/session_30.order-conflict.json`。不能把句子時間往後推來消除倒序，也不能未經核可重排正文；須以獨立音訊時間索引或明示衝突處理。

嘗試用第二個完整 large-v3 模型處理 63 個風險區段（共約 1382 秒），載入即遇 CUDA OOM，沒有產生可採用的重辨識結果；不停止其他服務來騰資源。待主要全講工作結束、釋放本次模型後再做一次有界重辨識。Qwen3-ForcedAligner 的 GPU Torch 不支援現有 GB10 執行環境，未更改驅動；CPU 單區塊試跑完成，但其強制字元時間包含未實際說出的「三稱」標示，且部分字元為零時長，不能直接當獨立聽核或全句校準 gold。未啟動未經驗證的全講 CPU 強制對齊。

31 講完整字級辨識亦已完成：2,019 段、5625.742 秒，對回 545 句，首輪 matcher 列 63 句 review。將 structure 與獨立 acoustic replay 的錯誤 ID 合併後，完整待處理清單為 30 講 105 句、31 講 67 句，共 172 句；此數較 matcher 自報的 159 句更多，證明不能只信產生器自身的成功標記。兩講 audit 都 FAIL，音源 identity audit 都 PASS。

第二輪改用已知可載入的同一 turbo 模型，關閉 VAD、以 63＋48 個風險視窗（約 1382＋1016 秒）各做一次重辨識；它是同模型的區段重試，不是兩個獨立 ASR 系統或人工交叉聽核。每窗都保存原始段落、字級時間及所針對的原句 ID。未自動改字或修改正式時間。

首輪所有輸出保存在 `reviews/evidence/shiliang-30-31-calibration/first-pass/`：words、candidate、audit、review-queue 四類檔案分開保存。`review-queue` 包含獨立 gate 所指出的全部問題，不以候選的 `status: aligned` 當作已驗收。這些內容都是機器校準候選，不是人工確認資料。

`tests/unit/audioCalibrationRecordedRegression.test.js` 將本次兩講完整首輪聲學證據保留為負向回歸：用當時 immutable source snapshot 與全音源 identity 驗證來源正確、全句有紀錄，但 structure／acoustic 必須仍拒絕校準 PASS。之後的修正版另開新版本，不覆寫這些歷史失敗資料，亦不因正式 session 變動而偷換本案例來源。

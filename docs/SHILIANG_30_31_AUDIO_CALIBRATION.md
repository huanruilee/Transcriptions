# 第 30、31 講音文校準

狀態：全講校準候選製作中，尚未替換正式閱讀器的時間。閱讀核定不變，未逐句人工聽核。
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
node scripts/audit_audio_calibration.mjs SOURCE.json CANDIDATE.json WORDS.json
```

`npm test` 自動執行反例、真實長句風險及 builder 的不插值契約。校準 audit 另外核對實際聲學檔 hash 與每句 word 邊界；缺少證據、錯影片、變更正文、缺句、低匹配或未解決風險都失敗。新建候選的 `identityVerified` 預設 false，不能因生成完成即發布。

目前瀏覽器 CI 攔截 YouTube 音訊：只證明閱讀器工程行為，尚未加入以校準產物驅動的實際點擊秒數案例。聲學全句校準與該點擊案例未完成前，不能宣稱正式時間已修復。

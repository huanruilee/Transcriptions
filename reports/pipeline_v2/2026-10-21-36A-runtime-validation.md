# 36A 轉寫流水線升級與實測驗證

日期：2026-10-21（Asia/Taipei）。起點：`f2d97587a8f459faf90af258f38b1cac30e417b3`。本次為切片實測，未通過 CER 下降至少 40% 的品質驗收，輸出仍為待審候選，未發布或合併。

## 完成項目

- 批次入口新增 `--output-dir` 與 `--audio-path`，在沙盒保存 ASR、規則校對、LLM 校對、session 與逐字稿；失敗時回傳非零退出碼。
- 保護 36A／36B 已發布的 sessions、verbatim、Markdown 與 HTML；顯式輸出路徑與符號連結也須檢查真實路徑。
- 移除會刪掉「謝謝大家」後面內容的規則，不再將「哎呦」「喔」或「啊難」視為可刪字元集合。
- LLM 等長陣列仍須檢查文字保真；超出已驗證同音詞庫的實詞變動保留原話，另存 `llmProposal` 與待審原因。此策略較保守，未驗證的同音修正亦需核定。
- 段落邊界、重疊、時間缺口及片尾的句子只收錄一次；缺口歸屬標記待審。保留來源講者及待審資訊，不憑「剛剛」猜測學員。
- 新增標準 Levenshtein CER 工具及 11 項 Python 行為測試，整合至 `npm test`。先重現失敗，再修正。

## 實際服務與限制

以 SSH 唯讀確認 `gx10-2887`、NVIDIA GB10，GPU 檢查時使用率 0%。未重啟、換模或停止服務。

- 8010：CUDA、int8，實際載入 `mobiuslabsgmbh/faster-whisper-large-v3-turbo`。
- 8001：模型 ID `Qwen3.8-27B`，服務實際回報 llama.cpp／Q4_K，而非原交接文件所稱 vLLM 後端。
- 4001：未監聽。原有 Mac 14001／18001 tunnel 亦未監聽。本次透過暫時 SSH tunnel：18010 → 8010、18001 → 8001，直接呼叫現有本地模型。
- 已讀取容器 `/app/server.py`：VAD、prompt、beam 等參數確實傳給 faster-whisper；HTTP `model` 與 `word_timestamps` 未被處理。故本輪明確請求 turbo，不宣稱已測完整 `large-v3` 或詞級斷句。未修改遠端服務。
- Step 4 原有標題生成仍有通用標題保底；沙盒標題不構成底本或出版驗收。

## 實驗方法

原始音檔來源為 `audio_map.json` 的 36A 官方 Flyday MP3，完整下載後以 ffmpeg 擷取 `[0, 330.18)` 秒，單聲道 16kHz WAV。範圍以黃金樣本完整句子邊界選定，涵蓋開場回看第 104 頁、進入第 111 頁與中庸討論；未涵蓋全講及學員問答。

舊版使用不可變提交 `44a23af` 的 `batch_convert_all.py`：舊通用 prompt、600ms VAD、28 字斷句、舊 LLM 校對。新版使用本 PR 程式，依序實測 600／900／1200ms VAD、動態 prompt、自然斷句、保真校對及逐字稿。各組使用完全相同音訊；舊版只執行函式並將結果存入沙盒，不呼叫會寫正式 sessions 的舊入口。

參考為 `verbatim_36A.json` 中完全位於切片內的句子，依原始順序串接。CER = Levenshtein 距離 ÷ 參考字數。NFC 正規化、小寫、移除空白與標點；不刪除任何實詞、重複或語氣詞，不把假說按參考時間裁掉以美化分數。新舊假說均用 OpenCC `s2twp` 轉正體。原始 ASR 證據保留服務原貌，候選逐字稿另通過繁體及禁止同音字檢查。

基準是當前同一服務重跑的舊程式，不是歷史 GPU／LLM 版本的完整重現。LLM 溫度及伺服器非完全確定，兩輪結果略有變動。第一輪探索與最終版本重跑均保留，以下採最終版本重跑結果。

## 重現方式

在獨立 Python 環境安裝 `requests`、`opencc-python-reimplemented`，並備有 ffmpeg、SSH 與 npm 依賴。保留原始音檔與切片；不要將音檔加入 Git。

```bash
ssh -N -o ExitOnForwardFailure=yes \
  -L 18010:127.0.0.1:8010 -L 18001:127.0.0.1:8001 gx10

ffmpeg -i tmp/pipeline_v2/36A/runtime-validation/source_36A.mp3 \
  -t 330.18 -ar 16000 -ac 1 \
  tmp/pipeline_v2/36A/runtime-validation/clip_0000_0330.wav

WHISPER_GPU_URL=http://127.0.0.1:18010/v1/audio/transcriptions \
VLLM_FALLBACK_URL=http://127.0.0.1:18001/v1/chat/completions \
WHISPER_MODEL=large-v3-turbo \
python3 scripts/evaluate_pipeline_v2.py \
  --audio tmp/pipeline_v2/36A/runtime-validation/clip_0000_0330.wav \
  --output-dir tmp/pipeline_v2/36A/runtime-validation/final-benchmark \
  --baseline-ref 44a23af --start 0 --end 330.18 --vad 600 900 1200
```

單一候選的批次入口範例（輸出根目錄下另建立 `36A/`）：

```bash
WHISPER_GPU_URL=http://127.0.0.1:18010/v1/audio/transcriptions \
VLLM_FALLBACK_URL=http://127.0.0.1:18001/v1/chat/completions \
WHISPER_MODEL=large-v3-turbo \
python3 scripts/batch_convert_all.py --sessions 36A --workers 1 \
  --audio-path tmp/pipeline_v2/36A/runtime-validation/clip_0000_0330.wav \
  --output-dir tmp/pipeline_v2/36A/runtime-validation/single-run
```

## 測試與待辦

最終程式全套驗收：`npm run test:v2` 97 通過；`npm test` 577 通過、4 項既有略過、0 失敗；`npm run summaries:audit` 301/301 有效；黃金標準 8/8；`npm run build:v2` 通過。新增 Python 行為測試 11/11。首次受限環境無法監聽測試用 19091，允許本機監聽後全套通過。

待辦：

1. 以獨立服務或受控配置補測完整 `large-v3`，確認服務支援詞級時間戳；本次未更動既有服務。
2. 對待審同音修正逐句聽音核定，擴充經驗證詞庫；避免以刪掉重複或改寫原話換取較低 CER。
3. 達成切片 CER 下降至少 40%，再擴至完整 36A 並重新驗收；目前不能聲稱已達目標。
4. 37A／37B 雙軌發布尚未進行；T6 原典模糊對齊、T7 深層科判提取未實作。
5. 科判、標題、引文與講者仍需底本／音訊內容驗收，結構測試通過不等於內容通過。

## 最終 CER 結果

參考為 18 句、899 字；舊版 CER 為 24.81%（223／899）。目標門檻為 14.88%。

| 新版 VAD | 新版錯誤字元數 | 新版 CER | 較舊版相對下降 | 待審句數 |
|---|---:|---:|---:|---:|
| 600ms | 247 | 27.47% | -10.76% | 11 |
| 900ms | 251 | 27.92% | -12.56% | 10 |
| 1200ms | 225 | 25.03% | -0.90% | 13 |

三組均未達標；負值表示惡化。1200ms 在本切片分數最佳，但仍比舊版差，不據此更改全庫預設值。兩輪實驗都保留，不挑選個別輪次美化結果。

候選逐字稿三組均為零簡體字、零禁止同音錯字；待審句子不是已核定內容。36A／36B 八個已發布檔案前後 SHA-256 全部一致。

機器可讀證據：`reports/pipeline_v2/2026-10-21-36A-cer.json`。原始 ASR、校對與逐字稿候選：`tmp/pipeline_v2/36A/runtime-validation/final-benchmark/`；探索輪：`tmp/pipeline_v2/36A/runtime-validation/benchmark/`。音檔、服務快照及完整實驗輸出只保留在沙盒，未加入 Git。證據檔包含原始音檔、切片、底本、程式、每階段輸出及保護檔案雜湊。

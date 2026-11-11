# 入中論第01講：依現行標準重整

Task ID：RUZHONG01-STANDARD-01。範圍僅 `ru-zhong-lun/session-01`、其閱讀出版品與必要的下載選軌及發布測試。使用者授權處理直至更新上線。來源main commit `ccc9f33a62711cb48d7694887586d1e296b0d78c`；分支 `codex/ruzhong01-standard-rebuild`。

## 交付與界線

保留174段、346句及原閱讀器的 `sent-0` 至 `sent-345`，避免讀者註記因重編ID失聯。歷史AI導讀使用的 `pN-sN` 定位另存帳本 `sourceLocator`；所有原句物件、文字與時間完整存於原稿快照及ledger，`rawText`明標「舊機校原文，非原始ASR」。

56項限定本句的局部修改，涉及49句，另有標點排版。例：「菩薩」→「訓釋」、「皮肉燒中／進目中」→「毘婆沙宗／經部宗」、「為實」→「唯識」、地次語境的「諦」→「地」；保留四諦語境、重複、自我修正、否定及數字。獨立內容覆核撤回兩項：不補全p21-s2書名，也不消除p98-s1的書名自我修正。

200句時間通過原始聲學字界重播與對原時間起訖各≤0.5秒容差檢查，且不與相鄰保留時間重疊。其餘沿用原時間；沒有插值、硬推單調或四捨五入修假時間。146句有內容或時間待核項目。整講為**待閱校版、未逐句聽核**，不是人工已確認版。

主要待核：p3–8讀誦跨句及原稿缺句、p18/p78宗派分歧、p86-s1新ASR漏辨、p95否定與度名、p142疑整段底本補文、奢摩他／三摩地與末尾「擴充套件／擴展」。不憑教義或語感補改。真正末句「開玩笑，好，謝謝大家」保留至2465.55秒。

## 來源與工具

官方索引與MP3、2016上課版PDF均於本次重新取得。完整解碼2465.671875秒，原音SHA與ASR輸入一致。PDF第6、60、61、63、64頁對repo既有文字移除空白後一致；實際課程先讀第6頁，後講63–64頁並回看60–61頁。只核對適用頁碼；不提交完整音檔或PDF。

GX10實際runtime：CUDA/int8 faster-whisper large-v3-turbo，完整字級輸出1466片段；另外14個有限視窗各做一次無提示重辨識，仍是同一模型，非獨立投票或人工gold。8001為llama.cpp提供Qwen3.8-27B別名，不冒稱vLLM。9批涵蓋346句的局部校字提案均保留，Codex逐項篩選；不直接套用把ASR當原稿或整段改寫的建議。

既有6點MiniMax導讀文字保留原生成者；重新綁定實際原句並由GX10本地模型審查。2項因引句不足未通過，補直接相關句後僅重審該2項，再通過；完整請求、回應與usage可追溯，不把新審查歸給MiniMax。

證據在 `reviews/evidence/ruzhong01-standard/`：reference inventory、原稿快照、完整words、bounded rescue、逐句plan與ledger、模型回應及提案處置。完整本地request cache在工作區，公開request manifest保留SHA。這些資料曾參與校字，歸development-regression，不能稱盲測或CER改善。

## 閱讀與下載

主入口直接更新session，顯示待閱校、日期及待核數。原稿對照明標舊機校，沒有假稱原始ASR；獨立HTML逐句呈現原稿、新ASR候選與帳本。TXT／Markdown及真正的主頁下載都有待閱校提醒與完整末句。

原匯出器會優先輸出verbatim，導致本講下載舊稿而非新校字。因此本講每段顯式`downloadTrack:reading`，App傳遞選軌，匯出器只在明確選軌時使用閱讀正文；其他課程維持既有預設。RED/GREEN單測及實際下載契約覆蓋此回歸。

## 重建與驗證

```sh
node scripts/publish_ruzhong01_reading.mjs --candidate
node --test tests/unit/ruzhong01Reading.test.js
node scripts/publish_ruzhong01_reading.mjs
npm test
npm run test:v2
npm run summaries:audit
node --test tests/acceptance/goldenStandard.test.js
npm run build:v2 -- --base=/Transcriptions/
bash scripts/test_reader_artifact.sh
```

Publisher拒絕來源／聲學摘要漂移、未知句子、重疊原文修改、長段改寫及舊版本導讀審查。時間使用既有acoustic gate重播，最終已採集合須PASS；被拒候選原樣留存而非放寬門檻。

閱讀器release smoke新增本講桌面／手機：完整346句與待核標示、舊稿對照、實際下載、末句、手機寬度及匹配的JS/CSS版本。另以真正官方音源在瀏覽器測試首、末句原生播放及時長；工程播放驗證不等於人工聽核。PR固定版本獨立review、CI、同mainSHA的Pages artifact/deployed gate均通過後才宣稱上線。

回退：以新revert PR撤回本次session、出版品及metadata；原稿快照完整保留。下載選軌為可選欄位，不影響其他講次。沒有修改音訊服務、重啟服務或改動全庫轉寫預設。

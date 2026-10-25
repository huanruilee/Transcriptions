# 第01講依35A研讀講記標準重做

Task：RUZHONG01-STUDY-35A。使用者明確指定以35A標準重做01，並已授權校閱後直接上線、線上Review後再改。來源main：aa0e6c39941045a14c7ba38e75a45f8036a8451c；工作分支codex/ruzhong01-study-guide。

## 交付

30段、81個講記單元；主頁直接讀精煉講記，另有宗旨、8項研讀綱要、5項法相與5題研討問題，以及Markdown、HTML/TXT。禮讚在主文明標底本全文對讀；本堂未完整讀誦的後文不得假作課堂引語。保留下棋譬喻、為何學他宗、五書差異、寺院/在家學習條件、現前兩義、初地已現證之問難、三慧解釋的限定及不共滅定下堂再講。

舊講記不能直接沿用：它添加合掌、未在對應錄音講授的禮讚義解，錯置講授次序，提前講完庚二頌文及滅定，且把三慧的保留語氣寫成定論。新稿從當前原話重建，而非搬回舊稿。

## 來源與時間

本次同日重用已核實官方原音、PDF與ASR，重新雜湊匹配；inventory記錄重用版本。原話來源快照、plan、每句來源帳本位於reviews/evidence/ruzhong01-study/，既有逐句疑義仍在ruzhong01-standard/及quality_review HTML。

346句原話校字稿的ID、順序、文字與時間完整保存在各段verbatimSentences；該稿不是原始ASR，亦未逐句人工聽核。舊機校原文與聲學候選另有既有證據。原話上的讀者ID保留，講記另用study01命名空間。

講記每句start/end取其所據連續原話區間的首/末界，明標source-window，不是字數插值，也不宣稱精煉句逐字聲學精準。此前200句聲學範圍/146句疑義是原話版本的狀態，不能冒稱新講記81句的逐字通過數。待核項目不因改寫變為人工已確認。

## 導讀與歸屬

新導讀由Codex按新講記編輯，GX10本地Qwen逐點檢查。不得假稱新MiniMax生成。既有validator只允許MiniMax與舊敏感詞例外，新增source-bound study-guide歸屬：須明標study-guide、原話來源SHA與meta一致、審查SHA與當前正文一致；引句與審查各條目驗證不變。測試同時拒絕無來源SHA或非講記的假歸屬。

局部模型只用GX10 localhost8001；本次有限共5次導讀審查/補審，最終完整6條通過。最終實際request/response及第一版拒絕、補審回應保留；中間兩次同檔快取被後次覆蓋，未冒稱保有每一中間payload。非盲測、非人工gold；Codex和缺失的中間token usage為unknown，不作節省率主張。

## 重建與驗證

先有故意RED的講記契約，再實作。`node scripts/publish_ruzhong01_study.mjs --candidate`只寫work候選；正式指令需匹配當前導讀審查，且只能覆寫既知來源或一致成果，拒絕未知正文漂移。

完整測試：npm test、npm run test:v2、summaries:audit、goldenStandard、Vite build、精確site artifact與正式Pages桌面/手機瀏覽器契約；另以真正音源測首末原生播放。工程通過不等於人工已核定。發布待閱校，humanListened=false。

## 2026-10-26 講者直接論述口吻修訂

使用者指出研讀正文應依格西論述方式整理，不使用第三者語氣。本次逐段將「格西指出／他認為」改為直接的「我／我們／你看」與問答，保留比較能力自限、同學提供解釋、「不知道／可能有」等來源中的保留。底本補列維持【編者註】，不裝成講者新說法。30段81單元與完整346句原話、ID、時間均未改動。

原話來源snapshot不變；plan明記先前發布正文digest，publisher只另接受這個已知版本，未知來源仍拒絕。日期與course metadata同步2026-10-26。新導讀重新綁定並做兩次限定本地審查，voice-*保存實際request/response，先前證據仍在前版commit可追溯。新增先RED再GREEN的講者口吻回歸，並經獨立內容覆核。

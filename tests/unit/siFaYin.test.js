/**
 * tests/unit/siFaYin.test.js
 *
 * 《四法印》（si-fa-yin）課程上線閘門。
 *
 * 這門課的特殊之處在於「有官方底本」：講師在每講 YouTube 描述提供官方整編逐字稿 PDF
 * 與官方音檔。因此本測試不只驗 schema，還驗：
 *   1. 時間碼全部來自 ASR（不得用底本推算時間）。
 *   2. 段落小標來自官方附時間碼提綱（不得猜小標）。
 *   3. 自動校字只允許同音／近音字替換，且 rawText 保留 ASR 原樣。
 *   4. 官方底本的 SHA-256 與 intake manifest 一致，且 grounding.json 有登記。
 *   5. catalog.json 與 src/stores/course.ts 兩處註冊都在（最常見漏改）。
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const courseDir = path.join(repoRoot, 'courses', '四法印');
const evidenceRoot = path.join(repoRoot, 'reviews', 'evidence', 'sifayin');
const SESSION_IDS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11'];
const PLAYLIST_ID = 'PLMngxNMnjFcPB4eYNHrOUdCgh__7hF2hl';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256File = (file) => 'sha256:' + createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const SIMPLIFIED_CHARS = new Set([
  '为', '这', '样', '个', '说', '体', '经', '论', '门', '从', '对', '么', '后', '变', '实', '证',
  '觉', '关', '开', '边', '过', '问', '题', '时', '间', '还', '会', '点', '现', '显', '义', '极',
  '胜', '广', '当', '无', '师', '发', '与', '见', '随', '应', '处', '观', '摄', '识', '别', '业',
  '释', '难', '车', '声', '闻', '缘', '执', '许', '计', '总', '种', '听', '讲', '话', '导', '读',
  '记', '诵', '传', '萨', '罗', '蜜', '辩', '净', '谛', '学', '习', '态', '灵', '产', '亲',
]);

test('四法印 course.json registers the series with the verified instructor and official playlist', () => {
  const course = readJson(path.join(courseDir, 'course.json'));

  assert.equal(course.courseId, 'si-fa-yin');
  assert.equal(course.title, '四法印');
  assert.equal(course.master, '如性法師');
  assert.equal(course.instructor, '如性法師');
  assert.equal(course.totalSessions, 11);
  assert.equal(course.sessions.length, 11);
  assert.equal(course.publicationState, 'candidate-review-required');
  assert.match(course.sourcePlaylist, new RegExp(PLAYLIST_ID));
  assert.equal(course.transcriptPublicationState, 'candidate-review-required');
  assert.equal(course.qualityReview.humanProofread, false);
  assert.ok(course.qualityReview.readerNotice.includes('官方整編逐字稿'));
  // 未人工逐句聽核前不得號稱 published
  for (const entry of course.sessions) {
    assert.equal(entry.publicationState, 'candidate-review-required', `${entry.sessionId} 必須維持待閱校`);
    assert.ok(fs.existsSync(path.join(repoRoot, entry.jsonUrl)), `${entry.jsonUrl} 必須存在`);
  }
});

test('toc.json lists all 11 lectures with the video ids from the official playlist inventory', () => {
  const toc = readJson(path.join(courseDir, 'toc.json'));
  const inventory = fs.readFileSync(path.join(evidenceRoot, 'playlist_inventory.tsv'), 'utf8')
    .split('\n').filter(Boolean).map((line) => {
      const [videoId, durationSec, title] = line.split('|');
      return { videoId, durationSec: Number(durationSec), title };
    });

  assert.equal(inventory.length, 11);
  assert.equal(toc.sections.length, 11);
  assert.equal(toc.lecturer, '如性法師');
  assert.deepEqual(toc.sections.map((s) => s.videoId), inventory.map((s) => s.videoId));
  toc.sections.forEach((section, index) => {
    assert.match(section.videoId, /^[A-Za-z0-9_-]{11}$/);
    // 官方 MP3 與 YouTube 講次長度可能差 1 秒（容器取整），容許 ±2 秒
    assert.ok(Math.abs(section.durationSec - inventory[index].durationSec) <= 2,
      `${section.id} 秒數須與播放列表一致（${section.durationSec} vs ${inventory[index].durationSec}）`);
    assert.equal(section.available, true);
    assert.ok(fs.existsSync(path.join(repoRoot, section.sessionRef)), `${section.sessionRef} 必須存在`);
    assert.ok(section.title.length > 2);
  });
});

test('both registration points (catalog.json and src/stores/course.ts) list si-fa-yin', () => {
  const catalog = readJson(path.join(repoRoot, 'courses', 'catalog.json'));
  const entry = catalog.courses.find((course) => course.id === 'si-fa-yin');
  assert.ok(entry, 'courses/catalog.json 必須登記 si-fa-yin');
  assert.equal(entry.path, 'courses/四法印');
  assert.equal(entry.totalSessions, 11);
  assert.match(entry.playlistUrl, new RegExp(PLAYLIST_ID));

  const store = fs.readFileSync(path.join(repoRoot, 'src', 'stores', 'course.ts'), 'utf8');
  assert.match(store, /id:\s*'si-fa-yin'/, 'src/stores/course.ts 的硬編碼 catalog 必須加入 si-fa-yin');
  assert.match(store, /path:\s*'courses\/四法印'/);

  // App.vue 對每門課都渲染 correction-dates 連結，缺檔會 404
  const dates = fs.readFileSync(path.join(courseDir, 'correction-dates.html'), 'utf8');
  assert.equal((dates.match(/<tr><th scope="row">/g) || []).length, 11);
  assert.match(dates, /待閱校版/);
});

test('every session follows the canonical transcript contract with ASR-only timecodes', () => {
  for (const sessionId of SESSION_IDS) {
    const session = readJson(path.join(courseDir, 'sessions', `session_${sessionId}.json`));
    const rawAsr = readJson(path.join(evidenceRoot, `playlist-${sessionId}`, 'raw_asr.json'));

    assert.equal(session.sessionId, `session_${sessionId}`);
    assert.equal(session.mediaType, 'video/youtube');
    assert.ok(session.youtubeVideoId);
    assert.equal(session.publicationState, 'candidate-review-required');
    assert.equal(session._meta.noBaseText, false, '本課程有官方底本');
    assert.ok(session._meta.baseText.includes(`lecture_${sessionId}.txt`));
    assert.ok(fs.existsSync(path.join(repoRoot, session._meta.baseText)), '底本檔必須在 repo 內');

    const sentences = session.paragraphs.flatMap((p) => p.sentences);
    assert.equal(session._meta.total_paragraphs, session.paragraphs.length, `${sessionId} 段落總數不符`);
    assert.equal(session._meta.total_sentences, sentences.length, `${sessionId} 句子總數不符`);
    assert.ok(session.paragraphs.length >= 3, `${sessionId} 至少要有官方提綱的段落數`);

    let previousEnd = 0;
    for (const paragraph of session.paragraphs) {
      assert.ok(paragraph.id && paragraph.heading, `${sessionId} 段落缺 id／小標`);
      const inner = paragraph.sentences;
      assert.ok(inner.length > 0, `${sessionId} ${paragraph.id} 段落是空的`);
      assert.ok(Math.abs(paragraph.start - inner[0].start) < 0.05, `${sessionId} ${paragraph.id} start 未對齊首句`);
      assert.ok(Math.abs(paragraph.end - inner[inner.length - 1].end) < 0.05, `${sessionId} ${paragraph.id} end 未對齊末句`);
      for (const sentence of inner) {
        assert.ok(sentence.text.trim().length > 0, `${sessionId} ${sentence.id} 空白句`);
        assert.equal(typeof sentence.reviewNeeded, 'boolean');
        assert.ok(sentence.rawText.length > 0);
        assert.ok(sentence.end >= sentence.start);
        assert.ok(sentence.start >= previousEnd - 0.05, `${sessionId} ${sentence.id} 時間碼倒退`);
        previousEnd = sentence.end;
      }
    }

    // 時間碼與 ASR 證據一一對應（只允許整句發語詞被丟棄）
    const asrById = new Map(rawAsr.segments.map((seg) => [seg.id, seg]));
    let dropped = 0;
    for (const sentence of sentences) {
      const seg = asrById.get(sentence.rawAsrSegmentId);
      assert.ok(seg, `${sessionId} ${sentence.id} 找不到對應 ASR 片段`);
      assert.ok(Math.abs(sentence.start - seg.start) < 0.05, `${sessionId} ${sentence.id} start 偏離 ASR`);
      assert.ok(Math.abs(sentence.end - seg.end) < 0.05, `${sessionId} ${sentence.id} end 偏離 ASR`);
    }
    dropped = rawAsr.segments.length - sentences.length;
    assert.ok(dropped >= 0 && dropped / rawAsr.segments.length < 0.05,
      `${sessionId} 丟棄的 ASR 片段比例過高：${dropped}/${rawAsr.segments.length}`);

    // 存疑句只能是低比例，不得全講標紅
    const flagged = sentences.filter((s) => s.reviewNeeded).length;
    assert.ok(flagged / sentences.length < 0.05, `${sessionId} reviewNeeded 比例過高：${flagged}/${sentences.length}`);
    assert.equal(session._meta.correctionsPending, flagged, `${sessionId} correctionsPending 與實際標記不符`);

    // 音檔完整性：ASR 是照官方音檔跑的，SHA-256 與時長都要對得上
    const manifest = readJson(path.join(evidenceRoot, 'intake_manifest.json')).sessions[sessionId];
    assert.equal(rawAsr.audioSha256, manifest.audioSha256, `${sessionId} 音檔 SHA-256 與 intake 不符`);
    assert.ok(Math.abs(rawAsr.audioDurationSec - manifest.audioDurationSec) < 0.01);
    assert.ok(rawAsr.tailGapSec < 60, `${sessionId} 尾部缺段 ${rawAsr.tailGapSec}s`);
    assert.ok(rawAsr.realtimeFactor < 0.4, `${sessionId} ASR RTF 異常：${rawAsr.realtimeFactor}`);
  }
});

test('paragraph headings come from the official timestamped course outline', () => {
  for (const sessionId of SESSION_IDS) {
    const outline = readJson(path.join(evidenceRoot, `playlist-${sessionId}`, 'outline.json'));
    const session = readJson(path.join(courseDir, 'sessions', `session_${sessionId}.json`));

    assert.ok(outline.sections.length >= 3, `${sessionId} 官方提綱段數異常`);
    const headings = session.paragraphs.map((p) => p.heading);
    assert.deepEqual(headings, outline.sections.map((s) => s.heading), `${sessionId} 小標必須等於官方提綱`);
    for (const [index, paragraph] of session.paragraphs.entries()) {
      assert.ok(Math.abs(paragraph.start - outline.sections[index].startSec) < 120,
        `${sessionId} ${paragraph.id} 起點與官方提綱時間差過大`);
    }
  }
});

test('proofreading is evidence-based: only homophone fixes auto-applied, rawText kept, base text hashes verified', () => {
  const manifest = readJson(path.join(evidenceRoot, 'intake_manifest.json')).sessions;

  for (const sessionId of SESSION_IDS) {
    const candidates = readJson(path.join(evidenceRoot, `playlist-${sessionId}`, 'correction_candidates.json'));
    const session = readJson(path.join(courseDir, 'sessions', `session_${sessionId}.json`));
    const sentences = session.paragraphs.flatMap((p) => p.sentences);
    const byId = new Map(sentences.map((s) => [s.id, s]));

    assert.equal(candidates.sessionId, `session_${sessionId}`);
    assert.equal(candidates.appliedCount, candidates.applied.length, `${sessionId} applied 計數不符`);

    let matchedApplied = 0;
    for (const fix of candidates.applied) {
      const sentence = byId.get(fix.sentenceId);
      assert.ok(sentence, `${sessionId} 校正句 ${fix.sentenceId} 不在 session 內`);
      assert.ok(sentence.text.includes(fix.referenceDelta), `${sessionId} ${fix.sentenceId} 校正未套用到 text`);
      // rawText 必須留住 ASR 原貌：校正前後 text ≠ rawText，且單字差時 ASR 原字還在 rawText
      assert.notEqual(sentence.rawText, sentence.text, `${sessionId} ${fix.sentenceId} rawText 應保留 ASR 原樣`);
      assert.ok(sentence.rawText.includes(fix.asrDelta), `${sessionId} ${fix.sentenceId} rawText 未保留 ASR 差字`);
      // 位置級查核：compStart/compEnd 是「可比對字串」（只剩中日韓字）的索引，
      // 所以去標點後的 rawText/text 在同一索引必須分別是 ASR 原字與底本字。
      const hanOnly = (t) => t.replace(/[^\p{Script=Han}]/gu, '');
      const rawHan = hanOnly(sentence.rawText);
      const textHan = hanOnly(sentence.text);
      const span = fix.compEnd - fix.compStart;
      assert.equal(span, fix.asrDelta.length, `${sessionId} ${fix.sentenceId} compStart/End 與 asrDelta 長度不符`);
      assert.equal(rawHan.slice(fix.compStart, fix.compEnd), fix.asrDelta,
        `${sessionId} ${fix.sentenceId} rawText 該位置非 ASR 原字`);
      assert.equal(textHan.slice(fix.compStart, fix.compEnd), fix.referenceDelta,
        `${sessionId} ${fix.sentenceId} text 該位置非底本字`);
      assert.ok(Math.max(fix.asrDelta.length, fix.referenceDelta.length) <= 6,
        `${sessionId} 單次校字改動過大：${fix.asrDelta}→${fix.referenceDelta}`);
      matchedApplied += 1;
    }
    assert.equal(candidates.appliedCount, session._meta.correctionsAutoApplied,
      `${sessionId} _meta.correctionsAutoApplied 與證據不符`);
    assert.ok(matchedApplied === candidates.appliedCount);

    // 底本檔的雜湊必須與 intake 一致（防呆：資料被換過要顯式失敗）。
    // 官方 PDF 依 .gitignore 不入庫，故只驗其記錄值格式。
    assert.equal(sha256File(path.join(repoRoot, manifest[sessionId].referenceText)), manifest[sessionId].referenceTextSha256,
      `${sessionId} 底本 SHA-256 不符`);
    assert.match(manifest[sessionId].referenceSha256, /^sha256:[0-9a-f]{64}$/);
    assert.ok(manifest[sessionId].referencePdf.endsWith(`playlist-${sessionId}/reference_official.pdf`));
  }
});

test('grounding.json (Step 0) is complete and lists the 11 official base texts', () => {
  const grounding = readJson(path.join(courseDir, 'grounding.json'));

  assert.equal(grounding.courseId, 'si-fa-yin');
  assert.ok(grounding.verified_at);
  assert.ok(grounding.step0_entity_grounding);
  assert.equal(grounding.entities.instructor.name, '如性法師');
  assert.match(grounding.entities.channel.playlist_url, new RegExp(PLAYLIST_ID));
  assert.equal(grounding.reference_materials.length, 11);
  for (const ref of grounding.reference_materials) {
    assert.ok(ref.referenceId);
    assert.ok(ref.retrieved_at);
    assert.ok(ref.sha256);
    assert.ok(fs.existsSync(path.join(repoRoot, ref.local_path)), `${ref.referenceId} local_path 不存在`);
  }
  assert.ok(grounding.high_frequency_doctrinal_terms.length >= 20);
  const coreTerms = new Set(grounding.high_frequency_doctrinal_terms.map((t) => t.term));
  for (const term of ['四法印', '諸行無常', '有漏皆苦', '諸法無我', '涅槃寂靜']) {
    assert.ok(coreTerms.has(term), `核心名相缺漏：${term}`);
  }
  assert.ok(grounding.observed_homophone_corrections.length > 0, '必須有實測的同音校正對');
  assert.ok(grounding.alignment_method.correction_policy.includes('同音'));
  assert.ok(fs.existsSync(path.join(evidenceRoot, 'reference', 'README.md')));
});

test('learned_corrections.json only carries pairs attested in the official base texts', () => {
  const learned = readJson(path.join(courseDir, 'learned_corrections.json'));
  assert.equal(learned._metadata.courseId, 'si-fa-yin');
  assert.ok(learned._metadata.derivedFrom.includes('correction_candidates.json'));

  const corpus = SESSION_IDS
    .map((id) => fs.readFileSync(path.join(courseDir, 'source_text', `lecture_${id}.txt`), 'utf8'))
    .join('');
  const terms = Object.entries(learned.global_terms);
  assert.ok(terms.length >= 10, `術語庫過小：${terms.length}`);
  for (const [asrForm, entry] of terms) {
    assert.ok(entry.corrected && entry.reasoning && entry.category, `${asrForm} 缺佐證欄位`);
    assert.ok(corpus.includes(entry.corrected), `${asrForm}→${entry.corrected} 底本查無此詞`);
    assert.ok(!corpus.includes(asrForm) || asrForm === entry.corrected,
      `${asrForm} 在底本已存在，不得自動改寫`);
  }
});

test('every session carries a reviewed contentOverview whose quotes are verbatim in the transcript', () => {
  for (const sessionId of SESSION_IDS) {
    const session = readJson(path.join(courseDir, 'sessions', `session_${sessionId}.json`));
    const overview = session.contentOverview;
    assert.ok(overview, `${sessionId} 缺 contentOverview`);
    assert.equal(overview.status, 'ai-reviewed', `${sessionId} contentOverview 未經審閱`);
    assert.equal(overview.sourceTranscriptId, `四法印/session_${sessionId}`);
    assert.ok(['eNeural-glm53-flash', 'MiniMax-M3'].includes(overview.generatedBy), `${sessionId} generatedBy 非法`);
    assert.ok(overview.mainPoints.length >= 3, `${sessionId} 要點過少`);
    assert.ok(overview.discussionTopics.length >= 2, `${sessionId} 研討題目過少`);

    const byId = new Map(session.paragraphs.flatMap((p) => p.sentences).map((s) => [s.id, s.text]));
    for (const group of ['mainPoints', 'discussionTopics', 'referenceViews']) {
      for (const item of overview[group] || []) {
        assert.ok(item.evidence?.length >= 2, `${sessionId} ${group} 證據不足`);
        for (const evidence of item.evidence) {
          const text = byId.get(evidence.sentenceId);
          assert.ok(text !== undefined, `${sessionId} 證據句 ${evidence.sentenceId} 不存在`);
          assert.ok(text.includes(evidence.quote), `${sessionId} 證據非逐字：${evidence.quote}`);
        }
      }
    }
  }
});

test('every session carries the six-file evidence set with gate results', () => {
  for (const sessionId of SESSION_IDS) {
    const dir = path.join(evidenceRoot, `playlist-${sessionId}`);
    for (const file of ['raw_asr.json', 'candidate.json', 'correction_candidates.json',
      'content_review.json', 'content_review_manifest.json', 'run_manifest.json', 'review.md']) {
      assert.ok(fs.existsSync(path.join(dir, file)), `${sessionId} 缺證據檔 ${file}`);
    }

    const manifest = readJson(path.join(dir, 'run_manifest.json'));
    assert.equal(manifest.courseId, 'si-fa-yin');
    assert.ok(manifest.models.some((m) => m.role === 'asr'));
    assert.ok(manifest.models.some((m) => m.role === 'correction-rule'));
    assert.ok(manifest.models.some((m) => m.role === 'overview'));
    assert.ok(manifest.gates.charRatio >= 0.6, `${sessionId} 字/秒過低：${manifest.gates.charRatio}`);
    assert.equal(manifest.gates.charRatioPass, true);
    assert.equal(manifest.gates.paragraphsMatchOutline, true);
    assert.equal(manifest.gates.humanListened, false, '未經人工聽核不得宣稱 listened');
    assert.equal(manifest.gates.audioShaMatchesIntake, true);
    assert.equal(manifest.gates.tailGapSec < 60, true);

    const reviewManifest = readJson(path.join(dir, 'content_review_manifest.json'));
    assert.equal(reviewManifest.evidenceValidation.unsupported, 0, `${sessionId} contentOverview 有無證據要點`);
    assert.ok(reviewManifest.counts.mainPoints >= 3);

    // review.md 必須記錄存疑句，讓人工接手時不用從頭猜
    const reviewMd = fs.readFileSync(path.join(dir, 'review.md'), 'utf8');
    assert.match(reviewMd, /需人工聽核的句子/);
    assert.match(reviewMd, /自動套用之校字/);
  }
});

test('四法印 transcripts are pure traditional Chinese with no prompt leakage or filler-only rows', () => {
  const PROMPT_LEAK = [/Here is the/i, /```json/i, /【輸出】/, /校對完成/];
  const PUNCT_ONLY = /^[\s，。！？、；：「」『』（）—….、\-]+$/;

  for (const sessionId of SESSION_IDS) {
    const raw = fs.readFileSync(path.join(courseDir, 'sessions', `session_${sessionId}.json`), 'utf8');
    const simplified = [...new Set([...raw].filter((ch) => SIMPLIFIED_CHARS.has(ch)))];
    assert.deepEqual(simplified, [], `${sessionId} 含簡體字：${simplified.join('')}`);

    const session = JSON.parse(raw);
    for (const paragraph of session.paragraphs) {
      for (const pattern of PROMPT_LEAK) {
        assert.ok(!pattern.test(paragraph.heading || ''), `${sessionId} 小標疑似 prompt 外洩`);
      }
      for (const sentence of paragraph.sentences) {
        for (const pattern of PROMPT_LEAK) {
          assert.ok(!pattern.test(sentence.text), `${sessionId} ${sentence.id} 疑似 prompt 外洩`);
        }
        assert.ok(!PUNCT_ONLY.test(sentence.text), `${sessionId} ${sentence.id} 只有標點`);
        assert.ok(!/[\uFFFD]/.test(sentence.text), `${sessionId} ${sentence.id} 含替換字元`);
      }
    }
  }
});

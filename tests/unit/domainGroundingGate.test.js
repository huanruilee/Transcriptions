import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Step 0 前置關卡（Domain Grounding Gate）
 *
 * 依 docs/TRANSCRIPTION_WORKFLOW.md §3：
 *   「未完成本節 Step 0 的三項強制檢索與知識包產出，不得開始任何講次的校對或轉寫。」
 *   「沒有 grounding.json 的課程視為未完成 Step 0。」
 *
 * 本測試讓「先找來源」成為可被 CI 攔截的關卡，而不是只能靠人記得。
 *
 * 課程若尚未進入校對流程，可在本檔的 PENDING_WHITELIST 中登記事由。
 */

const ROOT = process.cwd();
const COURSES_DIR = path.join(ROOT, 'courses');
const EVIDENCE_DIR = path.join(ROOT, 'reviews/evidence');
const SELF_PATH = 'tests/unit/domainGroundingGate.test.js';

/** 尚未進入校對流程的課程；一旦開始校對必須從此清單移除 */
const PENDING_WHITELIST = {
  '入中論善顯密意疏': '既有逐字稿已完成；本次未重做流程，Step 0 產物待補。',
  '三主要道': '既有逐字稿已完成；本次未重做流程，Step 0 產物待補。',
  '釋量論第二品': '既有逐字稿已完成；本次未重做流程，Step 0 產物待補。',
};
/** 課程目錄名 → reviews/evidence/ 下的目錄名（兩者不一定同名） */
const EVIDENCE_DIR_ALIAS = {
  '四念住': 'sinianzhu',
  '四法印': 'sifayin',
};

function evidenceDirFor(course) {
  const alias = EVIDENCE_DIR_ALIAS[course];
  for (const c of [alias, course].filter(Boolean)) {
    const p = path.join(EVIDENCE_DIR, c);
    if (fs.existsSync(p)) return p;
  }
  return path.join(EVIDENCE_DIR, alias || course);
}

/** 允許的「名相對照表」欄位名（不同課程版本命名略有差異） */
const TERM_FIELDS = [
  'high_frequency_doctrinal_terms',
  'high_frequency_terms',
  'terminology',
  'doctrinal_terms',
];

/** 允許的「來源清單」欄位名 */
const REF_FIELDS = ['reference_materials', 'references', 'reference_inventory'];

/** 欄位可能放在頂層或 entities 底下（各課程版本放置位置不一） */
function pickField(obj, fields, alsoInEntities = true) {
  for (const f of fields) {
    if (Array.isArray(obj[f]) && obj[f].length > 0) return { name: f, value: obj[f] };
  }
  if (alsoInEntities && obj.entities && typeof obj.entities === 'object') {
    for (const f of fields) {
      if (Array.isArray(obj.entities[f]) && obj.entities[f].length > 0) {
        return { name: `entities.${f}`, value: obj.entities[f] };
      }
    }
  }
  return null;
}

function listCourses() {
  if (!fs.existsSync(COURSES_DIR)) return [];
  return fs.readdirSync(COURSES_DIR)
    .filter((name) => {
      const full = path.join(COURSES_DIR, name);
      return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'sessions'));
    });
}

test('每個有 sessions/ 的課程都有 grounding.json（Step 0 前置關卡）', () => {
  const courses = listCourses();
  assert.ok(courses.length > 0, '找不到任何含 sessions/ 的課程');

  const missing = [];
  for (const name of courses) {
    const grounding = path.join(COURSES_DIR, name, 'grounding.json');
    if (fs.existsSync(grounding)) continue;
    if (PENDING_WHITELIST[name]) continue;   // 已登記：尚未進入校對流程
    missing.push(name);
  }

  assert.deepEqual(missing, [],
    '缺少 courses/<course>/grounding.json 的課程（Step 0 未完成，不得開始校對）：\n  '
    + missing.join('\n  ')
    + '\n\n若該課程確實尚未進入校對流程，請在 ' + SELF_PATH
    + ' 的 PENDING_WHITELIST 登記事由。');
});

test('PENDING_WHITELIST 不得含已擁有 grounding.json 的課程', () => {
  const stale = [];
  for (const name of Object.keys(PENDING_WHITELIST)) {
    const grounding = path.join(COURSES_DIR, name, 'grounding.json');
    if (fs.existsSync(grounding)) stale.push(name);
  }
  assert.deepEqual(stale, [],
    '下列課程已有 grounding.json，應從 PENDING_WHITELIST 移除：\n  ' + stale.join('\n  '));
});

test('grounding.json 結構完整且含來源清單', () => {
  const courses = listCourses();
  for (const name of courses) {
    const groundingPath = path.join(COURSES_DIR, name, 'grounding.json');
    if (!fs.existsSync(groundingPath)) continue;

    const g = JSON.parse(fs.readFileSync(groundingPath, 'utf8'));

    assert.ok(g.courseId, `${name}: grounding.json 缺 courseId`);
    assert.ok(g.verified_at, `${name}: grounding.json 缺 verified_at`);

    assert.ok(g.entities, `${name}: grounding.json 缺 entities`);
    if (g.entities.instructor) {
      assert.ok(g.entities.instructor.name, `${name}: entities.instructor 缺 name`);
    }

    const terms = pickField(g, TERM_FIELDS);
    assert.ok(terms, `${name}: 缺少名相對照表欄位（可接受：${TERM_FIELDS.join(' / ')}）`);

    // 完整 Step 0 知識包（含來源清單）只強制於新式 grounding.json
    //（以 step0_entity_grounding / alignment_method 標記辨識，2026-11 四念住起導入）。
    // 舊版 grounding.json 僅有人員／術語 grounding，補來源清單前不阻擋 CI。
    const isStep0Pack = Boolean(g.step0_entity_grounding || g.alignment_method);
    const refs = pickField(g, REF_FIELDS);
    if (isStep0Pack) {
      assert.ok(refs, `${name}: 缺少來源清單欄位（可接受：${REF_FIELDS.join(' / ')}）`);
    }
    if (!refs) continue;

    for (const ref of refs.value) {
      assert.ok(ref.referenceId || ref.id, `${name}: reference 缺 referenceId/id`);
      assert.ok(ref.retrieved_at || ref.retrievedAt,
        `${name}: reference ${ref.referenceId || ref.id} 缺 retrieved_at`);
      assert.ok(ref.url || ref.local_path || ref.localPath,
        `${name}: reference ${ref.referenceId || ref.id} 必須有 url 或 local_path`);
    }
  }
});

test('有整編講記的課程：參考資料 inventory 存在且附 SHA256', () => {
  const courses = listCourses();
  for (const name of courses) {
    const groundingPath = path.join(COURSES_DIR, name, 'grounding.json');
    if (!fs.existsSync(groundingPath)) continue;

    const g = JSON.parse(fs.readFileSync(groundingPath, 'utf8'));
    const refs = pickField(g, REF_FIELDS);
    if (!refs) continue;

    const hasEditedText = refs.value.some((r) => r.type === 'edited-text-reference');
    if (!hasEditedText) continue;

    const inventory = path.join(evidenceDirFor(name), 'reference/README.md');
    assert.ok(fs.existsSync(inventory),
      `${name}: 有 edited-text-reference 但缺少參考資料 inventory：${path.relative(ROOT, inventory)}`);

    for (const ref of refs.value) {
      const localPath = ref.local_path || ref.localPath;
      if (!localPath) continue;
      const p = path.join(ROOT, localPath);
      assert.ok(fs.existsSync(p),
        `${name}: reference ${ref.referenceId || ref.id} 的 local_path 不存在：${localPath}`);
      assert.ok(ref.sha256, `${name}: reference ${ref.referenceId || ref.id} 缺 sha256`);
    }
  }
});

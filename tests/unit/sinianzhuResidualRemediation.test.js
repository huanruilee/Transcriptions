import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = process.cwd();
const SESSIONS_DIR = path.join(ROOT, 'courses/四念住/sessions');
const SESSION_IDS = Array.from({ length: 8 }, (_, i) => 'session_' + String(i + 1).padStart(2, '0'));

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function loadSessions() {
  return SESSION_IDS.map((id) => ({ id, data: readJson(path.join(SESSIONS_DIR, id + '.json')) }));
}

// Residual garbling patterns that the 2026-11 Stage 5 lecture-note correction missed.
// Each entry was adjudicated against the 《四念住講記》 base text (T0209_01..08, ftp.budaedu.org)
// with per-edit evidence recorded in reviews/evidence/sinianzhu/residual_repair_ledger.json.
const BLACKLIST = [
  '據史論','遇歉時的論','大致論','大致的論','龍樹夫社','佑伯居多','楞燕',
  '白骨關','九祥關','九響觀','百五觀','不禁觀','不敬官','御節燈',
  '修官','官慧','官密','官法','用官','波爾','興森','森波','布林波羅蜜','伯羅蕊',
  '摩沙','摩哈喀','泡沙','水源鏡','索元','鎖元','出席入席','竹之頂',
  '退死','無露','德無聲','史詩','淫天','十年珠','聖念珠','居子',
  '唸','痴','慾','玉','嘆','説','惡鬼',
  '等角之','的角之','角質','宰法','尋伺觀','隨矣','心形','瀑啟',
  '貪聖池','處障','處中比比','由念入心','額空','額不可得','觀俄','一些法',
  '術疾','樹極','轉意。','轉逆','到何正正','發作紙',
  '偉大的一定','有失禪','捨生纖維','輕瘀','慈禧念','元氣觀','職關','修職',
  '四年度','念著','比比','福心','相符其心','烏鵝','計鵝','鵝','念燈','當之一二','能治了之','，，',
];

test('四念住 published text is free of residual garbled terms (base-text adjudicated)', () => {
  const failures = [];
  for (const { id, data } of loadSessions()) {
    for (const p of data.paragraphs) {
      for (const s of p.sentences || []) {
        for (const term of BLACKLIST) {
          if ((s.text || '').includes(term)) {
            failures.push(`${id}:${s.id} contains "${term}" in text: ${s.text.slice(0, 40)}`);
          }
        }
      }
    }
  }
  assert.deepEqual(failures.slice(0, 25), [], `Residual garbling in published text (${failures.length} total):\n${failures.slice(0, 25).join('\n')}`);
});

test('四念住 rawText (ASR evidence) is preserved untouched', () => {
  for (const { id, data } of loadSessions()) {
    for (const p of data.paragraphs) {
      for (const s of p.sentences || []) {
        assert.ok(typeof s.rawText === 'string' && s.rawText.length > 0, `${id}:${s.id} rawText must remain`);
      }
    }
  }
});

test('四念住 _meta counts match live paragraph/sentence counts', () => {
  for (const { id, data } of loadSessions()) {
    const paras = data.paragraphs;
    const segs = paras.flatMap((p) => p.sentences || []);
    assert.equal(data._meta?.total_paragraphs, paras.length, `${id} _meta.total_paragraphs`);
    assert.equal(data._meta?.total_sentences, segs.length, `${id} _meta.total_sentences`);
  }
});

test('四念住 reviewNeeded only remains on the adjudicated unresolved ledger (no stale flags)', () => {
  // Stage 5/6 base-text verified sentences must not keep reviewNeeded=true
  // (precedent: session28AnchorRegression "corrected sentences must not have reviewNeeded=true").
  const ledger = readJson(path.join(ROOT, 'reviews/evidence/sinianzhu/unresolved_sentences.json'));
  const unresolved = new Set(ledger.sentences.map((x) => `${x.sessionId}:${x.segId}`));
  for (const { id, data } of loadSessions()) {
    for (const p of data.paragraphs) {
      for (const s of p.sentences || []) {
        const key = `${id}:${s.id}`;
        if (s.reviewNeeded === true) {
          assert.ok(unresolved.has(key), `${key} has reviewNeeded=true but is not in the unresolved ledger`);
        }
      }
    }
  }
});

test('四念住 contentOverview sourceDigest is re-anchored to the corrected transcript', async () => {
  const { computeSourceDigest } = await import('../../scripts/content_overview_pipeline.mjs');
  for (const { id, data } of loadSessions()) {
    const overview = data.contentOverview;
    if (!overview) continue;
    assert.equal(
      overview.sourceDigest,
      computeSourceDigest(data),
      `${id} overview.sourceDigest stale after text repair`,
    );
  }
});

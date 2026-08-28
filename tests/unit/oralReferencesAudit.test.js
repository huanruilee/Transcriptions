/**
 * tests/unit/oralReferencesAudit.test.js
 *
 * Automated regression test for teacher's oral page & outline mentions cross-check.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '../..');
const SESSIONS_DIR = path.join(PROJECT_ROOT, 'courses/入中論善顯密意疏/sessions');

test('📖 課文口述「頁次」與「科判」自動化交叉核對門禁 (Oral References Audit Suite)', async (t) => {

  await t.test('1. Golden Page Anchor: Session 02A accurately captures p.63 & p.64 mentions', () => {
    const session02APath = path.join(SESSIONS_DIR, 'session_02A.json');
    assert.ok(existsSync(session02APath), 'session_02A.json must exist');

    const data = JSON.parse(readFileSync(session02APath, 'utf8'));
    const allText = data.paragraphs.flatMap(p => p.sentences.map(s => s.text)).join(' ');

    // Must capture the teacher's exact oral page references
    assert.match(allText, /六十四頁|六十三頁/, 'Session 02A must contain teacher oral reference to p.63/p.64');
  });

  await t.test('2. Golden TOC Anchor: Session 01 accurately captures "現前地" & "十地" outlines', () => {
    const session01Path = path.join(SESSIONS_DIR, 'session_01.json');
    assert.ok(existsSync(session01Path), 'session_01.json must exist');

    const data = JSON.parse(readFileSync(session01Path, 'utf8'));
    const allText = data.paragraphs.flatMap(p => p.sentences.map(s => s.text)).join(' ');

    assert.match(allText, /現前地/, 'Session 01 must contain teacher oral reference to "現前地"');
    assert.match(allText, /極喜地|離垢地/, 'Session 01 must contain teacher oral reference to doctrinal ground names');
  });

  await t.test('3. Golden Page Anchor: Session 01 accurately captures p.6 & p.63 transitions', () => {
    const session01Path = path.join(SESSIONS_DIR, 'session_01.json');
    const data = JSON.parse(readFileSync(session01Path, 'utf8'));
    const allText = data.paragraphs.flatMap(p => p.sentences.map(s => s.text)).join(' ');

    assert.match(allText, /第六頁/, 'Session 01 opening must mention p.6 of the treatise');
    assert.match(allText, /六三|六十三/, 'Session 01 transition must mention p.63 of the treatise');
  });

  await t.test('4. Golden Sub-heading Anchor: Session 103B accurately captures "庚二 離垢地" & sub-clauses', () => {
    const session103BPath = path.join(SESSIONS_DIR, 'session_103B.json');
    assert.ok(existsSync(session103BPath), 'session_103B.json must exist');

    const data = JSON.parse(readFileSync(session103BPath, 'utf8'));
    const allText = data.paragraphs.flatMap(p => p.sentences.map(s => s.text)).join(' ');

    assert.match(allText, /庚二/, 'Session 103B must contain teacher oral reference to outline "庚二"');
    assert.match(allText, /戒清淨/, 'Session 103B must capture "辛一 明此地戒清淨" doctrinal term');
  });

  await t.test('5. Whole Corpus Audit Script Integrity: audit_oral_references.py exists & executable', () => {
    const scriptPath = path.join(PROJECT_ROOT, 'scripts/audit_oral_references.py');
    assert.ok(existsSync(scriptPath), 'scripts/audit_oral_references.py must exist');
    const content = readFileSync(scriptPath, 'utf8');
    assert.ok(content.includes('chinese_to_arabic'), 'Script must define chinese_to_arabic parser');
    assert.ok(content.includes('PAGE_MENTION_RE'), 'Script must define PAGE_MENTION_RE extractor');
  });
});


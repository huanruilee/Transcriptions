import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts/onepass_proofread.py');

function runPy(code) {
  return execFileSync('python3', ['-c', code], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
}

test('normalize_speaker maps numbered students and legacy host label', () => {
  const out = runPy(`
import json, sys
sys.path.insert(0, "scripts")
from onepass_proofread import normalize_speaker
print(json.dumps([
    normalize_speaker("學員1"),
    normalize_speaker("學員12"),
    normalize_speaker("維那/主持"),
    normalize_speaker("如性法師"),
    normalize_speaker(""),
]))
`);
  assert.deepEqual(JSON.parse(out), ['學員', '學員', '主持', '如性法師', '學員']);
});

test('normalize_text_deterministic converts simplified chars and quotes while preserving URLs', () => {
  const out = runPy(`
import json, sys
sys.path.insert(0, "scripts")
from onepass_proofread import normalize_text_deterministic
sample = "这问题还没解决，请看“《聖天論師》”的回向與 https://youtube.com/watch?v=abc123&list=this。"
print(normalize_text_deterministic(sample))
`);
  assert.ok(out.includes('這問題還沒解決'));
  assert.ok(out.includes('「聖天論師」'));
  assert.ok(out.includes('迴向'));
  assert.ok(out.includes('https://youtube.com/watch?v=abc123&list=this'));
  assert.equal(/[这问题还没“”]/.test(out), false);
});

test('split_oversized_paragraphs splits >35 sentences into balanced <=35 paragraphs', () => {
  const out = runPy(`
import json, sys
sys.path.insert(0, "scripts")
from onepass_proofread import split_oversized_paragraphs
sents = [{"id": f"s{i}", "start": float(i), "end": float(i+1), "text": f"句{i}。"} for i in range(38)]
res = split_oversized_paragraphs([{"id": "p_0001", "speaker": "如性法師", "heading": "〔測試標題〕", "sentences": sents}], max_sents=35)
print(json.dumps({"count": len(res), "lens": [len(p["sentences"]) for p in res], "headings": [p.get("heading") for p in res], "speakers": [p["speaker"] for p in res]}))
`);
  const parsed = JSON.parse(out);
  assert.equal(parsed.count, 2);
  assert.ok(parsed.lens.every(n => n <= 35));
  assert.equal(parsed.lens[0] + parsed.lens[1], 38);
  assert.deepEqual(parsed.headings, ['〔測試標題〕', null]);
  assert.deepEqual(parsed.speakers, ['如性法師', '如性法師']);
});

test('throttle_dense_headings reduces 100% heading density to <= 45%', () => {
  const out = runPy(`
import json, sys
sys.path.insert(0, "scripts")
from onepass_proofread import throttle_dense_headings
paras = [{"id": f"p_{i}", "speaker": "如性法師", "heading": f"〔題{i}〕", "sentences": []} for i in range(10)]
res = throttle_dense_headings(paras, max_ratio=0.45)
kept = sum(1 for p in res if p.get("heading"))
print(json.dumps({"total": len(res), "kept": kept}))
`);
  const parsed = JSON.parse(out);
  assert.ok(parsed.kept / parsed.total <= 0.45);
});

test('assemble_corrected_chunks preserves rawText, timestamps, reviewNeeded=false, and coverage_pct', () => {
  const out = runPy(`
import json, sys
sys.path.insert(0, "scripts")
from onepass_proofread import assemble_corrected_chunks
base = {"id": "s02", "paragraphs": []}
segs = [
    {"id": "seg-1", "start": 1.0, "end": 2.5, "rawText": "礼静法师"},
    {"id": "seg-2", "start": 2.5, "end": 4.0, "rawText": "大家晚安"},
    {"id": "seg-3", "start": 4.0, "end": 5.0, "rawText": "嗯"},
]
chunk_out = "@PARA speaker=學員1 heading=〔開場〕\\n1-2|禮敬法師，大家晚安。\\n"
assembled, stats = assemble_corrected_chunks(base, segs, [chunk_out])
print(json.dumps({"assembled": assembled, "stats": stats}, ensure_ascii=False))
`);
  const parsed = JSON.parse(out);
  assert.equal(parsed.stats.coverage_pct, 66.67);
  assert.equal(parsed.stats.dropped_raw_segs, 1);
  assert.equal(parsed.assembled.paragraphs[0].speaker, '學員');
  assert.equal(parsed.assembled.paragraphs[0].sentences[0].rawText, '礼静法师大家晚安');
  assert.equal(parsed.assembled.paragraphs[0].sentences[0].start, 1.0);
  assert.equal(parsed.assembled.paragraphs[0].sentences[0].end, 4.0);
  assert.equal(parsed.assembled.paragraphs[0].sentences[0].reviewNeeded, false);
});

test('assemble_corrected_chunks accepts fallback idx|start-end|text format', () => {
  const out = runPy(`
import json, sys
sys.path.insert(0, "scripts")
from onepass_proofread import assemble_corrected_chunks
base = {"id": "s02", "paragraphs": []}
segs = [{"id": "seg-1", "start": 10.0, "end": 12.0, "rawText": "請大家合掌"}]
chunk_out = "@PARA speaker=主持\\n1|10.00-12.00|請大家合掌。\\n"
assembled, stats = assemble_corrected_chunks(base, segs, [chunk_out])
print(json.dumps({"assembled": assembled, "stats": stats}, ensure_ascii=False))
`);
  const parsed = JSON.parse(out);
  assert.equal(parsed.stats.format_error_count, 0);
  assert.equal(parsed.stats.coverage_pct, 100);
  assert.equal(parsed.assembled.paragraphs[0].sentences[0].text, '請大家合掌。');
});

test('check_locked_session rejects session_01.json', () => {
  const out = runPy(`
import sys
from pathlib import Path
sys.path.insert(0, "scripts")
from onepass_proofread import check_locked_session
try:
    check_locked_session(Path("."), Path("courses/2025釋量論第二品大組共學/sessions/session_01.json"))
    print("UNEXPECTED_OK")
except RuntimeError as e:
    print("BLOCKED:" + str(e))
`);
  assert.ok(out.startsWith('BLOCKED:Refusing to modify locked session'));
});

test('CLI --dry-run on study group session 02 renders prompt and exports 4 chunks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onepass-dry-'));
  try {
    const stdout = execFileSync(
      'python3',
      [SCRIPT, '--course', '2025釋量論第二品大組共學', '--session', '02', '--chunks', '4', '--work-dir', tmpDir, '--dry-run'],
      { cwd: ROOT, encoding: 'utf8' }
    );
    const info = JSON.parse(stdout);
    assert.equal(info.mode, 'dry-run');
    assert.equal(info.chunks, 4);
    assert.ok(info.rawSegments > 100);
    const rendered = fs.readFileSync(path.join(tmpDir, 'rendered_prompt.md'), 'utf8');
    assert.ok(rendered.includes('禮敬法師'));
    assert.ok(fs.existsSync(path.join(tmpDir, 'chunk_4.txt')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

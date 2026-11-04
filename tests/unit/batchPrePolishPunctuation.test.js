// Regression gate for scripts/batch_convert_all.py :: step2_pre_polish
//
// 背景（2026-11-04 巡檢實測）：
//   step2_pre_polish 的句尾標點處理只認「全形」標點，ASR 輸出夾雜「半形」逗號時：
//     (a) 開頭清理只 strip 全形『，』，半形『,』留在句首
//     (b) 句尾守衛只認全形標點，半形『,』被視為「沒有句尾標點」
//     (c) 補句尾標點前的 re.sub 只 strip 全形『，』，半形『,』留著
//   三者疊加 → append『。』後產生『X,.』／『X,。』的「逗號+句號」瑕疵。
//
//   實測證據：入中論 session_43A 的 verbatimSentences 有 147 筆、session_38B 有 1 筆，
//   全部集中在 verbatimSentences（機校原話對照層），且與上游 source-session.json
//   逐字相同 —— 證明瑕疵源自本管線的 step2_pre_polish，而非後續標點程式。
//   （全形『X，。』的另一實例：session_09A / session_99A，已於 PR #340 修正已發布資料。）
//
// 這個 gate 守住「未來新轉寫講次不會再產生同樣瑕疵」，
// 且不得改動 scripts/batch_convert_all.py 以外的任何檔案。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'batch_convert_all.py');

// 直接以 AST 抽出 step2_pre_polish 的函式來源，避免 import 整個模組
//（該模組在 import 期會建立連線端點與讀取音檔對照表，不適合單元測試）。
const EXTRACT_PY = `
import ast, sys, json
src = open(${JSON.stringify(SCRIPT)}, encoding='utf-8').read()
tree = ast.parse(src)
fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'step2_pre_polish')
# 把需要用到的 module-level 名稱一併抽成可獨立執行的片段
glossary = next((n for n in tree.body if isinstance(n, ast.Assign)
                 and any(getattr(t, 'id', None) == 'BUDDHIST_GLOSSARY' for t in n.targets)), None)
parts = [ast.get_source_segment(src, fn)]
if glossary is not None:
    parts.insert(0, ast.get_source_segment(src, glossary))
parts.insert(0, 'import re')
parts.append('def should_split(a, b, c, d): return True')
code = '\\n'.join(parts)
ns = {}
exec(compile(code, 'extract', 'exec'), ns)
print(json.dumps({'ok': True}, ensure_ascii=False))
`;

/**
 * 以抽取出的 step2_pre_polish 邏輯處理單句，回傳格式化後的文字。
 */
function polish(rawText) {
  const py = `
import json
${EXTRACT_PY}
fn = ns['step2_pre_polish']
out = fn([{'start': 0.0, 'end': 1.0, 'text': ${JSON.stringify(rawText)}}], dynamic_terms=None)
print(json.dumps(out[0]['text'] if out else ''))
`;
  const res = spawnSync('python3', ['-c', py], { encoding: 'utf8', cwd: ROOT });
  assert.equal(res.status, 0, `python3 抽取失敗：${res.stderr}`);
  return JSON.parse(res.stdout.trim().split('\n').pop());
}

test('batch_convert_all.py step2_pre_polish 句尾標點處理', async (t) => {
  await t.test('前置：能成功抽出 step2_pre_polish 並執行', () => {
    const check = spawnSync('python3', ['-c', EXTRACT_PY], { encoding: 'utf8', cwd: ROOT });
    assert.equal(check.status, 0, `抽取失敗：${check.stderr}`);
    assert.match(check.stdout, /"ok":\s*true/);
  });

  await t.test('半形逗號結尾不得產生「逗號+句號」（43A/38B 實測案例）', () => {
    // 這 5 筆是 session_43A / session_38B verbatimSentences 的真實樣本
    const cases = [
      ['自為通達為世,真實性, 這個就是通達為世的真實性, 這樣可以吧,', '自為通達為世,真實性, 這個就是通達為世的真實性, 這樣可以吧,'],
      [', 嗯, 六地菩薩修什麼, 從而就獲得七地嗎,', '六地菩薩修什麼, 從而就獲得七地嗎,'],
      ['通達為世,', '通達為世,'],
      ['那個還記得嗎,', '那個還記得嗎,'],
      ['菩薩修什麼什麼, 對不對,', '菩薩修什麼什麼, 對不對,'],
    ];
    for (const [input, expected] of cases) {
      const out = polish(input);
      assert.doesNotMatch(out, /[,，]\s*[。．]/, `仍產生「逗號+句號」：${JSON.stringify(input)} → ${JSON.stringify(out)}`);
      assert.equal(out, expected, `輸出不符預期：${JSON.stringify(input)}`);
    }
  });

  await t.test('全形逗號結尾同樣不得產生「逗號+句號」（09A/99A 同型缺陷）', () => {
    for (const input of ['已經有全形逗號了，', '這個呢，', '那個啦，']) {
      const out = polish(input);
      assert.doesNotMatch(out, /[,，]\s*[。．]/, `仍產生「逗號+句號」：${JSON.stringify(input)} → ${JSON.stringify(out)}`);
    }
  });

  await t.test('句尾已有標點者不得被重複附加（半形問號／驚嘆號）', () => {
    // 舊版會產生「嗎?？」與「啦!。」兩種混用瑕疵
    assert.equal(polish('半形問號嗎?'), '半形問號嗎?');
    assert.equal(polish('半形驚嘆啦!'), '半形驚嘆啦!');
    assert.doesNotMatch(polish('半形問號嗎?'), /[?？]\s*[?？]/);
    assert.doesNotMatch(polish('半形驚嘆啦!'), /[!！]\s*[。．]/);
  });

  await t.test('全形標點輸入維持原行為（不得回歸）', () => {
    const stable = [
      ['正常句子沒有逗號', '正常句子沒有逗號。'],
      ['已經有句號了。', '已經有句號了。'],
      ['這是問句嗎？', '這是問句嗎？'],
      ['這是驚嘆！', '這是驚嘆！'],
      ['嗯啊喔哦呃，正常開頭', '正常開頭。'],
      ['這是嗎', '這是嗎？'],
      ['這是啦', '這是啦。'],
      ['謝謝大家', ''],
      ['訂閱', ''],
    ];
    for (const [input, expected] of stable) {
      assert.equal(polish(input), expected, `全形輸入行為改變：${JSON.stringify(input)}`);
    }
  });

  await t.test('句子開頭的半形逗號與口語虛詞一併清理', () => {
    // 43A 的 ', 嗯, ...' 開頭樣本：半形逗號 + 虛詞應一併去掉
    const out = polish(', 嗯, 六地菩薩修什麼, 從而就獲得七地嗎,');
    assert.ok(out.startsWith('六地菩薩'), `開頭清理未生效：${JSON.stringify(out)}`);
    assert.doesNotMatch(out, /[,，]\s*[。．]/);
  });
});

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
# step2_pre_polish 會呼叫 normalize_cjk_halfwidth_punct（2026-11-05 巡檢新增），
# 一併抽出，否則抽取出的片段會 NameError。
for helper_name in ('normalize_cjk_halfwidth_punct',):
    helper = next((n for n in tree.body if isinstance(n, ast.FunctionDef)
                   and n.name == helper_name), None)
    if helper is not None:
        parts.insert(0, ast.get_source_segment(src, helper))
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
    // ⚠️ 2026-11-05 巡檢更新：中文語境的半形『,』現會先正規化為全形『，』
    //    （見本檔末尾「中文語境內的半形標點應正規化為全形」）。
    //    本項的核心訴求「不得產生逗號+句號」不變，僅預期值改為全形。
    const cases = [
      ['自為通達為世,真實性, 這個就是通達為世的真實性, 這樣可以吧,', '自為通達為世，真實性， 這個就是通達為世的真實性， 這樣可以吧，'],
      [', 嗯, 六地菩薩修什麼, 從而就獲得七地嗎,', '六地菩薩修什麼， 從而就獲得七地嗎，'],
      ['通達為世,', '通達為世，'],
      ['那個還記得嗎,', '那個還記得嗎，'],
      ['菩薩修什麼什麼, 對不對,', '菩薩修什麼什麼， 對不對，'],
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

  // ── 2026-11-04 巡檢二巡：句尾守衛擴充至頓號／分號／冒號／半形句號 ──
  await t.test('頓號／分號／冒號／半形句號結尾不得再被補句號', () => {
    // 舊版守衛只認 r'[。？！…」』，,!?]$' → 這些輸入會被補成
    //   『甲、。』『一；。』『一;。』『注意：。』『結束.。』
    // 實測現有 304 個 session 中此類瑕疵為 0 筆，屬預防性修補。
    // ⚠️ 2026-11-05 巡檢更新：中文語境的半形『;』會先正規化為全形『；』，
    //    故『一;』的預期值改為『一；』；『結束.』的半形句號不在正規化範圍
    //    （只處理 , ; :），維持原樣。
    const cases = [
      ['甲、', '甲、'],
      ['一；', '一；'],
      ['一;', '一；'],
      ['注意：', '注意：'],
      ['結束.', '結束.'],
      ['這樣甲、', '這樣甲、'],
    ];
    for (const [input, expected] of cases) {
      const out = polish(input);
      assert.doesNotMatch(
        out,
        /[、；;：:]\s*[。．]|[.．]\s*[。．]/,
        `仍產生「標點+句號」：${JSON.stringify(input)} → ${JSON.stringify(out)}`,
      );
      assert.equal(out, expected, `輸出不符預期：${JSON.stringify(input)}`);
    }
  });

  await t.test('上游輸入已含半形「,.」時不得再被補句號', () => {
    // 舊版會把『有嘛,.』變成『有嘛,.。』
    const out = polish('有嘛,.');
    assert.doesNotMatch(out, /[.．]\s*[。．]/, `仍產生「句號+句號」：${JSON.stringify(out)}`);
    assert.doesNotMatch(out, /[,，]\s*[。．]/, `仍產生「逗號+句號」：${JSON.stringify(out)}`);
  });

  await t.test('守衛擴充不得改變既有全形行為（回歸保護）', () => {
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

  // ── 2026-11-05 巡檢：中文語境內的半形標點應正規化為全形 ──
  //
  // 背景（2026-11-05 巡檢實測，304 個已發布 session）：
  //   PR #341 的句尾守衛只解決「逗號+句號」瑕疵，且把半形『,』視為有效句尾，
  //   從未做半形→全形的寬度正規化。因此 ASR 輸出的半形標點會原樣進入新講次。
  //   實測已發布資料中，中文語境相鄰的半形標點共 2,946 筆：
  //     2025釋量論第二品大組共學 1,301、入中論善顯密意疏 889、四念住 756。
  //   有 rawText 可比對的課程（2025大組、四念住）共 2,057 筆，
  //   100% 同時存在於 rawText → 確認為 ASR 來源（ASR 引擎對連續國語輸出半形逗號），
  //   並非後續管線引入。
  //
  //   本 gate 守住「新轉寫講次不再產生中文語境半形標點」，
  //   且只改 scripts/batch_convert_all.py 一個檔案。
  await t.test('中文語境內的半形標點應正規化為全形', () => {
    // 43A/38B/入中論 session_09A 的真實樣本（半形逗號夾在中文之間）
    const cases = [
      ['立如是換車,對不對,這個成立講的是瞭解的意思,',
       '立如是換車，對不對，這個成立講的是瞭解的意思，'],
      ['好,可能在73頁嘛,上一堂課講的那個叫什麼,',
       '好，可能在73頁嘛，上一堂課講的那個叫什麼，'],
      ['這個時候你念修成功了,你在修觀的時候,',
       '這個時候你念修成功了，你在修觀的時候，'],
      ['甲;乙', '甲；乙。'],
      ['注意:請看', '注意：請看。'],
    ];
    for (const [input, expected] of cases) {
      const out = polish(input);
      assert.equal(out, expected, `半形標點未正規化：${JSON.stringify(input)} → ${JSON.stringify(out)}`);
    }
  });

  await t.test('正規化不得套用到非中文語境（數字千分位／英文／URL）', () => {
    // 這些半形標點是合法的西文用法，正規化會破壞語意
    // （注意：無句尾標點者仍會被補『。』，那是既有行為，非本項議題）
    const cases = [
      ['數字是1,000元', '數字是1,000元。'],
      ['請參閱 https://example.com/a,b 這裡', '請參閱 https://example.com/a,b 這裡。'],
      ['Hello, world', 'Hello, world。'],
      ['用 ; 分隔', '用 ; 分隔。'],
    ];
    for (const [input, expected] of cases) {
      const out = polish(input);
      assert.equal(out, expected, `誤改非中文語境：${JSON.stringify(input)} → ${JSON.stringify(out)}`);
    }
  });

  await t.test('半形→全形正規化後仍不得產生「逗號+句號」', () => {
    // 兩道處理串接後仍須守住 PR #341 的主因修正
    for (const input of ['有嘛,.', '甲,', '那個啦,']) {
      const out = polish(input);
      assert.doesNotMatch(out, /[,，]\s*[。．]/, `仍產生「逗號+句號」：${JSON.stringify(input)} → ${JSON.stringify(out)}`);
      assert.doesNotMatch(out, /[.．]\s*[。．]/, `仍產生「句號+句號」：${JSON.stringify(input)} → ${JSON.stringify(out)}`);
    }
  });

  await t.test('正規化不得改變句數與句界（ASR segment 邊界契約）', () => {
    // 一次輸入兩句 → 輸出仍為兩句，且邊界不變
    const py = `
import json
${EXTRACT_PY}
fn = ns['step2_pre_polish']
out = fn([
  {'start': 0.0, 'end': 1.0, 'text': '第一句,測試,'},
  {'start': 1.0, 'end': 2.0, 'text': '第二句,測試,'},
], dynamic_terms=None)
print(json.dumps({'n': len(out), 'texts': [o['text'] for o in out]}, ensure_ascii=False))
`;
    const res = spawnSync('python3', ['-c', py], { encoding: 'utf8', cwd: ROOT });
    assert.equal(res.status, 0, `python3 抽取失敗：${res.stderr}`);
    const parsed = JSON.parse(res.stdout.trim().split('\n').pop());
    assert.equal(parsed.n, 2, `句數改變：${JSON.stringify(parsed)}`);
    for (const txt of parsed.texts) {
      assert.doesNotMatch(txt, /[,，]\s*[。．]/, `仍產生「逗號+句號」：${JSON.stringify(txt)}`);
    }
  });
});

#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TEXT_REPLACEMENTS = [
  ["“", "「"],
  ["”", "」"],
  ["‘", "『"],
  ["’", "』"],
  ["大主討論", "大組討論"],
  ["體綱", "提綱"],
  ["濟宋", "偈頌"],
  ["取捨據斷固", "取捨俱斷故"],
  ["聲稱的因", "生瞋的因"],
  ["對苦聲稱", "對苦生瞋"],
  ["不是完全沒有聲稱", "不是完全沒有生瞋"],
  ["不應該聲稱", "不應該生瞋"],
  ["生起的是成型", "生起的是瞋心"],
  ["這種心人是利大於弊", "這種心仍是利大於弊"],
  ["我之為因", "我執為因"],
  ["再再竄息", "再再串習"],
  ["看姻緣", "看因緣"],
  ["年尊者", "目犍連尊者"],
  ["外刀用棍棒", "外道用棍棒"],
  ["透過它那個受體的感受", "透過它那個身體的感受"],
  ["眼前望遠放棄都是紅燈", "眼前望眼放去都是紅燈"],
  ["需求快點到達", "希求快點到達"],
  ["若由現在苦，厭離世瞋彼，非離貪而時", "若由現在苦，厭離是瞋彼，非離貪爾時"],
  ["有貪求於故", "有貪求餘故"],
  ["瞋苦為因故，彼為耳識柱；彼滅則自己仁依於自信", "瞋苦為因故，彼唯爾時住，彼滅則自己，仍依於自性"],
  ["以此無上大師教，皆由上師生恩，故此善迴向諸眾生，願成善說長壽因", "遇此無上大師教，皆由上師深恩故，此善迴向諸眾生，願成善士攝受因"],
];

const SAFE_HONORIFICS = new Set(["各位師兄", "幾位師姐", "面幾位師姐", "位師姐", "各位師姐", "眾位師兄", "眾位師姐"]);
const SAFE_THANKS = new Set(["謝謝法師", "謝謝老師", "謝謝主持", "謝謝主持人", "謝謝大家", "謝謝同學", "謝謝師兄", "謝謝師姐", "謝謝學員"]);

export function cleanStudyGroupText(text) {
  let out = String(text || "");
  for (const [src, dst] of TEXT_REPLACEMENTS) {
    if (out.includes(src)) out = out.split(src).join(dst);
  }
  return out;
}

export function findPossibleNameLeaks(text) {
  const s = String(text || "");
  const leaks = [];
  for (const m of s.matchAll(/[\u4e00-\u9fff]{1,3}(?:師姐|師兄)/g)) {
    const val = m[0];
    if (!SAFE_HONORIFICS.has(val) && !val.startsWith("前面") && !val.startsWith("各位") && !val.startsWith("幾位")) {
      leaks.push(val);
    }
  }
  for (const m of s.matchAll(/謝謝[\u4e00-\u9fff]{2,3}/g)) {
    const val = m[0];
    if (!SAFE_THANKS.has(val)) {
      leaks.push(val);
    }
  }
  return leaks;
}

export function preflightSession(session, { apply = false } = {}) {
  let changed = 0;
  const leaks = [];
  for (const p of session.paragraphs || []) {
    for (const st of p.sentences || []) {
      const cleaned = cleanStudyGroupText(st.text);
      if (cleaned !== st.text) {
        changed += 1;
        if (apply) st.text = cleaned;
      }
      const found = findPossibleNameLeaks(apply ? st.text : cleaned);
      if (found.length) {
        leaks.push({ id: st.id, speaker: p.speaker, hits: found });
      }
    }
  }
  return { changed, leaks };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  const file = args.find(a => !a.startsWith("-"));
  const apply = args.includes("--apply");
  if (!file) {
    console.error("Usage: node scripts/study_group_preflight.mjs <session.json> [--apply]");
    process.exit(2);
  }
  const abs = path.resolve(file);
  const session = JSON.parse(fs.readFileSync(abs, "utf8"));
  const res = preflightSession(session, { apply });
  if (apply && res.changed > 0) {
    fs.writeFileSync(abs, `${JSON.stringify(session, null, 1)}\n`, "utf8");
  }
  console.log(JSON.stringify({ file, apply, changed: res.changed, leakCount: res.leaks.length, leaks: res.leaks.slice(0, 10) }));
}

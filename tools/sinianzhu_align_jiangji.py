#!/usr/bin/env python3
"""以《四念住講記》為基準，找出逐字稿中「講記裡找不到對應」的句子。

背景
----
四念住逐字稿是玅境長老 1996 年在美國法雲寺佛學院宣講的 YouTube ASR 稿。
同一場演講另有整編定稿《四念住講記》（玅境老和尚 口述、助手整理，32 頁），
存放於 reviews/evidence/sinianzhu/reference/jiangji_sinianzhu_jiangji_full.md。

方法
----
把講記全文建成 3-gram 集合，對逐字稿每一句計算「有多少比例的中文 3 字片段
能在講記中找到」。整句都找不到 → 該句在講記中沒有對應，多半是 ASR 亂碼。

閾值經 ground truth 校準：
  正確句覆蓋率 0.33 ~ 1.00
  亂碼句覆蓋率 0.00 ~ 0.17
N=3 時，全域 13,075 句只有 209 句覆蓋率為 0（可人工處理的量）。
N=4→32%、N=5→53%、N=6→68%（量太大，不實用）。

用法
----
    python3 tools/sinianzhu_align_jiangji.py                 # 全 8 講
    python3 tools/sinianzhu_align_jiangji.py 03 04           # 指定講次
    python3 tools/sinianzhu_align_jiangji.py --report 03     # 印出可疑句

輸出
----
    /tmp/jj_nomatch.json   候選清單（給下游 worker 用）
"""
import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF_MD = os.path.join(REPO, "reviews/evidence/sinianzhu/reference/jiangji_sinianzhu_jiangji_full.md")
REF_JSON = os.path.join(REPO, "reviews/evidence/sinianzhu/reference/jiangji_sinianzhu_jiangji_full.json")
SESSIONS = os.path.join(REPO, "courses/四念住/sessions")
OUT = "/tmp/jj_nomatch.json"

N = 3
ZERO_ONLY = True      # True: 只輸出覆蓋率為 0 的；False: 輸出 < 0.15 的


def norm(s):
    """只保留中文（去除標點、數字、英文），用於 n-gram 比對"""
    return re.sub(r"[^\u4e00-\u9fff]", "", s)


def load_jiangji():
    """讀講記全文。若 .md 不存在但 .json 存在，用 json；兩者皆無則提示先跑 fetch"""
    if os.path.exists(REF_MD):
        return open(REF_MD, encoding="utf-8").read()
    if os.path.exists(REF_JSON):
        pages = json.load(open(REF_JSON, encoding="utf-8"))
        return "".join(p.get("body", "") for p in pages)
    raise SystemExit(
        f"找不到講記全文：\n  {REF_MD}\n"
        "請先執行：python3 reviews/evidence/sinianzhu/reference/fetch_jiangji.py\n"
        "（來源：book853.com id=1626《四念住講記　玅境老和尚》，需帶瀏覽器 User-Agent）"
    )


def build_index(text):
    """建立 3-gram 集合"""
    jn = norm(text)
    return {jn[i:i + N] for i in range(len(jn) - N + 1)}


def coverage(sentence, grams):
    """句子的 3-gram 命中率"""
    t = norm(sentence)
    if len(t) < N:
        return 1.0
    g = [t[i:i + N] for i in range(len(t) - N + 1)]
    return sum(1 for x in g if x in grams) / len(g)


def main():
    args = sys.argv[1:]
    report = "--report" in args
    args = [a for a in args if not a.startswith("--")]
    sessions = args or ["%02d" % i for i in range(1, 9)]

    text = load_jiangji()
    grams = build_index(text)
    print(f"講記 3-gram 索引：{len(grams)} 條（來源 {os.path.basename(REF_MD)}）")

    out = {}
    for sid in sessions:
        path = os.path.join(SESSIONS, f"session_{sid}.json")
        if not os.path.exists(path):
            print(f"  session_{sid}: 檔案不存在，略過")
            continue
        data = json.load(open(path, encoding="utf-8"))
        cands = []
        for para in data.get("paragraphs", []):
            for s in para.get("sentences", []):
                t = s.get("text", "")
                if len(norm(t)) < 8:
                    continue
                cov = coverage(t, grams)
                bad = (cov == 0) if ZERO_ONLY else (cov < 0.15)
                if bad:
                    cands.append({
                        "sentenceId": s["id"], "text": t,
                        "types": ["no-jiangji-match"],
                        "reason": f"{N}-gram 覆蓋率 {cov:.2f}：此句在講記中找不到對應",
                        "coverage": round(cov, 3),
                    })
        out[sid] = cands
        total = sum(len(p.get("sentences", [])) for p in data.get("paragraphs", []))
        print(f"  session_{sid}: 句 {total} | 可疑 {len(cands)}")
        if report:
            for c in cands[:20]:
                print(f"     cov={c['coverage']:.2f}  {c['sentenceId']} | {c['text'][:60]}")

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"\n合計可疑：{sum(len(v) for v in out.values())}  →  {OUT}")


if __name__ == "__main__":
    main()

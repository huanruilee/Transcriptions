#!/usr/bin/env python3
"""Scrape 玅境長老《四念住講記》全 32 頁，作為四念住逐字稿的權威校對基準。

來源：book853.com id=1626《四念住講記　玅境老和尚》
      玅境長老 1996 年宣講於美國法雲寺佛學院
用法：python3 fetch_jiangji.py
輸出：/Users/henry/.hermes/cache/scratch/jiangji_full.md
"""
import re
import html
import json
import time
import urllib.request

BASE = "http://www.book853.com/show.aspx?id=1626&cid=12"
OUT = "/Users/henry/.hermes/cache/scratch/jiangji_full.md"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")


def extract_body(raw):
    """取書本文本主體（去掉站點導覽列、頁尾）。"""
    # 標題與作者行之後才是正文
    m = re.search(r"作者：\s*玅境老和尚\s*</?[^>]*>\s*(.*?)(?:\[下一頁|推薦|打印|上一頁)", raw, re.S)
    body = m.group(1) if m else raw
    body = re.sub(r"<script.*?</script>", " ", body, flags=re.S)
    body = re.sub(r"<style.*?</style>", " ", body, flags=re.S)
    body = re.sub(r"<br\s*/?>", "\n", body, flags=re.I)
    body = re.sub(r"</p>", "\n\n", body, flags=re.I)
    body = re.sub(r"<[^>]+>", "", body)
    body = html.unescape(body)
    body = re.sub(r"[ \t　]+", " ", body)
    body = re.sub(r"\n{3,}", "\n\n", body)
    return body.strip()


def main():
    pages = []
    for p in range(1, 33):
        url = BASE if p == 1 else f"{BASE}&page={p}"
        try:
            raw = fetch(url)
        except Exception as e:
            print(f"  page {p}: FAIL {e}")
            pages.append((p, "", str(e)))
            continue
        body = extract_body(raw)
        # 章節標題
        tm = re.search(r"四念住講記\s*玅境老和尚\s*([^\[\]]{2,20})", body)
        title = tm.group(1).strip() if tm else ""
        pages.append((p, title, body))
        print(f"  page {p:2d}: {len(body):5d} chars  {title}")
        time.sleep(0.4)

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("# 玅境長老《四念住講記》全文（1996 美國法雲寺佛學院）\n\n")
        f.write("來源：book853.com id=1626｜YouTube: vairucana002「玅境長老主講四念住01-08+」\n\n")
        for p, title, body in pages:
            f.write(f"\n\n{'='*60}\n## 第 {p} 頁 · {title}\n{'='*60}\n\n")
            f.write(body if body else f"(抓取失敗：{body})")
    print(f"\n已寫入 {OUT}")

    # 同時輸出 JSON 方便程式對照
    with open(OUT.replace(".md", ".json"), "w", encoding="utf-8") as f:
        json.dump([{"page": p, "title": t, "body": b} for p, t, b in pages], f, ensure_ascii=False, indent=1)
    print(f"已寫入 {OUT.replace('.md', '.json')}")


if __name__ == "__main__":
    main()

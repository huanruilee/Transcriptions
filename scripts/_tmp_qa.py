import json, re, collections
SIMPLER = "们关际术义点线经证质设观实东车马鸟鱼长门问间时现发变对学运远还这说话请谢种离应艺历医叶业丛"
for sid in ["02", "03"]:
    d = json.load(open(f"courses/釋量論第二品/sessions/session_{sid}.json"))
    txt = "".join(s["text"] for p in d["paragraphs"] for s in p["sentences"])
    hits = collections.Counter(ch for ch in txt if ch in SIMPLER)
    print(f"=== {sid}: {dict(hits.most_common(12))}")
    for ch in list(hits)[:4]:
        i = txt.find(ch)
        print("  ctx:", txt[max(0, i - 18):i + 18].replace("\n", " "))
    # 開經偈正確性
    for w in ["釋迦摩尼", "釋迦牟尼", "為妙法", "微妙法"]:
        n = txt.count(w)
        if n:
            print(f"  {w}: {n}")

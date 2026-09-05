#!/usr/bin/env python3
"""Re-apply deterministic post-polish (lexicon + S2T + punctuation) to stored
session JSONs — no LLM. For fixing files written before post-polish rules improved."""
import json, re, sys
from pathlib import Path

COURSE = Path("courses/釋量論第二品")
learned = json.load(open(COURSE / "learned_corrections.json"))["global_terms"]
S2T = str.maketrans("们这学时现说应观对变问经运义证实际归觉讲师设点线长门间东车马鸟鱼为当"
                    "艺医还种发话质请关远让从个与会来两儿无气数诸众确诉脱么习显献称见赞极闹栏订转镜别"
                    "举乱争于产传余内况几则刚刹办却后吗听圆圣坚声处够头导将尽属帮干并异强径态执摇条样没灭烛状电础离笔类紧红终绍绪"
                    "简单复难题记录忆许论设评识词语误风验马驶站级统继绩维绿总热爱让颂",
                    "們這學時現說應觀對變問經運義證實際歸覺講師設點線長門間東車馬鳥魚為當"
                    "藝醫還種發話質請關遠讓從個與會來兩兒無氣數諸眾確訴脫麼習顯獻稱見讚極鬧欄訂轉鏡別"
                    "舉亂爭於產傳餘內況幾則剛剎辦卻後嗎聽圓聖堅聲處夠頭導將盡屬幫幹並異強徑態執搖條樣沒滅燭狀電礎離筆類緊紅終紹緒"
                    "簡單復難題記錄憶許論設評識詞語誤風驗馬駛站級統繼績維綠總熱愛讓頌")
# 注意: 了/只/才/注/布/局/借 不做 char-level 轉換（opencc 會錯轉 了→瞭、只→隻、才→纔）
CTA = re.compile(r"(支持|訂閱|订阅).{0,10}(明鏡|明镜|栏目|欄目)|請不吝|點[赞讚]|点[赞赞]|打賞|打赏|转[發发]")

def polish(t):
    for typo, info in learned.items():
        t = re.sub(info.get("safe_regex", re.escape(typo)), info["corrected"], t)
    t = re.sub(r"(?<=[\u4e00-\u9fff]),", "，", t)
    t = re.sub(r",(?=[\u4e00-\u9fff])", "，", t)
    return t.translate(S2T)

for sid in sys.argv[1:]:
    p = COURSE / "sessions" / f"session_{sid}.json"
    d = json.load(open(p))
    n = cta = 0
    for para in d["paragraphs"]:
        kept = []
        for s in para["sentences"]:
            if CTA.search(s["text"]):
                cta += 1
                continue
            new = polish(s["text"])
            if new != s["text"]:
                s["text"] = new; n += 1
            kept.append(s)
        para["sentences"] = kept
    d["paragraphs"] = [p_ for p_ in d["paragraphs"] if p_["sentences"]]
    json.dump(d, open(p, "w"), ensure_ascii=False, indent=2)
    txt = "".join(s["text"] for para in d["paragraphs"] for s in para["sentences"])
    simp = re.findall(r"[们证义讲师说觉实际归运这学么习显献称见赞极闹栏订转镜别]", txt)
    print(f"{sid}: {n} fixed | CTA removed: {cta} | residual simp: {len(simp)}")

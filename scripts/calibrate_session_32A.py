import json, re
from datetime import datetime

file_path = 'courses/入中論善顯密意疏/sessions/session_32A.json'
with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Update lastUpdated
data['lastUpdated'] = "2026-09-05 22:58:00"

# Text replacement rules
# Each item is (target, replacement)
replacements = [
    # 1. Phonetic & terminology fixes from user prompt
    ("若語什麼在哪裡", "若不如是在哪裡"),
    ("武漢武漢 上面有一個若不如是 有沒有看到", "翻過來往下看 上面有一個若不如是 有沒有看到"),
    ("對不對 實質空 而彼影像", "對不對 形質空 而彼影像"),
    ("導世俗", "倒世俗"),
    ("叫一個 讓叫瑞銘講一下", "叫瑞銘講一下"),
    ("名言士", "名言識"),
    ("兔嚼", "兔角"),
    ("一種是照三類", "一種是聖者三類補特伽羅"),
    ("專者有時候講的時候會確定", "尊者有時候講的時候會確定"),
    ("創程上面也是沒有", "傳承上面也是沒有"),
    ("好好的鼎", "好好的頂禮"),
    ("皮活沙", "毘婆沙宗"),
    ("毘婆沙中", "毘婆沙宗"),
    ("異體空的空性", "二取異體空的空性"),
    ("異體空", "二取異體空"),
    ("與其形態的話", "瑜伽行自續派的話"),
    ("大聲的", "大乘的"),
    ("隨障礙解脫", "誰障礙解脫"),
    ("就是糞啊路啊 對不對 等等等等 對就是21個隨煩惱", "就是忿、恨、覆、惱等等等等 對就是二十個隨煩惱"),
    ("印證這邊就", "中觀應成這邊就"),
    ("總觀議程", "中觀應成"),
    ("子法是實執的話", "執法是實執的話"),
    ("子補特伽羅為實執", "執補特伽羅為實執"),
    ("子實執", "執實執"),
    ("子獨立自主的我", "執獨立自主的我"),
    ("子我為實執", "執我為實執"),
    ("精品跟陶瓷瓶", "金瓶跟陶瓷瓶"),
    ("精品會 讓我們很悅意", "金瓶會 讓我們很悅意"),
    ("折磨我們", "折騰我們"),
    ("植物常法的我執", "執常法的我執"),
    ("植物相儀心法的", "執不相應行法的"),
    ("植心的", "執心法的"),
    ("植色法的", "執色法的"),
    ("只勝義諦的 我執 只世俗諦 我執", "執勝義諦的我執、執世俗諦的我執"),
    ("多出了一個得", "多出了一個「的」"),
    ("只要是撐 這樣可以嗎 而且還會牽扯到 像撒嬌也一件", "只要是瞋 這樣可以嗎 而且還會牽扯到 像薩迦耶見"),
    ("不是了 就是說邊界這些 那個叫什麼 對對對邊界 那如果說邊界 也要跟執著", "不是了 就是說邊見這些 那個叫什麼 對對對邊見 那如果說邊見 也要跟執著"),
    ("一隻鳥一隻鳥的時候", "一條一條的時候"),
    ("心內學", "心類學"),
    ("很通通的一個地方", "很頭痛的一個地方"),
    ("格西阿", "格西啦"),
    ("折要怎麼解釋", "「則」要怎麼解釋"),
    ("然後就就折什麼 就跳過去了", "然後就「則」什麼 就跳過去了"),
    ("折什麼什麼", "「則」什麼什麼"),
]

# Update headings
for p in data.get('paragraphs', []):
    if p.get('heading'):
        h = p['heading']
        h = h.replace('皮活沙', '毘婆沙宗')
        h = h.replace('格西阿', '格西啦')
        h = h.replace('心內學', '心類學')
        p['heading'] = h

# Update sentences
for pi, p in enumerate(data.get('paragraphs', [])):
    for si, s in enumerate(p.get('sentences', [])):
        txt = s.get('text', '')
        for old, new in replacements:
            if old in txt:
                txt = txt.replace(old, new)
        # also update any notes if present
        if 'notes' in s:
            for old, new in replacements:
                if old in s['notes']:
                    s['notes'] = s['notes'].replace(old, new)
            s['notes'] = s['notes'].replace('皮活沙', '毘婆沙宗').replace('格西阿', '格西啦').replace('心內學', '心類學').replace('實質空', '形質空')
        s['text'] = txt

with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print('Session 32A calibration completed successfully!')

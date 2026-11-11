#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
大組共學「討論提綱與法師開示對照」HTML 產生器（通用版）
=================================================================

本腳本是這個 HTML 檔案的「來源程式」。要新增／更新內容，從這裡改，
不要手動編輯產出的 HTML。

資料來源（全部來自 YouTube 公開資訊）
--------------------------------------
1. 播放清單（決定有哪些講、順序、影片 ID）：
     yt-dlp --flat-playlist --dump-json \
       'https://www.youtube.com/playlist?list=PLlVfdhU37xZCXzlW90v10Y6z8w3Oue0Uh'

2. 每支影片的「共學提綱」與「影片段落」（決定題目與開示時間碼）：
     yt-dlp --dump-json --skip-download 'https://www.youtube.com/watch?v=<VIDEO_ID>'
   → description 欄位裡的
     ❓共學提綱：  段落 = 每一節標題（一、二、三…）＋ 題號＋題幹＋子題⑴⑵…
     🎞️影片段落：  段落 = 章節時間碼與章節名
     「※未討論的問題他日再論。」→ 該題沒有開示連結

3. 章節時間碼的對應規則
   -------------------
   - 「第N題」章節 → 該題的開示起點
   - 「法師指導 HH:MM:SS」章節 → 開示終點
   - 開示起點與終點之間即為開示區段，轉成相對秒數後產生
     https://www.youtube.com/watch?v=<ID>&t=<start>s
   - 同一題有多段開示（跨段落討論）→ 產生多組連結

用法
----
    python3 build.py --playlist <PLAYLIST_ID> --out output.html --title <課程名稱>

    # 只更新既有資料（--cache 記住已抓的說明欄，只抓新增影片）
    python3 build.py --playlist <PLAYLIST_ID> \
        --out output.html --cache desc_cache.json --title <課程名稱>

產出檔案放在 courses/study-groups/<課程目錄>/ 之下；同一產生器可供
多個課程共用，課程資訊全由命令列參數傳入，腳本內無寫死的課程字串。

輸出是一個完全自足的單一 HTML 檔案（inline CSS + inline JS，無外部相依），
可直接以瀏覽器開啟、隨身攜帶或列印。
"""
import argparse
import json
import os
import re
import subprocess
import sys
import html as html_mod
from collections import OrderedDict

# ---------------------------------------------------------------------------
# 樣式
# ---------------------------------------------------------------------------
CSS = """
:root{
  --bg:#12100e; --card:#1c1916; --line:#302b26; --fg:#e8e2d8; --dim:#a89f92;
  --acc:#d9a441; --acc2:#8fae6b; --warn:#b8705a; --card2:#1f1b17;
  --shade:rgba(216,164,65,.16);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--fg);
  font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;
  line-height:1.75}
.wrap{display:flex;align-items:flex-start}
#toc{position:sticky;top:0;width:300px;max-height:100vh;overflow-y:auto;
  padding:20px 16px 60px;border-right:1px solid var(--line);flex:0 0 300px;background:#171411}
#toc h1{font-size:17px;margin:0 0 4px;letter-spacing:.5px;color:var(--acc)}
#toc .sub{font-size:12px;color:var(--dim);margin-bottom:14px;line-height:1.5}
#toc ol{list-style:none;padding:0;margin:0;counter-reset:l}
#toc li{counter-increment:l;margin:0 0 3px}
#toc li a{display:block;padding:4px 8px;font-size:13px;color:var(--dim);
  text-decoration:none;border-radius:4px;transition:background .12s,color .12s}
#toc li a:hover{background:#241f1a;color:var(--fg)}
#toc li a::before{content:counter(l) ". ";opacity:.5}
#toc li a.active{background:#2a231c;color:var(--acc);font-weight:600}
#toc li a.active::before{opacity:1}
main{flex:1;min-width:0;padding:28px 32px 120px;max-width:1100px}
header.top{border-bottom:1px solid var(--line);padding-bottom:18px;margin-bottom:24px}
header.top h1{margin:0 0 6px;font-size:26px;color:var(--acc)}
header.top p{margin:2px 0;color:var(--dim);font-size:13.5px}
.stats{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0 0}
.stats span{background:var(--card2);border:1px solid var(--line);border-radius:6px;
  padding:3px 10px;font-size:12.5px;color:var(--dim)}
.lecture{margin-bottom:46px;scroll-margin-top:16px}
.lecture h2{font-size:21px;margin:0 0 8px;padding:10px 14px;
  background:linear-gradient(90deg,#241f1a,transparent);border-left:4px solid var(--acc);
  border-radius:0 6px 6px 0}
.anchor{color:var(--dim);text-decoration:none;font-weight:400;margin-right:4px;font-size:.8em}
.anchor:hover{color:var(--acc)}
.meta{font-size:12.5px;color:var(--dim);margin:0 0 14px}
.meta a{color:var(--acc2)}
.section{margin-bottom:22px}
.section h3{font-size:16px;margin:16px 0 10px;color:#d9c9a8;
  border-bottom:1px dashed var(--line);padding-bottom:5px}
.q{background:var(--card);border:1px solid var(--line);border-radius:8px;
  padding:13px 15px;margin-bottom:12px}
.qhead{font-size:15px;margin-bottom:8px;font-weight:500}
.qnum{display:inline-block;background:var(--acc);color:#241f1a;font-weight:700;
  font-size:13px;padding:1px 9px;border-radius:5px;margin-right:7px}
ul.subs{margin:6px 0 10px;list-style:none;border-left:2px solid #3a332b;padding-left:12px}
ul.subs li{font-size:14px;color:#cfc7ba;margin-bottom:4px}
.mk{color:var(--acc);font-weight:700;margin-right:4px}
ul.subs li.undecided{color:#8a8175;font-style:italic}
.disclose{margin-top:8px;padding:8px 11px;background:#191612;
  border:1px solid #38312a;border-radius:6px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.dlabel{font-size:12px;color:var(--acc);font-weight:700;letter-spacing:1px}
.dlink{display:inline-block;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;
  color:#12100e;background:var(--acc2);padding:3px 10px;border-radius:5px;
  text-decoration:none;font-weight:600}
.dlink:hover{background:#a3c47c}
.dtags{font-size:12px;color:var(--dim)}
.none{background:#171411;border-style:dashed;border-color:#332c26}
.none .dlabel{color:var(--dim)}
.none .dtags{color:var(--warn)}
#q{position:fixed;top:14px;right:18px;z-index:50;display:flex;gap:6px;align-items:center}
#q input{background:var(--card2);border:1px solid var(--line);color:var(--fg);
  padding:8px 13px;border-radius:20px;font-size:14px;width:230px;outline:none}
#q input:focus{border-color:var(--acc)}
#q button{background:var(--card2);border:1px solid var(--line);color:var(--dim);
  width:32px;height:34px;border-radius:20px;cursor:pointer;font-size:15px;line-height:1}
#q button:hover{color:var(--acc);border-color:var(--acc)}
#qcount{position:fixed;top:56px;right:18px;z-index:50;font-size:12px;color:var(--dim);
  background:var(--card2);border:1px solid var(--line);border-radius:6px;padding:2px 9px;display:none}
#tocbtn{display:none;position:fixed;bottom:18px;left:18px;z-index:60;
  background:var(--acc);color:#241f1a;border:none;border-radius:22px;padding:11px 18px;
  font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.45)}
mark{background:var(--acc);color:#241f1e;border-radius:2px}
.hit{outline:2px solid var(--acc);outline-offset:2px;border-radius:8px}
footer{color:var(--dim);font-size:12.5px;border-top:1px solid var(--line);
  padding-top:14px;margin-top:40px}
footer code{background:var(--card2);padding:1px 5px;border-radius:4px;font-size:12px}
@media(max-width:900px){
  #toc{display:none}
  #toc.open{display:block;position:fixed;inset:0;z-index:70;width:100%;max-width:100%;
    flex:none;overflow-y:auto}
  .wrap{display:block}
  main{padding:18px 14px 90px}
  #q{top:auto;bottom:14px;right:14px}
  #qcount{top:auto;bottom:56px;right:14px}
  #tocbtn{display:block}
}
@media print{
  #toc,#q,#qcount,#tocbtn{display:none !important}
  body{background:#fff;color:#111;font-size:11pt}
  main{max-width:none;padding:0}
  .q,.disclose{border-color:#ccc;background:#fff;break-inside:avoid}
  .lecture{break-inside:auto}
  .lecture h2{background:none;color:#111;border-left:3px solid #000}
  a.dlink{background:#fff;color:#111;border:1px solid #999}
}
"""

# ---------------------------------------------------------------------------
# JS：搜尋 + scroll-spy + 行動版抽屜
# ---------------------------------------------------------------------------
JS = r"""
const box=document.getElementById('qbox');
const secs=[...document.querySelectorAll('.lecture')];
const counter=document.getElementById('qcount');
const tocLinks=[...document.querySelectorAll('#toc ol a')];
let cur=-1;

function esc(s){return s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

function clearMarks(){
  document.querySelectorAll('mark').forEach(m=>{
    const p=m.parentNode;p.replaceChild(document.createTextNode(m.textContent),m);p.normalize();
  });
  document.querySelectorAll('.hit').forEach(e=>e.classList.remove('hit'));
  if(counter){counter.style.display='none';counter.textContent='';}
}

function run(){
  clearMarks();
  const q=box.value.trim(); if(!q) return;
  const lower=q.toLowerCase();
  let hits=0;
  secs.forEach(s=>{if(s.textContent.toLowerCase().includes(lower))s.classList.add('hit');});
  const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const nodes=[];
  while(w.nextNode()){
    const n=w.currentNode;
    if(n.nodeValue&&n.nodeValue.toLowerCase().includes(lower)&&n.nodeValue.trim())nodes.push(n);
  }
  // 用擷取群組分割：String.split 會把「被分隔的匹配片段」一併放進結果陣列，
  // 因此 parts 的長度 = 命中數+1，可直接用來計算命中數並定位命中片段。
  const pat=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re=new RegExp('('+pat+')','ig');
  const reOne=new RegExp('^('+pat+')$','i');
  let first=null;
  nodes.forEach(n=>{
    const parts=n.nodeValue.split(re);
    if(!first&&parts.length>1) first=n;
    // 命中片段是 parts 中的奇數索引項；非命中片段即使包含關鍵字也不是命中
    const span=document.createElement('span');
    span.innerHTML=parts.map((p,i)=>
      (i%2===1) ? '<mark>'+esc(p)+'</mark>' : esc(p)).join('');
    n.parentNode.replaceChild(span,n);
    hits+=Math.floor((parts.length-1)/2);
  });
  // 捲到第一個命中；first 的父節點在替換後仍有效（span 取代了原文字節點）
  if(first){
    const anchor=first.parentElement;
    if(anchor&&anchor.scrollIntoView) anchor.scrollIntoView({behavior:'smooth',block:'center'});
  }
  if(counter){
    counter.textContent = hits ? ('找到 '+hits+' 處') : '找不到相符內容';
    counter.style.display='block';
  }
}

let tm;
box.addEventListener('input',()=>{clearTimeout(tm);tm=setTimeout(run,220);});
document.getElementById('qclear').addEventListener('click',()=>{
  box.value='';clearMarks();box.focus();
});
box.addEventListener('keydown',e=>{if(e.key==='Escape'){box.value='';clearMarks();}});

// scroll-spy：標示目前所在講次
const spy=new IntersectionObserver(es=>{
  es.forEach(e=>{
    if(e.isIntersecting){
      const i=secs.indexOf(e.target);
      if(i>=0&&i!==cur){
        cur=i;
        tocLinks.forEach((a,j)=>a.classList.toggle('active',j===i));
        const act=tocLinks[i];
        if(act){
          const nav=document.getElementById('toc');
          const top=act.offsetTop;
          if(top<nav.scrollTop||top>nav.scrollTop+nav.clientHeight-60)nav.scrollTop=top-40;
        }
      }
    }
  });
},{rootMargin:'-10% 0px -75% 0px',threshold:0});
secs.forEach(s=>spy.observe(s));

// 行動版 TOC 抽屜
const btn=document.getElementById('tocbtn'),toc=document.getElementById('toc');
btn.addEventListener('click',()=>{
  const open=toc.classList.toggle('open');
  btn.textContent=open?'✕ 關閉目錄':'☰ 目錄';
});
toc.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{
  if(window.innerWidth<=900){toc.classList.remove('open');btn.textContent='☰ 目錄';}
}));
"""


# ---------------------------------------------------------------------------
# 資料擷取
# ---------------------------------------------------------------------------
def run_yt(args):
    """呼叫 yt-dlp 並回傳 JSON 行"""
    try:
        out = subprocess.run(
            ["yt-dlp"] + args + ["--no-warnings"],
            capture_output=True, text=True, timeout=300)
    except FileNotFoundError:
        sys.exit("需要 yt-dlp：pip install yt-dlp")
    if out.returncode != 0:
        sys.stderr.write(out.stderr)
    res = []
    for line in out.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            res.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return res


def fetch_playlist(pl_id):
    vids = run_yt(["--flat-playlist", "--dump-json",
                   "https://www.youtube.com/playlist?list=" + pl_id])
    return [v for v in vids if v.get("id")]


def fetch_detail(video_id):
    """抓單支影片完整 metadata（含 description）"""
    vids = run_yt(["--dump-json", "--skip-download",
                   "https://www.youtube.com/watch?v=" + video_id])
    return vids[0] if vids else None


# ---------------------------------------------------------------------------
# 解析：共學提綱 / 影片段落
# ---------------------------------------------------------------------------
SECTION_RE = re.compile(r"^\s*([一二三四五六七八九十ㄧㄨㄩ]+)、\s*(.+?)\s*$")
NUM_RE = re.compile(r"^\s*(\d+)\s*[.．]\s*(.+)$")
SUB_RE = re.compile(r"^\s*([⑴⑵⑶⑷⑸⑹⑺⑻⑼⑽])\s*(.+)$")
CHAP_RE = re.compile(r"^\s*(\d+):(\d\d):(\d\d)\s+(.+?)\s*$")
UNDISCUSSED = "未討論的問題他日再論"

# 章節名 → 題號 + 子題清單
#   第3題          → (3, [])
#   第3題⑴⑵       → (3, ['⑴','⑵'])   同一章節討論多個子題
#   法師指導：第3題 → (3, [])          補充開示，另帶結束時間
CHAP_Q_RE = re.compile(r"^第(\d+)題((?:[⑴-⑽])*)$")
CHAP_T_RE = re.compile(r"^法師指導[:：]?\s*第(\d+)題((?:[⑴-⑽])*)\s*(\d+:\d\d:\d\d)?")
SUB_CHARS = "⑴⑵⑶⑷⑸⑹⑺⑻⑼⑽"


def parse_description(desc):
    """把影片說明欄拆成 (提綱區塊, 章節清單)"""
    desc = desc or ""
    # 切出提綱區塊與章節區塊
    m_outline = re.search(r"❓共學提綱：(.*?)(?:\n\s*※?未討論|\n\s*🎞️|$)", desc, re.S)
    m_chap = re.search(r"🎞️影片段落：(.*?)(?:\n\s*📣|\n\s*$)", desc, re.S)
    outline_txt = m_outline.group(1) if m_outline else ""
    chap_txt = m_chap.group(1) if m_chap else ""

    # 章節
    chapters = []
    for line in chap_txt.splitlines():
        line = line.strip()
        if not line:
            continue
        mc = CHAP_RE.match(line)
        if mc:
            h, mi, s, name = int(mc.group(1)), int(mc.group(2)), int(mc.group(3)), mc.group(4)
            chapters.append({"sec": h * 3600 + mi * 60 + s, "name": name})
    chapters.sort(key=lambda c: c["sec"])

    # 提綱：切成 (節標題, 題目清單)
    blocks = []
    cur_section = None
    cur_q = None
    for raw in outline_txt.splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        ms = SECTION_RE.match(line)
        if ms and not NUM_RE.match(line):
            cur_section = ms.group(2).strip()
            continue
        mn = NUM_RE.match(line)
        if mn:
            cur_q = {"no": int(mn.group(1)), "text": mn.group(2).strip(), "subs": []}
            blocks.append({"section": cur_section, "q": cur_q})
            continue
        msub = SUB_RE.match(line)
        if msub and cur_q is not None:
            cur_q["subs"].append((msub.group(1), msub.group(2).strip()))
            continue
    return blocks, chapters


def build_disclosures(blocks, chapters):
    """把章節對應到題目，產生開示區間

    章節結構（官方慣例）：
        0:06:48 第1題⑴          ← 主持人讀題
        0:17:43 第1題⑵          ← 同一題的下一個子題
        0:31:37 法師指導 1:29:04 ← 法師開示（起點在此，括號為結束時間）

    規則：
      - 一題可能有多個「讀題」章節（第N題⑴、第N題⑵…），
        其後的第一個「法師指導」章節即為該題的開示起點，
        標籤合併所有子題（第N題⑴⑵）
      - 開示「終點」= 下一個章節的時間（不限題目型章節），
        使區間涵蓋整段開示而不切斷
      - 沒有「法師指導」章節的題目 → 沒有開示連結
    """
    # 1) 依序掃描章節
    #    qgroups: 每題的讀題章節群（同一題可能有多個子題章節）
    qgroups = []       # {no, subs:[...], chap_secs:[...], teach_sec, teach_end}
    cur = None
    for c in chapters:
        name = c["name"]
        m = CHAP_Q_RE.match(name)
        if m:
            no = int(m.group(1))
            subs = [ch for ch in m.group(2) if ch in SUB_CHARS]
            if cur is not None and cur["no"] == no and cur["teach_sec"] is None:
                # 同一題的後續子題章節，併入同一組
                cur["subs"].extend(subs)
                cur["chap_secs"].append(c["sec"])
            else:
                cur = {"no": no, "subs": list(subs), "chap_secs": [c["sec"]],
                       "teach_sec": None, "teach_end": None}
                qgroups.append(cur)
            continue
        if name.startswith("法師指導"):
            hms = None
            mt = CHAP_T_RE.match(name)
            if mt and mt.group(3):
                hms = mt.group(3)
            else:
                mm = re.search(r"(\d+:\d\d:\d\d)\s*$", name)
                if mm:
                    hms = mm.group(1)
            endsec = None
            if hms:
                hh, mi, ss = hms.split(":")
                endsec = int(hh) * 3600 + int(mi) * 60 + int(ss)
            # 法師指導隸屬「最近一個尚未配對開示的題目組」
            if cur is not None and cur["teach_sec"] is None:
                cur["teach_sec"] = c["sec"]
                cur["teach_end"] = endsec
    if not qgroups:
        return []

    # 2) 組出開示區間
    out = []
    chap_secs = [c["sec"] for c in chapters]
    for s in qgroups:
        if s["teach_sec"] is None:
            continue                      # 沒有法師指導 → 沒有開示
        start = s["teach_sec"]
        after = [t for t in chap_secs if t > start]
        end = min(after) if after else s["teach_end"]
        label_subs = "".join(s["subs"]) if s["subs"] else ""
        out.append({"no": s["no"], "sub": label_subs,
                    "start": start, "end": end, "subs": s["subs"]})
    return out


def assign(blocks, disclosures):
    """把開示配對到題目

    sub == ""   → 整題開示（qlevel）
    sub == "⑴⑵" → 該題子題⑴⑵ 一起開示（sublevel，標籤保留原文）
    """
    by_q = {}
    for d in disclosures:
        by_q.setdefault(d["no"], []).append(d)
    for b in blocks:
        q = b["q"]
        items = by_q.get(q["no"], [])
        b["qlevel"] = [d for d in items if not d["sub"]]
        b["sublevel"] = [d for d in items if d["sub"]]
    return blocks


def fmt_time(sec):
    h, r = divmod(int(sec), 3600)
    m, s = divmod(r, 60)
    return f"{h}:{m:02d}:{s:02d}"


def fmt_dur(sec):
    h, r = divmod(int(sec), 3600)
    m, s = divmod(r, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def fmt_range(a, b):
    if b is None:
        return fmt_time(a) + "–"
    return fmt_time(a) + "–" + fmt_time(b)


# ---------------------------------------------------------------------------
# 渲染
# ---------------------------------------------------------------------------
def render(lectures, playlist_id, meta):
    out = []
    toc = []
    n_q = n_link = n_none = 0

    for idx, L in enumerate(lectures):
        vid = L["video_id"]
        title = L["title"]
        dur = L.get("duration")
        blocks = L.get("blocks", [])
        discl = L.get("disclosures", [])

        sec_id = f"v{idx}"
        toc.append((sec_id, title))

        out.append(f'<section class="lecture" id="{sec_id}">')
        out.append(
            f'<h2><a class="anchor" href="#{sec_id}" '
            f'title="複製本講連結">#</a> {html_mod.escape(title)}</h2>')
        meta_html = [f'\U0001F3AC <a href="https://www.youtube.com/watch?v={vid}&amp;t=0s" '
                     f'target="_blank" rel="noopener">開頭</a>']
        if dur:
            meta_html.append(f'⏱ {fmt_dur(dur)}')
        meta_html.append(f'<a href="https://www.youtube.com/watch?v={vid}" '
                         f'target="_blank" rel="noopener">YouTube</a>')
        meta_html.append(f'<a href="https://www.youtube.com/playlist?list={playlist_id}" '
                         f'target="_blank" rel="noopener">播放列表</a>')
        out.append(f'<p class="meta">{" ｜ ".join(meta_html)}</p>')

        if not blocks:
            out.append('<p class="none">此影片說明欄未附共學提綱。</p>')
            out.append('</section>')
            continue

        cur_section = None
        for b in blocks:
            q = b["q"]
            if b["section"] != cur_section:
                cur_section = b["section"]
                if cur_section:
                    out.append(f'<div class="section"><h3>{html_mod.escape(cur_section)}</h3>')

            n_q += 1
            qtext = q["text"]
            undisc = UNDISCUSSED in qtext
            if undisc:
                qtext = qtext.replace(UNDISCUSSED, "").replace("※", "").strip()
            out.append('<div class="q">')
            out.append(f'<div class="qhead"><span class="qnum">第{q["no"]}題</span> '
                       f'{html_mod.escape(qtext)}</div>')

            if q["subs"]:
                out.append('<ul class="subs">')
                for mark, text in q["subs"]:
                    cls = ' class="undecided"' if UNDISCUSSED in text else ''
                    clean = text.replace(UNDISCUSSED, "").replace("※", "").strip()
                    out.append(f'<li{cls}><span class="mk">{mark}</span> '
                               f'{html_mod.escape(clean)}</li>')
                out.append('</ul>')

            # 開示
            links = []
            for d in b.get("qlevel", []):
                links.append((d, f'第{q["no"]}題'))
            for d in b.get("sublevel", []):
                links.append((d, f'第{q["no"]}題{d["sub"]}'))

            if links:
                out.append('<div class="disclose">')
                out.append('<span class="dlabel">法師開示</span>')
                for d, label in links:
                    t = d["start"]
                    rng = fmt_range(d["start"], d["end"])
                    out.append(f'<a class="dlink" href="https://www.youtube.com/watch?v={vid}'
                               f'&amp;t={t}s" target="_blank" rel="noopener">▶ {rng}</a>')
                    out.append(f'<span class="dtags">對應 {html_mod.escape(label)}</span>')
                    n_link += 1
                out.append('</div>')
            else:
                out.append('<div class="disclose none"><span class="dlabel">法師開示</span>'
                           '<span class="dtags">此題該講未討論（他日再論）</span></div>')
                n_none += 1
            out.append('</div>')  # /q

        if cur_section:
            out.append('</div>')  # /section
        out.append('</section>')

    # 統計
    stats = meta.get("stats", [])
    stats_html = "".join(f'<span>{html_mod.escape(s)}</span>' for s in stats)

    toc_html = "\n".join(
        f'<li><a href="#{sid}">{html_mod.escape(t)}</a></li>' for sid, t in toc)


    doc = f"""<!DOCTYPE html>
<html lang="zh-Hant"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html_mod.escape(meta.get("doc_title", "《釋量論・第二品》大組共學"))}</title>
<style>{CSS}</style></head><body>
<div id="q"><input id="qbox" type="search" placeholder="搜尋提綱、開示、題目…" autocomplete="off">
<button id="qclear" title="清除（Esc）" aria-label="清除搜尋">✕</button></div>
<div id="qcount"></div>
<div class="wrap">
<nav id="toc"><h1>{html_mod.escape(meta.get("toc_title", "釋量論・第二品 大組共學"))}</h1>
<div class="sub">{html_mod.escape(meta.get("toc_sub", ""))}</div>
<ol>
{toc_html}
</ol></nav>
<main><header class="top">
<h1>{html_mod.escape(meta.get("h1", "討論提綱與法師開示對照"))}</h1>
<p>{html_mod.escape(meta.get("lede", ""))}</p>
<p>{html_mod.escape(meta.get("lede2", ""))}</p>
<div class="stats">{stats_html}</div>
</header>
{chr(10).join(out)}
<footer><p>{meta.get("footer", "")}</p></footer>
</main></div>
<button id="tocbtn">☰ 目錄</button>
<script>{JS}</script></body></html>
"""
    return doc, {"questions": n_q, "links": n_link, "none": n_none,
                 "lectures": len(lectures)}


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--playlist", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--cache", default=None,
                    help="description 快取檔（JSON），避免重複抓取")
    ap.add_argument("--title", default="大組共學",
                    help="課程名稱（用於頁面標題、目錄標題與頁尾出處）")
    args = ap.parse_args()

    pl = fetch_playlist(args.playlist)
    print(f"播放清單：{len(pl)} 支影片", file=sys.stderr)

    cache = {}
    if args.cache and os.path.exists(args.cache):
        cache = json.load(open(args.cache, encoding="utf-8"))

    lectures = []
    for i, v in enumerate(pl):
        vid = v["id"]
        title = v.get("title") or vid
        # 去掉片尾的頻道後綴
        title = re.split(r"｜| \| ", title)[0].strip()
        dur = v.get("duration")
        if vid not in cache:
            d = fetch_detail(vid)
            if d is None:
                print(f"  [{i+1}/{len(pl)}] {vid} 無法取得（私人影片？）略過", file=sys.stderr)
                continue
            cache[vid] = {"description": d.get("description", ""),
                          "duration": d.get("duration"),
                          "title": d.get("title", ""),
                          "upload_date": d.get("upload_date", "")}
            print(f"  [{i+1}/{len(pl)}] {vid} {title}", file=sys.stderr)
        else:
            print(f"  [{i+1}/{len(pl)}] {vid} (cache) {title}", file=sys.stderr)

        blocks, chapters = parse_description(cache[vid]["description"])
        disclosures = build_disclosures(blocks, chapters)
        blocks = assign(blocks, disclosures)
        dur = dur or cache[vid].get("duration")

        lectures.append({"video_id": vid, "title": title, "duration": dur,
                         "blocks": blocks, "disclosures": disclosures,
                         "upload_date": cache[vid].get("upload_date", "")})

    if args.cache:
        json.dump(cache, open(args.cache, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)

    n_with = sum(1 for L in lectures if L["blocks"])
    n_lect = len(lectures)
    n_priv = len(pl) - n_lect
    doc, st = render(lectures, args.playlist, meta={
        "doc_title": f"{args.title} — 討論提綱與法師開示對照",
        "toc_title": args.title,
        "toc_sub": "討論提綱 ＋ 法師開示直接連結",
        "h1": "討論提綱與法師開示對照",
        "lede": "每一講的共學提綱，每一題附法師開示的 YouTube 直接連結（點擊跳到該段開示）。",
        "lede2": "時間碼取自官方 YouTube 章節；題號與子題對應取自影片說明欄「共學提綱」與「影片段落」。",
        "stats": [],
        "footer": (
            f"資料來源：{args.title} YouTube 播放清單 "
            f"<code>{args.playlist}</code>（{len(pl)} 支影片"
            + (f"；其中 {n_priv} 支為私人影片，未列於本頁" if n_priv else "")
            + "）。時間碼取自各影片說明欄的官方章節，非人工聽核。"
        ),
    })

    # 統計列
    stats = [
        f'{st["lectures"]} 支影片',
        f'{st["questions"]} 題',
        f'{st["links"]} 個開示連結',
        f'{st["questions"] - st["none"]} 題有開示',
        f'{st["none"]} 題未討論',
    ]
    doc = doc.replace('<div class="stats"></div>',
                      '<div class="stats">' + "".join(f'<span>{s}</span>' for s in stats) + '</div>')

    with open(args.out, "w", encoding="utf-8") as f:
        f.write(doc)
    print(f"已輸出 {args.out}", file=sys.stderr)
    print(json.dumps(st, ensure_ascii=False))


if __name__ == "__main__":
    main()

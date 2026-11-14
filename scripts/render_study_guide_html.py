#!/usr/bin/env python3
"""
render_study_guide_html.py

將講記 Markdown 文件轉換為具備「即時原音/原影播放」與「課堂原話對照抽屜」功能的獨立高質感網頁 HTML。
特色：
1. 支援官方 MP3 音檔常駐播放器與 YouTube IFrame API 即時跳轉播放器。
2. 點擊任何段首時間戳 [▶ mm:ss] 或原話單句，播放器立即跳轉至該秒數播放並高亮段落。
3. 自動由 verbatim/verbatim_{sid}.json 或對應的 sessions/session_*.json 依段落時間區間擷取課堂原話對照。
4. 嚴格比照法師講記排版美學（紅字大標題、典雅襯線字體、偈頌引言框、研讀大綱專區）。
"""

import json
import re
import sys
from html import escape
from pathlib import Path


def format_mmss(seconds: float) -> str:
    sec = max(0, int(seconds))
    return f"{sec // 60:02d}:{sec % 60:02d}"


def highlight_quotes(text: str) -> str:
    return re.sub(
        r'(「[^」]+」|『[^』]+』)',
        r'<span class="treatise-quote">\1</span>',
        text
    )


def resolve_session_data(md_path: Path, sid: str, youtube_id: str) -> dict:
    sessions_dir = md_path.parent.parent / "sessions"
    direct_path = sessions_dir / f"session_{sid}.json"
    if direct_path.exists():
        return json.loads(direct_path.read_text(encoding="utf-8"))
    if youtube_id and sessions_dir.exists():
        for cand in sorted(sessions_dir.glob("session_*.json")):
            try:
                data = json.loads(cand.read_text(encoding="utf-8"))
            except Exception:
                continue
            if data.get("youtubeVideoId") == youtube_id:
                return data
    return {}


def build_verbatim_map_from_session(session_data: dict, para_seconds: list[int]) -> dict:
    if not session_data or not para_seconds:
        return {}
    all_sents = [
        s for p in session_data.get("paragraphs", [])
        for s in p.get("sentences", [])
        if isinstance(s.get("start"), (int, float))
    ]
    if not all_sents:
        return {}
    duration = (
        session_data.get("_meta", {}).get("durationSeconds")
        or max((s.get("end", 0) for s in all_sents), default=0)
        or 999999
    )
    vmap = {}
    for idx, start_sec in enumerate(para_seconds):
        next_sec = duration
        for later_sec in para_seconds[idx + 1:]:
            if later_sec > start_sec:
                next_sec = later_sec
                break
        window_end = min(next_sec, start_sec + 2400)
        matched = [
            {
                "id": s.get("id", ""),
                "start": s.get("start", 0),
                "end": s.get("end", 0),
                "speaker": s.get("speaker", ""),
                "text": s.get("text", ""),
            }
            for s in all_sents
            if start_sec <= s.get("start", 0) < window_end
        ]
        if matched:
            vmap[f"p_{idx + 1}"] = matched
    return vmap


def md_to_html(md_path: Path) -> Path:
    text = md_path.read_text(encoding="utf-8")
    sid = md_path.stem.replace("lecture_", "").replace("_study_guide", "")

    # Extract MP3 or YouTube URL
    audio_match = re.search(r'\]\((https?://buddha\.flyday\.com\.tw/[^\s]+?\.MP3)\)', text, re.IGNORECASE)
    if not audio_match:
        audio_match = re.search(r'(https?://buddha\.flyday\.com\.tw/[^\s)>]+?\.MP3)', text, re.IGNORECASE)
    audio_url = audio_match.group(1).split('#')[0] if audio_match else ""

    yt_match = re.search(r'https?://(?:www\.)?youtube\.com/watch\?v=([A-Za-z0-9_-]{11})', text)
    youtube_id = yt_match.group(1) if yt_match else ""

    session_data = resolve_session_data(md_path, sid, youtube_id)
    if not audio_url and not youtube_id and session_data.get("audioUrl"):
        audio_url = session_data.get("audioUrl", "")

    quality = session_data.get("qualityReview", {}) if session_data else {}
    verbatim_label = escape(quality.get("verbatimLabel") or "逐字忠實原話・僅校錯別字與語氣詞")

    verbatim_path = md_path.parent.parent / "verbatim" / f"verbatim_{sid}.json"
    verbatim_map = {}
    verbatim_keys_order = []
    if verbatim_path.exists():
        vdata = json.loads(verbatim_path.read_text(encoding="utf-8"))
        verbatim_map = vdata.get("paragraphs", {})
        verbatim_keys_order = list(verbatim_map.keys())

    # Title extraction
    title_match = re.search(r'^#\s+(.+)$', text, re.MULTILINE)
    title = title_match.group(1) if title_match else md_path.stem

    # Replace timestamp links: [▶ 01:46](...#t=106) -> <button class="ts-btn" onclick="playAt(106, this)">▶ 01:46</button>
    def replace_ts(m):
        ts_text = m.group(1)
        seconds = int(float(m.group(2)))
        return f'<button class="ts-btn" onclick="event.stopPropagation(); playAt({seconds}, this)">{ts_text}</button>'

    content = re.sub(r'\[(▶\s*\d{2,3}:\d{2})\]\((?:.+?)(?:#t=|&t=)(\d+(?:\.\d+)?)s?\)', replace_ts, text)
    content = re.sub(r'\[([^\]]+)\]\((#sec-[a-zA-Z0-9_-]+)\)', r'<a class="toc-anchor-link" href="\2">\1</a>', content)

    # Process blockquotes
    lines = content.split('\n')
    in_quote = False
    new_lines = []
    for line in lines:
        if line.startswith('> '):
            if not in_quote:
                new_lines.append('<blockquote class="verse-quote">')
                in_quote = True
            new_lines.append(f'<p>{line[2:].strip()}</p>')
        else:
            if in_quote:
                new_lines.append('</blockquote>')
                in_quote = False
            new_lines.append(line)
    if in_quote:
        new_lines.append('</blockquote>')

    content = '\n'.join(new_lines)

    # Convert headings - ensure double newlines around them so following lines aren't fused
    content = re.sub(r'^(#{1,3})\s+(.+)$', r'\n\n\1 \2\n\n', content, flags=re.MULTILINE)
    content = re.sub(r'^###\s+(.+)$', r'<h3>\1</h3>', content, flags=re.MULTILINE)
    sec_counter = [0]
    def replace_h2(m):
        inner = m.group(1)
        explicit_id = re.search(r'\s*\{#([a-zA-Z0-9_-]+)\}\s*$', inner)
        if explicit_id:
            hid = explicit_id.group(1)
            inner = inner[:explicit_id.start()]
            return f'<h2 id="{hid}">{inner}</h2>'
        if 'class="ts-btn"' in inner:
            sec_counter[0] += 1
            return f'<h2 id="sec-{sec_counter[0]}">{inner}</h2>'
        return f'<h2>{inner}</h2>'
    content = re.sub(r'^##\s+(.+)$', replace_h2, content, flags=re.MULTILINE)
    content = re.sub(r'^#\s+(.+)$', r'<h1>\1</h1>', content, flags=re.MULTILINE)

    # Bold and Italic
    content = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', content)
    content = re.sub(r'\*(.+?)\*', r'<em>\1</em>', content)

    raw_blocks = [b.strip() for b in content.split('\n\n') if b.strip()]
    if not verbatim_map and session_data and not md_path.stem.endswith("_dialogue_transcript"):
        para_seconds = []
        for b in raw_blocks:
            if b.startswith(('<h', '<blockquote', '<hr', '---', '<div', '<details')) or re.match(r'^\d+\.\s', b):
                continue
            if any(line.strip().startswith(('* ', '- ')) for line in b.split('\n')):
                continue
            m = re.search(r'playAt\((\d+),\s*this\)', b)
            if m:
                para_seconds.append(int(m.group(1)))
        verbatim_map = build_verbatim_map_from_session(session_data, para_seconds)

    # Paragraphs
    paragraphs = []
    para_counter = 0
    current_speaker = ""
    for block in raw_blocks:
        if block.startswith('<h') or block.startswith('<blockquote') or block.startswith('<hr') or block.startswith('<div') or block.startswith('<details'):
            if block.startswith(('<div', '<hr')):
                current_speaker = ""
            if (block.startswith('<h2>【正文講記】</h2>') or block.startswith('<h2>二、各節問題與法師開示講記</h2>')) and verbatim_map:
                heading_text = re.sub(r'</?h2>', '', block)
                paragraphs.append(
                    '<div class="body-header-row">'
                    f'<h2>{heading_text}</h2>'
                    '<button type="button" id="toggle-all-verbatim" class="verbatim-global-btn" onclick="toggleAllVerbatim(this)">'
                    '💬 展開全部課堂原話'
                    '</button>'
                    '</div>'
                )
            else:
                paragraphs.append(block)
        elif any(line.strip().startswith(('* ', '- ')) for line in block.split('\n')):
            list_html = ['<ul class="meta-list">']
            in_nested = False
            for line in block.split('\n'):
                stripped = line.strip()
                if not stripped:
                    continue
                is_indented = line.startswith(('  ', '\t'))
                item_content = re.sub(r'^[\*\-\s]+', '', stripped)
                if is_indented:
                    if not in_nested:
                        list_html.append('<ul class="nested-list">')
                        in_nested = True
                    list_html.append(f'<li>{item_content}</li>')
                else:
                    if in_nested:
                        list_html.append('</ul>')
                        in_nested = False
                    list_html.append(f'<li>{item_content}</li>')
            if in_nested:
                list_html.append('</ul>')
            list_html.append('</ul>')
            paragraphs.append('\n'.join(list_html))
        elif re.match(r'^\d+\.\s', block):
            items = [f'<li>{re.sub(r"^\d+\.\s*", "", line).strip()}</li>' for line in block.split('\n') if re.match(r'^\d+\.\s', line)]
            paragraphs.append(f'<ol class="ordered-list">{"".join(items)}</ol>')
        elif block.startswith('---'):
            paragraphs.append('<hr class="divider"/>')
        else:
            ts_match = re.search(r'playAt\((\d+),\s*this\)', block)
            if ts_match:
                sec = ts_match.group(1)
                # If verbatim_keys_order exists, use the actual key in order, else fallback to f"p_{para_counter+1}"
                if verbatim_keys_order and para_counter < len(verbatim_keys_order):
                    p_id = verbatim_keys_order[para_counter]
                else:
                    p_id = f"p_{para_counter + 1}"
                para_counter += 1
                v_sents = verbatim_map.get(p_id, [])
                if v_sents:
                    toggle_btn = (
                        f'<button type="button" class="verbatim-toggle-btn" '
                        f'data-target="drawer-{p_id}" '
                        f'onclick="event.stopPropagation(); toggleVerbatimDrawer(\'drawer-{p_id}\', this)">'
                        f'💬 對照課堂原話 ({len(v_sents)}句) ▾</button>'
                    )
                    block_with_btn = re.sub(
                        r'(<button class="ts-btn"[^>]+>[^<]+</button>)',
                        r'\1' + toggle_btn,
                        block,
                        count=1
                    )
                    v_items = []
                    for vs in v_sents:
                        v_start = vs.get("start", 0)
                        v_mmss = format_mmss(v_start)
                        v_spk = vs.get("speaker", "")
                        if "學員" in v_spk:
                            spk_cls = "spk-student"
                        elif "維那" in v_spk or "主持" in v_spk:
                            spk_cls = "spk-host"
                        else:
                            spk_cls = "spk-geshe"
                        spk_html = f'<span class="v-spk {spk_cls}">【{v_spk}】</span>' if v_spk else ''
                        v_txt = highlight_quotes(vs.get("text", ""))
                        v_items.append(
                            f'<div class="v-item" onclick="event.stopPropagation(); playAt({v_start}, this)">'
                            f'<span class="v-ts">[{v_mmss}]</span>{spk_html}<span class="v-txt">{v_txt}</span>'
                            f'</div>'
                        )
                    drawer_html = (
                        f'<div id="drawer-{p_id}" class="verbatim-drawer" hidden>'
                        f'<div class="verbatim-drawer-head">'
                        f'<span>💬 課堂原話對照（{verbatim_label}・點擊單句跳轉原音）</span>'
                        f'<button type="button" class="verbatim-close-btn" onclick="event.stopPropagation(); toggleVerbatimDrawer(\'drawer-{p_id}\')">收合 ▴</button>'
                        f'</div>'
                        f'{"".join(v_items)}'
                        f'</div>'
                    )
                    paragraphs.append(
                        f'<div class="para-group">'
                        f'<p class="reading-para clickable-para" onclick="playPara({sec}, this, event)">{block_with_btn.replace(chr(10), "<br/>")}</p>'
                        f'{drawer_html}'
                        f'</div>'
                    )
                else:
                    spk_m = re.search(r'<strong>([^：<]{1,15})：</strong>', block)
                    if spk_m:
                        current_speaker = spk_m.group(1)
                    teacher_cls = " teacher-para" if current_speaker == "如性法師" else ""
                    paragraphs.append(f'<p class="reading-para clickable-para{teacher_cls}" onclick="playPara({sec}, this, event)">{block.replace(chr(10), "<br/>")}</p>')
            else:
                spk_m = re.search(r'<strong>([^：<]{1,15})：</strong>', block)
                if spk_m:
                    current_speaker = spk_m.group(1)
                teacher_cls = " teacher-para" if current_speaker == "如性法師" else ""
                paragraphs.append(f'<p class="reading-para{teacher_cls}">{block.replace(chr(10), "<br/>")}</p>')

    body_html = '\n'.join(paragraphs)

    if youtube_id and not audio_url:
        player_html = f"""  <div class="sticky-player yt-sticky-player">
    <div class="yt-frame-wrap">
      <iframe id="yt-iframe" width="240" height="68"
        src="https://www.youtube.com/embed/{youtube_id}?enablejsapi=1&rel=0"
        title="YouTube video player" frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen></iframe>
    </div>
    <div class="info" id="player-status">🎬 隨選隨聽：點擊任何段落時間戳或原話單句，立即跳轉 YouTube 原片對應秒數</div>
    <a id="yt-ext-link" class="yt-ext-btn" href="https://www.youtube.com/watch?v={youtube_id}" target="_blank" rel="noopener">📺 於 YouTube 開啟</a>
  </div>"""
    else:
        player_html = f"""  <div class="sticky-player">
    <div class="info" id="player-status">🎧 隨選隨聽：點擊任何段落文字或時間戳跳轉播放</div>
    <audio id="main-audio" controls preload="metadata" src="{audio_url}">
      您的瀏覽器不支援 HTML5 音訊標籤。
    </audio>
  </div>"""

    html = f"""<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <style>
    :root {{
      --primary: #991b1b;
      --primary-light: #fef2f2;
      --bg: #fafaf9;
      --card-bg: #ffffff;
      --text: #1c1917;
      --text-muted: #57534e;
      --border: #e7e5e4;
      --highlight: #fef08a;
    }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Noto Serif TC", "Source Han Serif TC", "PingFang TC", serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.85;
      padding: 0 0 120px 0;
      margin: 0;
    }}
    .container {{
      max-width: 860px;
      margin: 40px auto;
      padding: 48px;
      background: var(--card-bg);
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    }}
    h1 {{
      font-size: 2rem;
      color: var(--primary);
      text-align: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 2px solid var(--primary);
    }}
    h2 {{
      font-size: 1.45rem;
      color: #7f1d1d;
      margin-top: 40px;
      margin-bottom: 20px;
      padding-left: 12px;
      border-left: 4px solid var(--primary);
    }}
    h3 {{
      font-size: 1.2rem;
      color: var(--primary);
      margin-top: 28px;
      margin-bottom: 14px;
    }}
    .reading-para {{
      font-size: 1.08rem;
      margin-bottom: 20px;
      text-align: justify;
      transition: background 0.3s ease;
      padding: 8px 12px;
      border-radius: 6px;
    }}
    .reading-para.clickable-para {{
      cursor: pointer;
    }}
    .reading-para.clickable-para:hover {{
      background: #f5f5f4;
    }}
    .reading-para.active-para {{
      background: #fef9c3;
    }}
    .reading-para.teacher-para {{
      border-left: 4px solid #b45309;
      background: #fffbeb;
      padding-left: 16px;
    }}
    .reading-para.teacher-para.clickable-para:hover {{
      background: #fef3c7;
    }}
    .reading-para.teacher-para.active-para {{
      background: #fde68a;
    }}
    .learner-box {{
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-left: 4px solid #0284c7;
      border-radius: 8px;
      padding: 16px 20px;
      margin: 20px 0;
    }}
    .learner-box.compass-box {{
      border-left-color: #0d9488;
      background: #f0fdfa;
    }}
    .learner-box.summary-box {{
      border-left-color: #b45309;
      background: #fffbeb;
    }}
    .learner-box ul, .learner-box ol {{
      margin: 8px 0 4px 20px;
      padding: 0;
    }}
    .learner-box li {{
      margin-bottom: 6px;
    }}
    .self-check-card {{
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 12px 16px;
      margin: 14px 0;
      background: #ffffff;
    }}
    .self-check-card summary {{
      cursor: pointer;
      font-weight: 700;
      color: #7f1d1d;
      outline: none;
    }}
    .self-check-card[open] summary {{
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px dashed #e2e8f0;
    }}
    .toc-anchor-link {{
      color: #991b1b;
      text-decoration: none;
      border-bottom: 1px dotted #991b1b;
    }}
    .toc-anchor-link:hover {{
      color: #dc2626;
      border-bottom-style: solid;
    }}
    .ts-btn {{
      background: #dc2626;
      color: #ffffff;
      border: none;
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 0.88rem;
      font-family: monospace;
      font-weight: bold;
      cursor: pointer;
      margin-right: 8px;
      vertical-align: middle;
      transition: transform 0.1s, background 0.2s;
    }}
    .ts-btn:hover {{
      background: #b91c1c;
      transform: scale(1.05);
    }}
    .ts-btn:active {{
      transform: scale(0.95);
    }}
    .body-header-row {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 40px;
      margin-bottom: 20px;
    }}
    .body-header-row h2 {{
      margin: 0;
    }}
    .verbatim-global-btn {{
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }}
    .verbatim-global-btn:hover, .verbatim-global-btn.active {{
      background: #1d4ed8;
      color: #ffffff;
      border-color: #1d4ed8;
    }}
    .verbatim-toggle-btn {{
      background: #eef2ff;
      color: #3730a3;
      border: 1px solid #c7d2fe;
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      margin-right: 8px;
      vertical-align: middle;
      transition: all 0.15s;
    }}
    .verbatim-toggle-btn:hover, .verbatim-toggle-btn.open {{
      background: #4338ca;
      color: #ffffff;
      border-color: #4338ca;
    }}
    .verbatim-drawer {{
      margin: -10px 0 22px 12px;
      padding: 12px 16px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-left: 4px solid #4338ca;
      border-radius: 0 8px 8px 0;
      font-size: 0.96rem;
      line-height: 1.75;
    }}
    .verbatim-drawer-head {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.82rem;
      font-weight: 700;
      color: #4338ca;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px dashed #cbd5e1;
    }}
    .verbatim-close-btn {{
      background: none;
      border: none;
      color: #64748b;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
    }}
    .v-item {{
      padding: 4px 8px;
      border-radius: 5px;
      cursor: pointer;
      margin-bottom: 4px;
      transition: background 0.15s;
    }}
    .v-item:hover {{
      background: #e0e7ff;
    }}
    .v-ts {{
      font-family: monospace;
      font-size: 0.82rem;
      color: #64748b;
      margin-right: 6px;
    }}
    .v-spk {{
      font-size: 0.82rem;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 4px;
      margin-right: 4px;
    }}
    .spk-geshe {{
      color: #9a3412;
      background: #ffedd5;
    }}
    .spk-host {{
      color: #4d7c0f;
      background: #ecfccb;
    }}
    .spk-student {{
      color: #0369a1;
      background: #e0f2fe;
    }}
    .treatise-quote {{
      color: #7c2d5a;
      background: rgba(124, 45, 90, 0.08);
      border-bottom: 1px solid rgba(124, 45, 90, 0.4);
      font-weight: 600;
    }}
    .verse-quote {{
      background: #fffbeb;
      border-left: 4px solid #f59e0b;
      margin: 24px 0;
      padding: 16px 24px;
      border-radius: 4px;
      font-size: 1.05rem;
      line-height: 1.9;
    }}
    .meta-list, .ordered-list {{
      padding-left: 24px;
      margin-bottom: 20px;
    }}
    .meta-list li, .ordered-list li {{
      margin-bottom: 6px;
    }}
    .divider {{
      border: 0;
      height: 1px;
      background: var(--border);
      margin: 36px 0;
    }}
    /* Sticky Bottom Player */
    .sticky-player {{
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: #ffffff;
      border-top: 1px solid #d6d3d1;
      padding: 10px 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      box-shadow: 0 -4px 16px rgba(0,0,0,0.1);
      z-index: 999;
    }}
    .sticky-player .info {{
      font-size: 0.92rem;
      color: var(--text-muted);
      font-weight: 500;
    }}
    .sticky-player audio {{
      width: 100%;
      max-width: 600px;
      height: 42px;
    }}
    .yt-frame-wrap iframe {{
      border-radius: 6px;
      vertical-align: middle;
    }}
    .yt-ext-btn {{
      background: #dc2626;
      color: #ffffff;
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 6px;
      white-space: nowrap;
    }}
    .yt-ext-btn:hover {{
      background: #b91c1c;
    }}
  </style>
</head>
<body>

  <div class="container">
    {body_html}
  </div>

{player_html}

  <script>
    const audio = document.getElementById('main-audio');
    const ytIframe = document.getElementById('yt-iframe');
    const ytExtLink = document.getElementById('yt-ext-link');
    const youtubeId = "{youtube_id}";
    const status = document.getElementById('player-status');
    let currentActivePara = null;

    function playPara(seconds, paraEl, evt) {{
      if (evt) {{
        const sel = window.getSelection ? window.getSelection().toString() : '';
        if (sel && sel.length > 0) return;
      }}
      const btn = paraEl.querySelector('.ts-btn');
      playAt(seconds, btn || paraEl);
    }}

    function toggleVerbatimDrawer(drawerId, btnEl) {{
      const drawer = document.getElementById(drawerId);
      if (!drawer) return;
      const isHidden = drawer.hasAttribute('hidden');
      const btn = btnEl || document.querySelector(`[data-target="${{drawerId}}"]`);
      if (isHidden) {{
        drawer.removeAttribute('hidden');
        if (btn) {{
          btn.classList.add('open');
          btn.innerHTML = btn.innerHTML.replace('▾', '▴');
        }}
      }} else {{
        drawer.setAttribute('hidden', '');
        if (btn) {{
          btn.classList.remove('open');
          btn.innerHTML = btn.innerHTML.replace('▴', '▾');
        }}
      }}
    }}

    function toggleAllVerbatim(masterBtn) {{
      const drawers = document.querySelectorAll('.verbatim-drawer');
      const allOpen = Array.from(drawers).every(d => !d.hasAttribute('hidden'));
      drawers.forEach(d => {{
        const btn = document.querySelector(`[data-target="${{d.id}}"]`);
        if (allOpen) {{
          d.setAttribute('hidden', '');
          if (btn) {{
            btn.classList.remove('open');
            btn.innerHTML = btn.innerHTML.replace('▴', '▾');
          }}
        }} else {{
          d.removeAttribute('hidden');
          if (btn) {{
            btn.classList.add('open');
            btn.innerHTML = btn.innerHTML.replace('▾', '▴');
          }}
        }}
      }});
      if (masterBtn) {{
        masterBtn.classList.toggle('active', !allOpen);
        masterBtn.textContent = allOpen ? '💬 展開全部課堂原話' : '💬 收合全部課堂原話';
      }}
    }}

    function playAt(seconds, btnOrPara) {{
      if (currentActivePara) {{
        currentActivePara.classList.remove('active-para');
      }}
      const para = btnOrPara.closest ? btnOrPara.closest('.reading-para') : btnOrPara;
      if (para) {{
        currentActivePara = para;
        para.classList.add('active-para');
      }}
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      const mmss = `${{m.toString().padStart(2, '0')}}:${{s.toString().padStart(2, '0')}}`;

      if (ytIframe && youtubeId) {{
        try {{
          ytIframe.contentWindow.postMessage(JSON.stringify({{
            event: 'command',
            func: 'seekTo',
            args: [seconds, true]
          }}), '*');
          ytIframe.contentWindow.postMessage(JSON.stringify({{
            event: 'command',
            func: 'playVideo',
            args: []
          }}), '*');
        }} catch (e) {{
          ytIframe.src = `https://www.youtube.com/embed/${{youtubeId}}?start=${{Math.floor(seconds)}}&autoplay=1&enablejsapi=1&rel=0`;
        }}
        if (ytExtLink) {{
          ytExtLink.href = `https://www.youtube.com/watch?v=${{youtubeId}}&t=${{Math.floor(seconds)}}s`;
        }}
        status.innerText = `▶ 正在播放 YouTube 原片：${{mmss}}`;
        return;
      }}

      if (!audio) return;
      const applySeek = () => {{
        try {{
          audio.currentTime = seconds;
        }} catch (e) {{}}
      }};
      if (audio.readyState >= 1) {{
        applySeek();
      }} else {{
        audio.addEventListener('loadedmetadata', applySeek, {{ once: true }});
        audio.load();
      }}
      audio.play().then(() => {{
        status.innerText = `▶ 正在播放：${{mmss}}`;
      }}).catch(e => {{
        console.error('Play failed:', e);
        status.innerText = '⚠️ 播放受限，請點擊播放器播放按鈕';
      }});
    }}
  </script>
</body>
</html>
"""
    out_html = md_path.with_suffix(".html")
    out_html.write_text(html, encoding="utf-8")
    print(f"成功生成網頁：{out_html} (原話抽屜數: {len(verbatim_map)})")
    return out_html


if __name__ == "__main__":
    files = [Path(value) for value in sys.argv[1:]] if len(sys.argv) > 1 else Path("courses/入中論善顯密意疏/publications").glob("*.md")
    for md in files:
        md_to_html(md)

#!/usr/bin/env python3
"""
render_study_guide_html.py

將講記 Markdown 文件轉換為具備「即時原音播放」功能的獨立高質感網頁 HTML。
特色：
1. 底部常駐 HTML5 音訊播放器（直接串流官方音檔）。
2. 點擊任何段首時間戳 [▶ mm:ss]，播放器立即跳轉至該秒數播放並高亮段落。
3. 嚴格比照法師講記排版美學（紅字大標題、典雅襯線字體、偈頌引言框、研讀大綱專區）。
"""

import re
import sys
from pathlib import Path

def md_to_html(md_path: Path) -> Path:
    text = md_path.read_text(encoding="utf-8")

    # Extract audio URL - handle URLs containing parens e.g. p97(29).MP3
    audio_match = re.search(r'\]\((https?://buddha\.flyday\.com\.tw/[^\s]+?\.MP3)\)', text, re.IGNORECASE)
    if not audio_match:
        audio_match = re.search(r'(https?://buddha\.flyday\.com\.tw/[^\s)>]+?\.MP3)', text, re.IGNORECASE)
    audio_url = audio_match.group(1).split('#')[0] if audio_match else ""

    # Title extraction
    title_match = re.search(r'^#\s+(.+)$', text, re.MULTILINE)
    title = title_match.group(1) if title_match else md_path.stem

    # Replace timestamp links: [▶ 01:46](...#t=106) -> <button class="ts-btn" onclick="playAt(106, this)">▶ 01:46</button>
    # Match through to #t=(\d+) so that parenthesized audio URLs in markdown links don't truncate
    def replace_ts(m):
        ts_text = m.group(1)
        seconds = m.group(2)
        return f'<button class="ts-btn" onclick="event.stopPropagation(); playAt({seconds}, this)">{ts_text}</button>'

    content = re.sub(r'\[(▶\s*\d{2}:\d{2})\]\((?:.+?)#t=(\d+)\)', replace_ts, text)

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
    content = re.sub(r'^##\s+(.+)$', r'<h2>\1</h2>', content, flags=re.MULTILINE)
    content = re.sub(r'^#\s+(.+)$', r'<h1>\1</h1>', content, flags=re.MULTILINE)

    # Bold and Italic
    content = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', content)
    content = re.sub(r'\*(.+?)\*', r'<em>\1</em>', content)

    # Paragraphs
    paragraphs = []
    for block in content.split('\n\n'):
        block = block.strip()
        if not block:
            continue
        if block.startswith('<h') or block.startswith('<blockquote') or block.startswith('<hr'):
            paragraphs.append(block)
        elif any(line.strip().startswith(('* ', '- ')) for line in block.split('\n')):
            # Handle nested list
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
                paragraphs.append(f'<p class="reading-para clickable-para" onclick="playPara({sec}, this, event)">{block.replace(chr(10), "<br/>")}</p>')
            else:
                paragraphs.append(f'<p class="reading-para">{block.replace(chr(10), "<br/>")}</p>')

    body_html = '\n'.join(paragraphs)

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
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
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
  </style>
</head>
<body>

  <div class="container">
    {body_html}
  </div>

  <div class="sticky-player">
    <div class="info" id="player-status">🎧 隨選隨聽：點擊任何段落文字或時間戳跳轉播放</div>
    <audio id="main-audio" controls preload="metadata" src="{audio_url}">
      您的瀏覽器不支援 HTML5 音訊標籤。
    </audio>
  </div>

  <script>
    const audio = document.getElementById('main-audio');
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

    function playAt(seconds, btnOrPara) {{
      if (currentActivePara) {{
        currentActivePara.classList.remove('active-para');
      }}
      const para = btnOrPara.closest ? btnOrPara.closest('.reading-para') : btnOrPara;
      if (para) {{
        currentActivePara = para;
        para.classList.add('active-para');
      }}
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
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        status.innerText = `▶ 正在播放：${{m.toString().padStart(2, '0')}}:${{s.toString().padStart(2, '0')}}`;
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
    print(f"成功生成網頁：{out_html}")
    return out_html

if __name__ == "__main__":
    pub_dir = Path("courses/入中論善顯密意疏/publications")
    for md in pub_dir.glob("*.md"):
        md_to_html(md)

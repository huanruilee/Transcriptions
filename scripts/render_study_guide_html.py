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

    # Extract audio URL
    audio_match = re.search(r'\((https://buddha\.flyday\.com\.tw/[^)]+\.MP3[^)]*)\)', text)
    audio_url = audio_match.group(1).split('#')[0] if audio_match else ""

    # Title extraction
    title_match = re.search(r'^#\s+(.+)$', text, re.MULTILINE)
    title = title_match.group(1) if title_match else md_path.stem

    # Replace timestamp links: [▶ 01:46](...#t=106) -> <button class="ts-btn" onclick="playAt(106, this)">▶ 01:46</button>
    def replace_ts(m):
        ts_text = m.group(1)
        url = m.group(2)
        sec_match = re.search(r'#t=(\d+)', url)
        seconds = sec_match.group(1) if sec_match else "0"
        return f'<button class="ts-btn" onclick="playAt({seconds}, this)">{ts_text}</button>'

    content = re.sub(r'\[(▶\s*\d{2}:\d{2})\]\(([^)]+)\)', replace_ts, text)

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

    # Convert headings
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
        elif block.startswith('* ') or block.startswith('- '):
            items = [f'<li>{line[2:].strip()}</li>' for line in block.split('\n') if line.startswith(('* ', '- '))]
            paragraphs.append(f'<ul class="meta-list">{"".join(items)}</ul>')
        elif re.match(r'^\d+\.\s', block):
            items = [f'<li>{re.sub(r"^\d+\.\s*", "", line).strip()}</li>' for line in block.split('\n') if re.match(r'^\d+\.\s', line)]
            paragraphs.append(f'<ol class="ordered-list">{"".join(items)}</ol>')
        elif block.startswith('---'):
            paragraphs.append('<hr class="divider"/>')
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
    <div class="info" id="player-status">🎧 隨選隨聽：點擊文字前時間戳跳轉</div>
    <audio id="main-audio" controls src="{audio_url}">
      您的瀏覽器不支援 HTML5 音訊標籤。
    </audio>
  </div>

  <script>
    const audio = document.getElementById('main-audio');
    const status = document.getElementById('player-status');
    let currentActive = null;

    function playAt(seconds, btn) {{
      if (currentActive) {{
        currentActive.closest('.reading-para')?.classList.remove('active-para');
      }}
      currentActive = btn;
      const para = btn.closest('.reading-para');
      if (para) {{
        para.classList.add('active-para');
      }}
      audio.currentTime = seconds;
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

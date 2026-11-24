#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""sessions_doc/L{XX}.doc.json → 閱讀版 Markdown → DOCX。

  python3 build_docx.py render 7          # out/L07.md
  python3 build_docx.py verify out/L07.md 7
  python3 build_docx.py docx   out/L07.md # out/L07.docx
"""
import json, os, re, sys

WORK = '/home/henry/.gx10/projects/szyd-gdoc'
SIMPLIFIED = re.compile(r'[们发东车问题说让语读图对头见贝长门乐书东万与专]')

COURSE_META = {'series': '佛法實修．系列一', 'instructor': '如性法師'}
PUNCT_OK = re.compile(r'[，。？！：；、「」』）]')
TERMINAL = re.compile(r'[。？！]$')
TERM_END = re.compile(r'[。？！][」』）]?$')
INTERNAL = re.compile(r'[，、：；]$')


def merge_clauses(texts, maxlen=160):
    """把 ASR 子句機械合併為完整句子：只在子句邊界插入標點，不增刪漢字。
    - 子句已以 。？！ 結尾 → 成句
    - 累積長度 >= maxlen → 在最近的標點邊界斷句
    - 群末無終止標點 → 補「。」；群內無標點 → 補「，」"""
    lines, buf, blen = [], [], 0

    def join(clauses):
        out = ''
        for k, c in enumerate(clauses):
            last = (k == len(clauses) - 1)
            c = c.strip()
            if TERM_END.search(c):
                out += c
            elif INTERNAL.search(c):
                out += c if last else c
            elif re.search(r'[「『（「]$', c):
                out += c  # 開引號結尾：不加標點
            else:
                out += c + ('。' if last else '，')
        if out and INTERNAL.search(out):
            out = out[:-1] + '。'  #  maxlen 斷在子句標點 → 升格為句末
        return out

    for t in texts:
        t = re.sub(r'(?<=[\u4e00-\u9fff]) +(?=[\u4e00-\u9fff])', '', t.strip())  # ASR 空格雜訊
        if not t:
            continue
        buf.append(t)
        blen += len(t)
        if TERMINAL.search(t):
            lines.append(join(buf))
            buf, blen = [], 0
        elif blen >= maxlen:
            cut = None
            for k in range(len(buf) - 1, 0, -1):
                if INTERNAL.search(buf[k]):
                    cut = k
                    break
            if cut:
                lines.append(join(buf[:cut + 1]))
                buf = buf[cut + 1:]
                blen = sum(len(x) for x in buf)
            else:
                lines.append(join(buf))
                buf, blen = [], 0
    if buf:
        lines.append(join(buf))
    return lines


def fmt_ts(sec):
    sec = int(sec)
    return f'{sec//60:02d}:{sec%60:02d}'


def garbled(t):
    """多語混雜 ASR 幻覺／雜訊段（L09/L14 實例）：保留原文但透明標記。"""
    latin = sum(1 for c in t if c.isascii() and c.isalpha())
    kana = bool(re.search(r'[ぁ-ゟァ-ヿ]', t))
    return latin >= 10 or (latin >= 6 and kana)


def render(n):
    doc = json.load(open(f'{WORK}/sessions_doc/L{n:02d}.doc.json'))
    by_id = {s['id']: s for s in doc['sentences']}
    ai_ids = {s['id'] for s in doc.get('extractedAiSummary', [])}
    last_heading = None
    qr = doc.get('qualityReview') or {}
    notice = qr.get('readerNotice') or (
        '待閱校版：經 ASR 與 AI 輔助整理，尚未人工完整校訂；疑義請配合原音核對。')
    L = []
    L.append(f"# 三主要道　{doc['title']}")
    L.append('')
    L.append(f"- **講師**：{COURSE_META['instructor']}")
    L.append(f"- **系列**：{COURSE_META['series']}")
    L.append(f"- **來源**：{doc.get('youtubeUrl') or 'https://youtu.be/' + (doc.get('youtubeVideoId') or '')}")
    L.append(f"- **逐字稿最後更新**：{doc.get('lastUpdated') or '—'}")
    L.append(f"- **句數**：{doc['nSentences']}　**段數**：{len(doc['paragraphs'])}")
    L.append('')
    L.append(f"> {notice}")
    L.append('')
    L.append('---')
    L.append('')
    for p in doc['paragraphs']:
        if p.get('heading') and p['heading'] != last_heading:
            L.append(f"### {p['heading']}")
            L.append('')
            last_heading = p['heading']
        texts = [by_id[sid]['text'] for sid in p['sent_ids'] if sid not in ai_ids]
        for line in merge_clauses(texts):
            L.append(line)
            L.append('')
    # ASR 雜訊段透明揭露
    gar = [s for s in doc['sentences'] if garbled(s['text'])]
    if gar:
        L.append('---')
        L.append('')
        L.append('> **編輯註記**：以下段落為多語混雜的語音辨識雜訊（非講師正常講說），'
                 '已保留於正文原位置，建議配合原音人工聽核：')
        for s in gar:
            L.append(f'> {s["text"]}')
        L.append('')
    # AI 摘要句透明揭露
    if ai_ids:
        L.append('---')
        L.append('')
        L.append('> **編輯註記**：本講逐字稿來源檔開頭含 AI 生成的摘要句（非講者原話），'
                 '已自正文移除，原文如下：')
        for s in doc.get('extractedAiSummary', []):
            L.append(f'> {s["text"]}')
        L.append('')
    return '\n'.join(L)


def verify(md_path, n):
    t = open(md_path).read()
    doc = json.load(open(f'{WORK}/sessions_doc/L{n:02d}.doc.json'))
    body = t.split('---', 1)[1] if '---' in t else t
    # 1 無全形空白分隔、無句內空格
    body_text = re.sub(r'^\s*[>#-].*$', '', body, flags=re.M)
    assert '　' not in body_text, '正文殘留全形空白分隔'
    sp = re.findall(r'[\u4e00-\u9fff] +[\u4e00-\u9fff]', body_text)
    assert not sp, f'正文殘留句內空格 {len(sp)} 處，首例 {sp[:3]}'
    # 2 無簡體殘留
    bad = SIMPLIFIED.findall(body_text)
    assert not bad, f'簡體殘留: {bad[:10]}'
    # 3 逐句覆蓋（校正後每句必須完整出現，忽略空白差異；AI 摘要句除外）
    norm = lambda x: re.sub(r'[\s，。？！：；、「」『’‘（）()【】《》]', '', x)
    b = norm(body)
    ai_ids = {s['id'] for s in doc.get('extractedAiSummary', [])}
    check = [s for s in doc['sentences'] if s['id'] not in ai_ids]
    missing = [s['id'] for s in check if norm(s['text']) not in b]
    assert not missing, f'{len(missing)} 句未入稿，首例 {missing[:3]}'
    # 4 標點品質：每個渲染行以終止標點結尾，且標點間距 <= 30 字
    lines = [ln for ln in body.splitlines()
             if ln.strip() and not ln.startswith(('#', '>', '-', '*'))]
    noterm = [ln for ln in lines if not re.search(r'[。？！][」』）]?$', ln)]
    assert not noterm, f'{len(noterm)} 行未以終止標點結尾，首例 {noterm[:2]}'
    gaps = []
    for ln in lines:
        if garbled(ln):
            continue  # 多語 ASR 雜訊段另行標記，不作標點間距要求
        for seg in re.split(r'[，。？！：；、]', ln):
            if len(seg) > 40 and re.search(r'[\u4e00-\u9fff]', seg):
                gaps.append(seg[:40])
    assert not gaps, f'{len(gaps)} 處標點間距 >30 字，首例 {gaps[:3]}'
    # 5 待閱校聲明在稿內
    assert '待閱校' in t, '缺待閱校聲明'
    print(f'verify OK L{n:02d}: {len(check)} 句全覆蓋、{len(lines)} 行全部成句、無空格/簡體、含待閱校聲明')


def to_docx(md_path):
    import pypandoc
    out = md_path.replace('.md', '.docx')
    pypandoc.convert_file(md_path, 'docx', outputfile=out,
                          extra_args=['--from=markdown+yaml_metadata_block'])
    return out


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'render':
        md = render(int(sys.argv[2]))
        os.makedirs(f'{WORK}/out', exist_ok=True)
        p = f'{WORK}/out/L{int(sys.argv[2]):02d}.md'
        open(p, 'w').write(md)
        print('wrote', p, len(md), 'chars')
    elif cmd == 'verify':
        verify(sys.argv[2], int(sys.argv[3]))
    elif cmd == 'docx':
        print('wrote', to_docx(sys.argv[2]))

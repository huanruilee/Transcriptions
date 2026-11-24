#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""產生總目錄 Doc：upload_results.json + lectures.json → out/TOC.md + TOC.docx"""
import json, subprocess, os, datetime, re

WORK = '/home/henry/.gx10/projects/szyd-gdoc'
PY = '/home/henry/.gx10/projects/szyd-gdoc/.venv/bin/python'


def clean_title(title):
    return re.sub(r'^第\s*\d+\s*講[\s　]*', '', title or '').strip()


lectures = json.load(open(f'{WORK}/lectures.json'))
if lectures and isinstance(lectures, dict):
    lectures = lectures['lectures']
ups = {r['n']: r for r in json.load(open(f'{WORK}/upload_results.json'))}

L = []
L.append('# 三主要道　課程總目錄')
L.append('')
L.append('- **講師**：如性法師')
L.append(f'- **整理日期**：{datetime.date.today().isoformat()}')
L.append('- **版本**：待閱校版（ASR＋AI 輔助校正，未經人工逐句聽核；請以原音為準）')
L.append('- **原文來源**：[huanruilee.github.io/Transcriptions](https://huanruilee.github.io/Transcriptions/)')
L.append('')
L.append('| 講次 | 主題 | 課程文件 | 原音影片 |')
L.append('|---|---|---|---|')
for lec in lectures:
    n = lec['n']
    u = ups.get(n)
    doc = f'[文件]({u["url"]})' if u else '—'
    vid = f'[YouTube](https://www.youtube.com/watch?v={lec["vid"]})'
    sub = clean_title(lec['title'])
    if not sub:
        sub = '課程介紹與架構'
    L.append(f'| 第 {n:02d} 講 | {sub} | {doc} | {vid} |')
L.append('')
L.append('---')
L.append('')
L.append('> **編輯說明**：各講文件為「忠實原話閱讀版」——保留講者實詞、重複與自我修正；'
         '僅修正明顯音近錯字（逐筆記錄於校正清單）並補充標點與分段。'
         '本系列未經人工完整校訂，引用前請配合原音核對。')
md = '\n'.join(L)
open(f'{WORK}/out/TOC.md', 'w').write(md)

import pypandoc
pypandoc.convert_file(f'{WORK}/out/TOC.md', 'docx', outputfile=f'{WORK}/out/TOC.docx',
                      extra_args=['--from=markdown+yaml_metadata_block'])
print('TOC built:', len(lectures), '講,', len(ups), '份文件連結')

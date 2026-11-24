#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""上傳 24 講 docx 至 HuanruileeDrive 原生 Google Doc＋產生總目錄。
用法：python3 upload.py          # 全部
      python3 upload.py 7        # 只上傳第 7 講
"""
import json, subprocess, sys, time, os

WORK = '/home/henry/.gx10/projects/szyd-gdoc'
REMOTE = 'HuanruileeDrive'
FOLDER = f'{REMOTE}:如性法師/如性法師課程'
SIMPLIFIED_SAFE = True


def sh(cmd, timeout=300):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def rclone_json(args, retries=4):
    for i in range(retries):
        r = sh(['rclone'] + args)
        if r.returncode == 0:
            return json.loads(r.stdout)
        err = (r.stderr or '') + (r.stdout or '')
        if '429' in err or 'Queries per minute' in err or 'rate limit' in err.lower():
            time.sleep(65)
            continue
        raise RuntimeError(err[:500])
    raise RuntimeError('retries exhausted')


def clean_title(n, title):
    import re
    # 去掉重複的「第N講」前綴；若僅為「第 N 講」則無副題
    t = re.sub(r'^第\s*\d+\s*講[\s　]*', '', title or '')
    return t.strip()


def dest_stat(dest):
    try:
        return rclone_json(['lsjson', '-M', '--stat', dest])
    except Exception:
        return None


def upload(n, title):
    src = f'{WORK}/out/L{n:02d}.docx'
    assert os.path.exists(src), src
    sub = clean_title(n, title)
    name = f'三主要道 第{n:02d}講 {sub}（待閱校版）.docx' if sub else \
        f'三主要道 第{n:02d}講（待閱校版）.docx'
    dest = f'{FOLDER}/{name}'
    # 已存在且已是原生 Google Doc → 重用（避免 import 產生重複檔與新 ID）
    st = dest_stat(dest)
    if st and st.get('Metadata', {}).get('content-type') == 'application/vnd.google-apps.document':
        url = rclone_link(dest, st.get('ID'))
        return {'n': n, 'name': name, 'url': url, 'reused': True, 'id': st.get('ID')}
    if st:
        # 存在但不是原生 Doc（如先前純 .docx 上傳）→ 刪除避免同名雙檔
        sh(['rclone', 'deletefile', dest])
    for i in range(4):
        r = sh(['rclone', 'copyto', src, dest,
                '--drive-import-formats', 'docx', '--drive-allow-import-name-change'])
        if r.returncode == 0:
            break
        err = (r.stderr or '') + (r.stdout or '')
        if '429' in err or 'rate limit' in err.lower():
            time.sleep(65)
            continue
        raise RuntimeError(err[:500])
    # 驗證：原生 Google Doc
    st = dest_stat(dest)
    assert st, dest
    meta = st.get('Metadata', {})
    assert meta.get('content-type') == 'application/vnd.google-apps.document', st
    assert int(st.get('Size', 0)) == -1, st
    url = rclone_link(dest, st.get('ID'))
    return {'n': n, 'name': name, 'url': url, 'reused': False, 'id': st.get('ID')}


def rclone_link(dest, file_id=None):
    """原生 Google Doc 的可編輯連結。rclone link 可能回 drive.google.com/open?id=<ID>，
    需轉成 docs.google.com/document/d/<ID>/edit。"""
    url = None
    for i in range(4):
        r = sh(['rclone', 'link', dest])
        if r.returncode == 0 and r.stdout.strip():
            url = r.stdout.strip()
            break
        time.sleep(65)
    if not url:
        raise RuntimeError('link failed')
    if file_id:
        url = f'https://docs.google.com/document/d/{file_id}/edit'
    elif 'drive.google.com/open?id=' in url:
        url = 'https://docs.google.com/document/d/' + url.split('id=')[1].split('&')[0] + '/edit'
    assert '/document/d/' in url, url
    return url


def main():
    lectures = json.load(open(f'{WORK}/lectures.json'))
    if lectures and isinstance(lectures, dict):
        lectures = lectures['lectures']
    only = int(sys.argv[1]) if len(sys.argv) > 1 else None
    done_path = f'{WORK}/upload_results.json'
    results = json.load(open(done_path)) if os.path.exists(done_path) else []
    done_n = {r['n'] for r in results}
    for lec in lectures:
        n = lec['n']
        if only and n != only:
            continue
        if n in done_n:
            print(f'L{n:02d} 已上傳，略過', flush=True)
            continue
        print(f'L{n:02d} 上傳中…', flush=True)
        res = upload(n, lec['title'])
        results.append(res)
        json.dump(results, open(done_path, 'w'), ensure_ascii=False, indent=1)
        print(f'  ✓ {res["name"]} {res["url"]}', flush=True)
    print(f'完成 {len(results)} 講', flush=True)


if __name__ == '__main__':
    main()

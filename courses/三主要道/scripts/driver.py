#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""批次驅動：python3 driver.py 1 8  # 跑講次 1..8 全階段＋組版＋驗證"""
import subprocess, sys, traceback

PY = '/home/henry/.gx10/projects/szyd-gdoc/.venv/bin/python'
WORK = '/home/henry/.gx10/projects/szyd-gdoc'
lo, hi = int(sys.argv[1]), int(sys.argv[2])
ok, fail = [], []
for n in range(lo, hi + 1):
    try:
        print(f'===== L{n:02d} start =====', flush=True)
        cmds = [[PY, 'run_lecture.py', '--stage', 'all', '--lecture', str(n)],
                [PY, 'build_doc_json.py', str(n)],
                [PY, 'build_docx.py', 'render', str(n)],
                [PY, 'build_docx.py', 'verify', f'{WORK}/out/L{n:02d}.md', str(n)],
                [PY, 'build_docx.py', 'docx', f'{WORK}/out/L{n:02d}.md', f'{WORK}/out/L{n:02d}.docx']]
        good = True
        for c in cmds:
            r = subprocess.run(c, capture_output=True, text=True, timeout=7200, cwd=f'{WORK}/pipeline')
            print(r.stdout[-1500:], flush=True)
            if r.returncode != 0:
                print(r.stderr[-1500:], flush=True)
                good = False
                break
        (ok if good else fail).append(n)
        with open(f'{WORK}/PROGRESS.md', 'a') as f:
            f.write(f'- driver {lo}-{hi}: L{n:02d} {"OK" if good else "FAIL"}\n')
    except Exception:
        traceback.print_exc()
        fail.append(n)
print('DRIVER DONE ok=', ok, 'fail=', fail, flush=True)

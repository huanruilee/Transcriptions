#!/usr/bin/env python3
"""
download_flyday_79_102.py - Download sessions 79-102 audio from flyday.com.tw

Reads /tmp/flyday_79_102.txt (format: N\tname\turl) and downloads each audio
to /home/henry/audio_files/ with the original filename.

Usage: python3 download_flyday_79_102.py [--dry-run]
"""
import os
import sys
import urllib.request
import urllib.parse

DEST = "/home/henry/audio_files"
LIST = "/tmp/flyday_79_102.txt"

def main():
    dry_run = "--dry-run" in sys.argv
    os.makedirs(DEST, exist_ok=True)

    with open(LIST) as f:
        lines = [l.strip() for l in f if l.strip()]

    print(f"共 {len(lines)} 個音檔要下載")
    downloaded = 0
    skipped = 0
    failed = []

    for line in lines:
        parts = line.split('\t')
        if len(parts) < 3:
            continue
        n, name, url = parts[0], parts[1], parts[2]
        dest_path = os.path.join(DEST, name)

        if os.path.exists(dest_path) and os.path.getsize(dest_path) > 100000:
            print(f"[SKIP] {name} 已存在")
            skipped += 1
            continue

        if dry_run:
            print(f"[DRY] {name} -> {dest_path}")
            continue

        try:
            print(f"[DL] {name} ...", end='', flush=True)
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=120) as resp, open(dest_path, 'wb') as out:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    out.write(chunk)
            size = os.path.getsize(dest_path)
            print(f" OK ({size/1024/1024:.1f} MB)")
            downloaded += 1
        except Exception as e:
            print(f" FAIL: {e}")
            failed.append((name, str(e)))

    print(f"\n完成: 下載 {downloaded}, 跳過 {skipped}, 失敗 {len(failed)}")
    if failed:
        print("失敗清單:")
        for name, err in failed:
            print(f"  {name}: {err}")

if __name__ == "__main__":
    main()

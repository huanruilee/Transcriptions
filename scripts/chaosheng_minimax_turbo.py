#!/usr/bin/env python3
"""用 whisper-gpu-service（large-v3-turbo, vad off, beam 5, 名相 prompt）對候選音窗做二次辨識。

用途：MiniMax 審稿發現的旁證。注意此為 turbo 權重、與原始 ASR 同模型不同參數，
不是 full large-v3 的獨立複辨（full-v3 因 GPU 記憶體被 strata-qwen38 佔滿而無法載入）。

輸出：recheck/mm_turbo/<key>.json
"""
import concurrent.futures
import json
import mimetypes
import urllib.request
import uuid
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
WORK = REPO / "reviews" / "evidence" / "朝聖前行課程" / "work" / "minimax_review"
OUT = Path("/home/henry/.gx10/projects/chaosheng-qianxing-2026/recheck/mm_turbo")
API = "http://127.0.0.1:8010/v1/audio/transcriptions"

PROMPT = (
    "以下是如性法師《朝聖前行》課程錄音。名相：朝聖、歡喜欲見、憶念不忘、生戀慕心、"
    "藍毗尼、菩提迦耶、拘尸那羅、鹿野苑、靈鷲山、涅槃、般泥洹、澄淨信、勝解、"
    "四諦、依止力、對治力、遮罪力、作用力、皈依三寶、所化機、迴向、七支供養、"
    "請轉法輪、請佛住世、補特伽羅、攝類學、近取因、俱生緣。"
)


def post(path):
    boundary = uuid.uuid4().hex
    fields = {"language": "zh", "vad_filter": "false", "beam_size": "5",
              "condition_on_previous_text": "false", "initial_prompt": PROMPT}
    body = b""
    for k, v in fields.items():
        body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n").encode()
    ctype = mimetypes.guess_type(path.name)[0] or "audio/mpeg"
    body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; "
             f"filename=\"{path.name}\"\r\nContent-Type: {ctype}\r\n\r\n").encode()
    body += path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(API, data=body, method="POST",
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=600) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    findings = json.loads((WORK / "findings.json").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    keys = sorted({f"{f['session']}_{f['idx']:04d}" for f in findings
                   if f["type"] in ("term", "sound")})
    todo = []
    for key in keys:
        src = Path("/home/henry/.gx10/projects/chaosheng-qianxing-2026/recheck/mm_windows") / f"m{key}.mp3"
        if not src.exists():
            continue
        dst = OUT / f"m{key}.json"
        if dst.exists():
            continue
        todo.append((key, src, dst))
    print(f"todo={len(todo)} total_keys={len(keys)}", flush=True)

    def work(item):
        key, src, dst = item
        try:
            data = post(src)
            text = data.get("text", "")
        except Exception as exc:  # noqa: BLE001
            text = ""
            data = {"error": str(exc)[:200]}
        dst.write_text(json.dumps({"file": src.name, "text": text, "raw": data},
                                  ensure_ascii=False, indent=1), encoding="utf-8")
        return key, text[:60]

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for key, preview in pool.map(work, todo):
            print(f"{key} {preview}", flush=True)


if __name__ == "__main__":
    main()

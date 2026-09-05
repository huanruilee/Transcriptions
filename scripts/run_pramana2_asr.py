#!/usr/bin/env python3
"""
scripts/run_pramana2_asr.py

Batch ASR for 《釋量論第二品》(32 lectures) via whisper-gpu :8010.
Contract (per audio-transcription skill + 5sdBJ2Ro1K0 lesson):
  - vad_filter=true, condition_on_previous_text=true, no_speech_threshold=0.6
  - beam_size=5, patience=1.2, repetition_penalty=1.08
  - 因明 domain initial_prompt (seeded from 題綱 + 成量品 high-frequency terms)
Output: asr_out/pramana2/session_XX_raw.json (segments[] with start/end/text)
Idempotent: skips sessions whose raw json already exists and parses.
"""
import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

AUDIO_DIR = Path("/home/henry/audio_files/pramana2")
OUT_DIR = Path(__file__).resolve().parent.parent / "asr_out" / "pramana2"
ENDPOINT = "http://localhost:8010/v1/audio/transcriptions"

PRAMANA_INITIAL_PROMPT = (
    "以下是如性法師講授《釋量論第二品：成量品》的開示錄音，法稱論師造、法尊法師譯。"
    "包含專有名相：量士夫、現量、比量、再決知、義共相、自相、共相、近取因、增上緣、等無間緣、所緣緣、"
    "無欺誑認知、四諦、苦諦、集諦、滅諦、道諦、行相、無我、我執、大悲、菩提心、法稱論師、陳那菩薩、"
    "集量論、因三相、正因、周遍、勝義、世俗、二諦、自證、伺察、顛倒、錯亂識、剎那、相續、同體、異體、"
    "能立、所立、應成、自續、造物主、大自在天、聲聞、緣起、薩迦耶見、俱生我執、諦實成立。"
)


def asr_one(mp3: Path) -> dict:
    payload = {
        "language": "zh",
        "beam_size": "5",
        "patience": "1.2",
        "repetition_penalty": "1.08",
        "vad_filter": "true",
        "condition_on_previous_text": "true",
        "no_speech_threshold": "0.6",
        "initial_prompt": PRAMANA_INITIAL_PROMPT,
        "response_format": "verbose_json",
    }
    # multipart form without requests lib
    import mimetypes, uuid
    boundary = uuid.uuid4().hex
    body = b""
    for k, v in payload.items():
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    ctype = mimetypes.guess_type(str(mp3))[0] or "audio/mpeg"
    body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{mp3.name}\"\r\nContent-Type: {ctype}\r\n\r\n".encode()
    body += mp3.read_bytes() + f"\r\n--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        ENDPOINT, data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=3600) as resp:
        data = json.loads(resp.read().decode())
    data["_elapsed_seconds"] = round(time.perf_counter() - t0, 1)
    return data


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(AUDIO_DIR.glob("*.mp3"))
    print(f"found {len(files)} mp3")
    for f in files:
        # "01 - 釋量論第二品 32-1 調整學法的動機.mp3" -> session id "01"
        prefix = f.name.split(" - ")[0].strip().zfill(2)
        out = OUT_DIR / f"session_{prefix}_raw.json"
        if out.exists():
            try:
                json.loads(out.read_text(encoding="utf-8"))
                print(f"SKIP {prefix} (exists)")
                continue
            except json.JSONDecodeError:
                print(f"REDO {prefix} (corrupt)")
        print(f"ASR {prefix} <- {f.name}", flush=True)
        try:
            data = asr_one(f)
        except Exception as e:
            print(f"FAIL {prefix}: {e}", flush=True)
            continue
        segs = data.get("segments", [])
        out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"DONE {prefix}: {len(segs)} segments, {data['_elapsed_seconds']}s", flush=True)


if __name__ == "__main__":
    main()

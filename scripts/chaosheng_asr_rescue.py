#!/usr/bin/env python3
"""
scripts/chaosheng_asr_rescue.py

修補 Whisper VAD 把整段語音壓成填充詞的區段。

實測（lecture_01）：3428.9–3600.0（171 秒）的講話被轉成「呃,呃,呃,…」，
使該處的實質內容在逐字稿中完全消失（講者正在說明「經文先講念、再講行」）。
另一型是「長時段卻只有極短文字」（開經偈唱誦被壓成「請放掌,」）。

做法：
  1. 偵測可疑區段（填充詞佔比高／長時段極短文字／字密度過低），合併相鄰者。
  2. 以 ffmpeg 切出該區段（前後各留 1.5 s 上下文），改以 vad_filter=false 重跑 Whisper。
  3. 以上下文提示詞降低幻覺；把結果插回原 segment 序列並重新編號。
  4. 在 raw_asr.json 記錄 rescuedSpans / fillerSpans（原檔另存 .prev.json，可回溯）。

不得以此覆蓋已有可信內容：只替換被判定為填充的區段，其餘原樣保留。
"""

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
EVIDENCE = BASE / "reviews" / "evidence" / "朝聖前行課程"
PROJECT = Path("/home/henry/.gx10/projects/chaosheng-qianxing-2026")
AUDIO_DIR = PROJECT / "audio"
WORK = EVIDENCE / "work"

WHISPER_URL = "http://127.0.0.1:8010/v1/audio/transcriptions"

FILLER_TOKENS = ("呃", "嗯", "啊", "喔", "欸", "哈", "唔", "噢")
CONTEXT_SECONDS = 1.5
MIN_SPAN_SECONDS = 10.0
RESCUE_MAX_TIME = 1800


def core_text(text: str) -> str:
    return re.sub(r"[，,。、？?！!：:；;「」『』\s]", "", text)


def filler_ratio(text: str) -> float:
    core = core_text(text)
    if not core:
        return 1.0
    return max(core.count(token) / len(core) for token in FILLER_TOKENS)


def detect_spans(segments: list) -> list:
    spans = []
    current = None
    for seg in segments:
        span = seg["end"] - seg["start"]
        density = len(core_text(seg["text"])) / max(span, 0.1)
        bad = (filler_ratio(seg["text"]) >= 0.6
               or (span > 20 and len(core_text(seg["text"])) < 12)
               or (span > 15 and density < 0.5))
        if bad:
            if current and seg["start"] - current["end"] < 3.0:
                current["end"] = seg["end"]
                current["segmentIds"].append(seg["id"])
                current["reason"].append(
                    "repeated-filler" if filler_ratio(seg["text"]) >= 0.6 else
                    ("long-span-short-text" if span > 20 else "low-char-density"))
            else:
                if current:
                    spans.append(current)
                current = {"start": seg["start"], "end": seg["end"],
                           "segmentIds": [seg["id"]], "reason": []}
                current["reason"].append(
                    "repeated-filler" if filler_ratio(seg["text"]) >= 0.6 else
                    ("long-span-short-text" if span > 20 else "low-char-density"))
        else:
            if current:
                spans.append(current)
            current = None
    if current:
        spans.append(current)
    result = []
    for span in spans:
        span["durationSec"] = round(span["end"] - span["start"], 2)
        if span["durationSec"] >= MIN_SPAN_SECONDS:
            span["reason"] = sorted(set(span["reason"]))
            result.append(span)
    return result


def cut_audio(mp3: Path, start: float, end: float, out_path: Path) -> None:
    subprocess.check_call([
        "ffmpeg", "-v", "error", "-y", "-ss", f"{max(start, 0):.3f}",
        "-t", f"{max(end - start, 0.5):.3f}", "-i", str(mp3),
        "-ac", "1", "-ar", "16000", str(out_path),
    ])


def transcribe_slice(audio: Path, prompt: str, cache: Path) -> dict:
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    cmd = [
        "curl", "--max-time", str(RESCUE_MAX_TIME), "-sS", "-X", "POST", WHISPER_URL,
        "-F", f"file=@{audio}",
        "-F", "language=zh",
        "-F", "response_format=verbose_json",
        "-F", "beam_size=10",
        "-F", "temperature=0",
        "-F", "vad_filter=false",
        "-F", "condition_on_previous_text=true",
        "-F", f"initial_prompt={prompt}",
    ]
    last_error = None
    for attempt in (1, 2, 3):
        try:
            raw = subprocess.check_output(cmd, text=True)
            data = json.loads(raw)
            if data.get("segments") is not None:
                cache.parent.mkdir(parents=True, exist_ok=True)
                cache.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
                return data
            last_error = RuntimeError(f"whisper returned no segments: {raw[:200]}")
        except subprocess.CalledProcessError as err:
            last_error = err
        time.sleep(5 * attempt)
    raise last_error


def rescue_session(session_id: str, dry_run: bool = False) -> dict:
    path = EVIDENCE / f"lecture_{session_id}" / "raw_asr.json"
    artifact = json.loads(path.read_text(encoding="utf-8"))
    segments = artifact["segments"]
    spans = detect_spans(segments)
    print(f"[rescue] {session_id}: 可疑區段 {len(spans)} 個 → "
          + ", ".join(f"{s['start']:.1f}-{s['end']:.1f}({s['durationSec']}s,{','.join(s['reason'])})"
                      for s in spans), flush=True)
    if dry_run or not spans:
        return {"sessionId": session_id, "spans": spans, "rescued": []}

    mp3 = AUDIO_DIR / f"CSQX_{session_id}.mp3"
    slice_dir = WORK / "rescue_slices" / f"lecture_{session_id}"
    slice_dir.mkdir(parents=True, exist_ok=True)
    rescued = []
    new_segments = []
    cursor = 0
    for index, span in enumerate(spans):
        new_segments.extend([s for s in segments[cursor:]
                             if s["end"] <= span["start"] + 0.01])
        cursor_index = next(i for i, s in enumerate(segments)
                            if s["id"] == span["segmentIds"][0])
        context_text = ""
        if cursor_index > 0:
            context_text = segments[cursor_index - 1]["text"][-80:]
        prompt = (
            "以下是如性法師《朝聖前行：從歡喜欲見到依教奉行》課程錄音的片段，"
            "內容談朝聖與佛陀聖地，請用繁體中文逐字轉寫，"
            "不要輸出『呃』等無意義填充詞，寧可照實輸出語意。"
            + (f"前文：{context_text}" if context_text else "")
        )
        cut_start = max(span["start"] - CONTEXT_SECONDS, 0.0)
        cut_end = span["end"] + CONTEXT_SECONDS
        slice_path = slice_dir / f"slice_{index:02d}.wav"
        cut_audio(mp3, cut_start, cut_end, slice_path)
        data = transcribe_slice(slice_path, prompt,
                                WORK / "rescue_cache" / f"lecture_{session_id}" / f"slice_{index:02d}.json")
        offset = cut_start
        inserted = []
        for seg in data.get("segments", []):
            text = (seg.get("text") or "").strip()
            if not text:
                continue
            start = offset + float(seg["start"])
            end = offset + float(seg["end"])
            if end <= span["start"] + 0.05 or start >= span["end"] - 0.05:
                continue
            inserted.append({"start": round(start, 3), "end": round(end, 3), "text": text})
        new_segments.extend(inserted)
        rescued.append({
            "span": {"start": round(span["start"], 2), "end": round(span["end"], 2),
                     "durationSec": span["durationSec"], "reason": span["reason"],
                     "originalSegmentIds": span["segmentIds"]},
            "rescuedSegments": len(inserted),
            "rescuedChars": sum(len(s["text"]) for s in inserted),
            "rescuedText": "".join(s["text"] for s in inserted)[:400],
        })
        print(f"[rescue] {session_id} span {index + 1}/{len(spans)}: "
              f"{span['durationSec']}s → {len(inserted)} 段 / "
              f"{sum(len(s['text']) for s in inserted)} 字", flush=True)
        cursor = next(i for i, s in enumerate(segments)
                      if s["id"] == span["segmentIds"][-1]) + 1
    new_segments.extend(segments[cursor:])
    new_segments.sort(key=lambda s: s["start"])
    for number, seg in enumerate(new_segments, start=1):
        seg["id"] = number

    artifact["segments"] = new_segments
    artifact["segmentCount"] = len(new_segments)
    artifact["charCount"] = sum(len(s["text"]) for s in new_segments)
    artifact["rescuedSpans"] = rescued
    artifact["fillerSpans"] = spans
    backup = path.with_suffix(".prev.json")
    backup.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    path.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[rescue] {session_id}: 段數 {artifact['segmentCount']}、字數 {artifact['charCount']} → {path}",
          flush=True)
    return {"sessionId": session_id, "spans": spans, "rescued": rescued}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sessions", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    summary = []
    for session_id in [s.strip() for s in args.sessions.split(",") if s.strip()]:
        summary.append(rescue_session(session_id, dry_run=args.dry_run))
    (WORK / "rescue_report.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Model-agnostic one-pass proofreading CLI & deterministic guardrail assembler."""
import argparse
import concurrent.futures
import datetime
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ROUTER_URL = "http://100.113.144.100:18770/v1/chat/completions"
DEFAULT_PROMPT_PATH = DEFAULT_REPO_ROOT / "prompts" / "onepass_proofread_v2.md"

SIMPLIFIED_TO_TRADITIONAL = {
    "虽": "雖",
    "却": "卻",
    "这": "這",
    "为": "為",
    "体": "體",
    "学": "學",
    "师": "師",
    "义": "義",
    "论": "論",
    "说": "說",
    "对": "對",
    "问题": "問題",
    "会": "會",
    "国": "國",
    "经": "經",
    "时": "時",
    "过": "過",
    "还": "還",
    "进": "進",
    "异": "異",
    "间": "間",
    "发": "發",
    "请": "請",
    "决": "決",
    "没": "沒",
    "与": "與",
    "净": "淨",
    "现": "現",
    "觉": "覺",
    "样": "樣",
}

AUTHOR_TITLE_FIXES = (
    ("《聖天論師》", "聖天論師"),
    ("《法稱論師》", "法稱論師"),
    ("《陳那論師》", "陳那論師"),
)


def resolve_course_and_session(repo_root: Path, course_arg: str, session_arg: str) -> tuple[Path, Path]:
    """Resolve course directory (by dir name or catalog id) and session JSON path."""
    catalog_path = repo_root / "courses" / "catalog.json"
    course_dir = None
    direct_dir = repo_root / "courses" / course_arg
    if direct_dir.is_dir():
        course_dir = direct_dir
    elif catalog_path.exists():
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        for entry in catalog.get("courses", []):
            if entry.get("id") == course_arg or Path(entry.get("path", "")).name == course_arg:
                candidate = repo_root / entry["path"]
                if candidate.is_dir():
                    course_dir = candidate
                    break
    if course_dir is None:
        raise FileNotFoundError(f"Course not found: {course_arg}")

    clean = re.sub(r"^sessions/", "", session_arg.strip())
    clean = re.sub(r"\.json$", "", clean)
    m = re.match(r"^(?:session[_-])?(\d+)$", clean, re.IGNORECASE)
    filename = f"session_{int(m.group(1)):02d}.json" if m else f"{clean}.json"
    session_path = course_dir / "sessions" / filename
    if not session_path.exists():
        raise FileNotFoundError(f"Session file not found: {session_path}")
    return course_dir, session_path


def check_locked_session(repo_root: Path, session_path: Path) -> None:
    """Raise RuntimeError if session_path is pinned in config/locked-sessions.json."""
    locked_file = repo_root / "config" / "locked-sessions.json"
    if not locked_file.exists():
        return
    data = json.loads(locked_file.read_text(encoding="utf-8"))
    try:
        rel = session_path.resolve().relative_to(repo_root.resolve()).as_posix()
    except ValueError:
        rel = session_path.as_posix()
    for item in data.get("locked", []):
        if item.get("relativePath") == rel:
            reason = item.get("reason", "locked session")
            raise RuntimeError(f"Refusing to modify locked session {rel}: {reason}")


def build_dynamic_grounding(course_dir: Path, session_data: dict) -> str:
    """Build Layer 2 dynamic grounding block from grounding.json & learned_corrections.json."""
    lines = ["## 二、本講動態奠基"]
    grounding_path = course_dir / "grounding.json"
    title = session_data.get("title") or session_data.get("id") or ""
    if title:
        lines.append(f"- **講次標題**：{title}")

    if grounding_path.exists():
        g = json.loads(grounding_path.read_text(encoding="utf-8"))
        entities = g.get("entities") or {}
        instr = entities.get("instructor") or {}
        if instr.get("name"):
            mis = "、".join(instr.get("common_misrecognitions") or [])
            extra = f"（常見誤辨：{mis}）" if mis else ""
            lines.append(f"- **指導法師**：`{instr['name']}`{extra}")
        tb = entities.get("textbook") or {}
        if tb.get("title"):
            lines.append(f"- **課程教材**：{tb['title']}")
        works = entities.get("canonical_and_related_works") or []
        if works:
            work_names = "、".join(w.get("name", "") for w in works[:8] if w.get("name"))
            if work_names:
                lines.append(f"- **關聯經論**：{work_names}")

    # Study-group opening & verse guardrails
    lines.extend([
        "- **法師尊稱與開場禮敬**：開場 `禮靜法師` 應正字為 `禮敬法師`（**嚴禁改成 `如性法師`**；僅於實際稱呼如性法師處寫如性法師）。",
        "- **開經偈正字**：`無上甚深微妙法，百千萬劫難遭遇；我今見聞得受持，願解如來真實義。`",
        "- **迴向偈正字**：`遇此無上大師教，皆由上師深恩故，此善迴向諸眾生，願成善士攝受因。`",
    ])

    learned_path = course_dir / "learned_corrections.json"
    if learned_path.exists():
        try:
            lc = json.loads(learned_path.read_text(encoding="utf-8"))
            pairs = lc.get("replacements") or lc.get("dictionary") or {}
            if isinstance(pairs, dict) and pairs:
                sample = list(pairs.items())[:25]
                formatted = "、".join(f"`{k}`→`{v}`" for k, v in sample)
                lines.append(f"- **人工核定詞庫（最高優先級）**：{formatted}")
        except Exception:
            pass

    return "\n".join(lines)


def export_chunks(session_data: dict, num_chunks: int = 4) -> tuple[list[dict], list[str]]:
    """Flatten raw segments and split near paragraph boundaries into numbered chunk strings."""
    segs = []
    para_ends = []
    for p in session_data.get("paragraphs", []):
        for st in p.get("sentences", []):
            raw_val = st.get("rawText")
            if raw_val is None or str(raw_val).strip() == "":
                raw_val = st.get("text") or ""
            segs.append({
                "id": st.get("id", ""),
                "start": float(st.get("start", 0.0)),
                "end": float(st.get("end", 0.0)),
                "rawText": str(raw_val).strip(),
            })
        if segs:
            para_ends.append(len(segs))

    total = len(segs)
    if total == 0:
        return segs, []

    n = max(1, min(num_chunks, total))
    cuts = []
    if para_ends and n > 1:
        target = total / n
        for k in range(1, n):
            ideal = k * target
            best = min(para_ends, key=lambda idx: abs(idx - ideal))
            if best not in cuts and 0 < best < total:
                cuts.append(best)
    bounds = [0] + sorted(cuts) + [total]

    chunks = []
    for k in range(len(bounds) - 1):
        a, b = bounds[k], bounds[k + 1]
        lines = [
            f"{i + 1}|{segs[i]['start']:.2f}-{segs[i]['end']:.2f}|{segs[i]['rawText']}"
            for i in range(a, b)
        ]
        chunks.append("\n".join(lines) + "\n")
    return segs, chunks


def normalize_speaker(speaker: str, default_speaker: str = "學員") -> str:
    """Normalize speaker enum values (e.g., 維那/主持 -> 主持, 學員1 -> 學員)."""
    s = (speaker or "").strip()
    if not s:
        return default_speaker
    if s == "維那/主持":
        return "主持"
    if re.match(r"^學員\d+$", s):
        return "學員"
    return s


def normalize_text_deterministic(text: str) -> str:
    """Apply deterministic Taiwan Traditional Chinese & punctuation fixes while masking URLs."""
    if not text:
        return text

    urls = []

    def _mask_url(match):
        urls.append(match.group(0))
        return f"__URL_TOKEN_{len(urls) - 1}__"

    masked = re.sub(r"https?://\S+", _mask_url, text)

    # Multi-char replacement first, then single-char simplified->traditional
    masked = masked.replace("问题", "問題")
    for simp, trad in SIMPLIFIED_TO_TRADITIONAL.items():
        if len(simp) == 1:
            masked = masked.replace(simp, trad)

    # Curly quotes -> full-width corner brackets
    masked = masked.replace("“", "「").replace("”", "」")
    masked = masked.replace("‘", "『").replace("’", "』")

    # Buddhist & study-group deterministic fixes
    masked = masked.replace("回向", "迴向")
    for bad, good in AUTHOR_TITLE_FIXES:
        masked = masked.replace(bad, good)

    for idx, url in enumerate(urls):
        masked = masked.replace(f"__URL_TOKEN_{idx}__", url)
    return masked


def split_oversized_paragraphs(paragraphs: list[dict], max_sents: int = 35) -> list[dict]:
    """Split any paragraph exceeding max_sents into balanced chunks <= max_sents."""
    out = []
    for p in paragraphs:
        sents = p.get("sentences") or []
        if len(sents) <= max_sents:
            out.append(p)
            continue
        num_parts = (len(sents) + max_sents - 1) // max_sents
        chunk_size = (len(sents) + num_parts - 1) // num_parts
        for part_idx in range(num_parts):
            sub_sents = sents[part_idx * chunk_size : (part_idx + 1) * chunk_size]
            if not sub_sents:
                continue
            new_p = {
                "id": p.get("id", ""),
                "speaker": p.get("speaker", "學員"),
                "start": sub_sents[0]["start"],
                "end": sub_sents[-1]["end"],
                "sentences": sub_sents,
            }
            if part_idx == 0 and p.get("heading"):
                new_p["heading"] = p["heading"]
            out.append(new_p)
    return out


def throttle_dense_headings(paragraphs: list[dict], max_ratio: float = 0.45) -> list[dict]:
    """Drop overly dense headings when heading ratio exceeds max_ratio."""
    if not paragraphs:
        return paragraphs
    with_hd = sum(1 for p in paragraphs if p.get("heading"))
    if with_hd / len(paragraphs) <= max_ratio:
        return paragraphs

    last_kept_idx = -3
    prev_speaker = None
    for idx, p in enumerate(paragraphs):
        hd = p.get("heading")
        spk = p.get("speaker")
        if hd:
            keep = (idx == 0) or (spk != prev_speaker and idx - last_kept_idx >= 2) or (idx - last_kept_idx >= 3)
            if keep:
                last_kept_idx = idx
            else:
                p.pop("heading", None)
        prev_speaker = spk
    return paragraphs


def strip_fences_and_think(text: str) -> str:
    """Remove <think> blocks and markdown code fences from model output."""
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    lines = [ln for ln in cleaned.splitlines() if not ln.strip().startswith("```")]
    return "\n".join(lines).strip()


def assemble_corrected_chunks(
    base_session: dict,
    raw_segs: list[dict],
    chunk_outputs: list[str],
) -> tuple[dict, dict]:
    """Assemble @PARA + start-end|text outputs into a session dict with deterministic guardrails."""
    paragraphs = []
    format_errors = []
    covered_indices = set()

    for k, content in enumerate(chunk_outputs, 1):
        cur_para = None
        for lineno, line in enumerate(strip_fences_and_think(content).splitlines(), 1):
            s = line.strip()
            if not s:
                continue
            if s.startswith("@PARA"):
                m_spk = re.search(r"speaker=([^\s]+)", s)
                m_hd = re.search(r"heading=(.+)$", s)
                speaker = normalize_speaker(m_spk.group(1) if m_spk else "學員")
                para = {
                    "id": f"p_{len(paragraphs) + 1:04d}",
                    "speaker": speaker,
                    "start": 0.0,
                    "end": 0.0,
                    "sentences": [],
                }
                if m_hd:
                    hd = normalize_text_deterministic(m_hd.group(1).strip())
                    if hd and hd.lower() != "none":
                        para["heading"] = hd[:35]
                paragraphs.append(para)
                cur_para = para
                continue

            m = re.match(r"^(\d+)-(\d+)\|(.+)$", s)
            if m:
                i_start, i_end = int(m.group(1)), int(m.group(2))
                text = normalize_text_deterministic(m.group(3).strip())
            else:
                m_alt = re.match(r"^(\d+)\|\d+(?:\.\d+)?-\d+(?:\.\d+)?\|(.+)$", s)
                if not m_alt:
                    format_errors.append(f"chunk_{k} L{lineno}: unparseable: {s[:60]}")
                    continue
                i_start = i_end = int(m_alt.group(1))
                text = normalize_text_deterministic(m_alt.group(2).strip())
            if cur_para is None:
                format_errors.append(f"chunk_{k} L{lineno}: sentence before @PARA: {s[:60]}")
                continue
            if not (1 <= i_start <= i_end <= len(raw_segs)):
                format_errors.append(f"chunk_{k} L{lineno}: invalid range {i_start}-{i_end}")
                continue
            for idx in range(i_start, i_end + 1):
                covered_indices.add(idx)
            seg_slice = raw_segs[i_start - 1 : i_end]
            raw_text = "".join(c["rawText"] for c in seg_slice)
            cur_para["sentences"].append({
                "id": "",
                "speaker": cur_para["speaker"],
                "start": seg_slice[0]["start"],
                "end": seg_slice[-1]["end"],
                "text": text,
                "rawText": raw_text,
                "reviewNeeded": False,
            })

    paragraphs = [p for p in paragraphs if p["sentences"]]
    paragraphs = split_oversized_paragraphs(paragraphs, max_sents=35)
    paragraphs = throttle_dense_headings(paragraphs, max_ratio=0.45)

    sent_counter = 0
    for idx, p in enumerate(paragraphs):
        p["id"] = f"p_{idx + 1:04d}"
        for st in p["sentences"]:
            sent_counter += 1
            st["id"] = f"seg-{sent_counter:04d}"
            st["speaker"] = p["speaker"]
        p["start"] = p["sentences"][0]["start"]
        p["end"] = p["sentences"][-1]["end"]

    # Preserve any existing teacherSummary blocks by nearest start timestamp
    old_summaries = [
        (float(op.get("start", 0.0)), op["teacherSummary"])
        for op in base_session.get("paragraphs", [])
        if op.get("teacherSummary")
    ]
    if old_summaries and paragraphs:
        teacher_paras = [p for p in paragraphs if "法師" in (p.get("speaker") or "")] or paragraphs
        used_ids = set()
        for ts_start, ts_obj in old_summaries:
            candidates = [p for p in teacher_paras if p["id"] not in used_ids] or paragraphs
            best_p = min(candidates, key=lambda p: abs(float(p["start"]) - ts_start))
            best_p["teacherSummary"] = ts_obj
            used_ids.add(best_p["id"])

    out = dict(base_session)
    out["paragraphs"] = paragraphs
    out["lastUpdated"] = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).strftime("%Y-%m-%d")

    total_segs = len(raw_segs)
    cov_pct = round(100.0 * len(covered_indices) / total_segs, 2) if total_segs else 0.0
    stats = {
        "paragraphs": len(paragraphs),
        "sentences": sent_counter,
        "covered_raw_segs": len(covered_indices),
        "total_raw_segs": total_segs,
        "coverage_pct": cov_pct,
        "dropped_raw_segs": total_segs - len(covered_indices),
        "format_error_count": len(format_errors),
        "format_errors_sample": format_errors[:10],
    }
    return out, stats


def call_minimax_chunk(k: int, system_prompt: str, chunk_text: str, router_url: str, out_dir: Path) -> tuple[str, dict]:
    payload = {
        "model": "auto-cloud",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"以下為本次輸入資料（chunk_{k}）：\n{chunk_text}"},
        ],
        "max_tokens": 32768,
        "temperature": 0.2,
        "reasoning_split": True,
        "reasoning_effort": "low",
    }
    req = urllib.request.Request(
        router_url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            raw_body = resp.read().decode("utf-8")
            status = resp.status
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"MiniMax chunk_{k} HTTP {e.code}: {err_body[:400]}") from e

    elapsed = round(time.time() - t0, 2)
    resp_json = json.loads(raw_body)
    choice = (resp_json.get("choices") or [{}])[0]
    content = strip_fences_and_think((choice.get("message") or {}).get("content") or "")
    (out_dir / f"corrected_{k}.txt").write_text(content + "\n", encoding="utf-8")
    meta = {
        "chunk": k,
        "status": status,
        "elapsed_s": elapsed,
        "model": resp_json.get("model", ""),
        "finish_reason": choice.get("finish_reason"),
        "usage": resp_json.get("usage") or {},
    }
    return content, meta


def call_codex_chunk(k: int, system_prompt: str, chunk_text: str, out_dir: Path) -> tuple[str, dict]:
    full_prompt = f"{system_prompt}\n\n---\n以下為本次輸入資料（chunk_{k}）：\n{chunk_text}"
    out_txt = out_dir / f"corrected_{k}.txt"
    cmd = [
        "codex", "exec",
        "--skip-git-repo-check",
        "--ephemeral",
        "-s", "read-only",
        "-o", str(out_txt),
        "--json",
        "-",
    ]
    t0 = time.time()
    proc = subprocess.run(cmd, input=full_prompt, text=True, capture_output=True, timeout=600)
    elapsed = round(time.time() - t0, 2)
    if proc.returncode != 0 or not out_txt.exists():
        raise RuntimeError(f"Codex chunk_{k} failed (rc={proc.returncode}): {proc.stdout[-400:]}")
    content = strip_fences_and_think(out_txt.read_text(encoding="utf-8"))
    out_txt.write_text(content + "\n", encoding="utf-8")
    usage = {}
    for line in proc.stdout.splitlines():
        try:
            ev = json.loads(line)
            if ev.get("type") == "turn.completed":
                usage = ev.get("usage") or {}
        except json.JSONDecodeError:
            continue
    return content, {"chunk": k, "elapsed_s": elapsed, "usage": usage}


def call_gemini_chunk(k: int, system_prompt: str, chunk_text: str, out_dir: Path) -> tuple[str, dict]:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable is required for --provider gemini")
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": f"以下為本次輸入資料（chunk_{k}）：\n{chunk_text}"}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 32768},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=600) as resp:
        resp_json = json.loads(resp.read().decode("utf-8"))
    elapsed = round(time.time() - t0, 2)
    parts = (((resp_json.get("candidates") or [{}])[0]).get("content") or {}).get("parts") or []
    content = strip_fences_and_think("".join(p.get("text", "") for p in parts))
    (out_dir / f"corrected_{k}.txt").write_text(content + "\n", encoding="utf-8")
    return content, {"chunk": k, "elapsed_s": elapsed, "model": model, "usage": resp_json.get("usageMetadata") or {}}


def render_prompt(template_path: Path, course_dir: Path, session_data: dict) -> str:
    tpl = template_path.read_text(encoding="utf-8")
    grounding_block = build_dynamic_grounding(course_dir, session_data)
    return tpl.replace("{{DYNAMIC_GROUNDING}}", grounding_block)


def main() -> int:
    parser = argparse.ArgumentParser(description="Model-agnostic one-pass proofreading CLI.")
    parser.add_argument("--course", required=True, help="Course directory name or catalog id")
    parser.add_argument("--session", required=True, help="Session number or filename (e.g., 02)")
    parser.add_argument("--provider", choices=["minimax", "codex", "gemini"], default="minimax")
    parser.add_argument("--chunks", type=int, default=4)
    parser.add_argument("--router-url", default=DEFAULT_ROUTER_URL)
    parser.add_argument("--prompt", default=str(DEFAULT_PROMPT_PATH))
    parser.add_argument("--work-dir", help="Directory to store chunks, rendered prompt, and corrected_k.txt")
    parser.add_argument("--out", help="Output JSON path (defaults to <work-dir>/session_out.json)")
    parser.add_argument("--apply", action="store_true", help="Write assembled result back to target session JSON")
    parser.add_argument("--dry-run", action="store_true", help="Render prompt and export chunks only")
    parser.add_argument("--assemble-only", help="Re-assemble existing corrected_*.txt from this directory")
    parser.add_argument("--skip-preflight", action="store_true")
    parser.add_argument("--allow-warnings", action="store_true")
    args = parser.parse_args()

    repo_root = DEFAULT_REPO_ROOT
    course_dir, session_path = resolve_course_and_session(repo_root, args.course, args.session)
    if args.apply:
        check_locked_session(repo_root, session_path)

    session_data = json.loads(session_path.read_text(encoding="utf-8"))
    work_dir = Path(args.work_dir) if args.work_dir else (repo_root / "tmp" / f"onepass_{course_dir.name}_{session_path.stem}")
    work_dir.mkdir(parents=True, exist_ok=True)

    rendered_prompt = render_prompt(Path(args.prompt), course_dir, session_data)
    (work_dir / "rendered_prompt.md").write_text(rendered_prompt, encoding="utf-8")

    raw_segs, chunks = export_chunks(session_data, num_chunks=args.chunks)
    (work_dir / "raw_all.json").write_text(json.dumps(raw_segs, ensure_ascii=False, indent=1), encoding="utf-8")
    for idx, ch in enumerate(chunks, 1):
        (work_dir / f"chunk_{idx}.txt").write_text(ch, encoding="utf-8")

    if args.dry_run:
        print(json.dumps({
            "mode": "dry-run",
            "courseDir": str(course_dir),
            "sessionPath": str(session_path),
            "workDir": str(work_dir),
            "chunks": len(chunks),
            "rawSegments": len(raw_segs),
        }, ensure_ascii=False, indent=2))
        return 0

    chunk_metas = []
    if args.assemble_only:
        src_dir = Path(args.assemble_only)
        chunk_outputs = [(src_dir / f"corrected_{k}.txt").read_text(encoding="utf-8") for k in range(1, len(chunks) + 1)]
    else:
        t0 = time.time()
        max_workers = 2 if args.provider == "minimax" else min(4, len(chunks))
        outputs_map = {}

        def _run_one(k_idx: int, ch_text: str):
            if args.provider == "minimax":
                return call_minimax_chunk(k_idx, rendered_prompt, ch_text, args.router_url, work_dir)
            if args.provider == "codex":
                return call_codex_chunk(k_idx, rendered_prompt, ch_text, work_dir)
            return call_gemini_chunk(k_idx, rendered_prompt, ch_text, work_dir)

        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
            fut_map = {ex.submit(_run_one, idx, ch): idx for idx, ch in enumerate(chunks, 1)}
            for fut in concurrent.futures.as_completed(fut_map):
                k_idx = fut_map[fut]
                content, meta = fut.result()
                outputs_map[k_idx] = content
                chunk_metas.append(meta)
        chunk_metas.sort(key=lambda m: m["chunk"])
        chunk_outputs = [outputs_map[k] for k in range(1, len(chunks) + 1)]
        (work_dir / "run_meta.json").write_text(
            json.dumps({"wall_s": round(time.time() - t0, 2), "chunks": chunk_metas}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    assembled, stats = assemble_corrected_chunks(session_data, raw_segs, chunk_outputs)
    out_path = session_path if args.apply else (Path(args.out) if args.out else (work_dir / f"{session_path.stem}_onepass.json"))
    out_path.write_text(json.dumps(assembled, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    preflight_script = repo_root / "scripts" / "study_group_preflight.mjs"
    if not args.skip_preflight and preflight_script.exists() and "釋量論" in course_dir.name:
        subprocess.run(["node", str(preflight_script), str(out_path), "--apply"], cwd=str(repo_root), check=False)

    strict_proc = subprocess.run(
        ["node", str(repo_root / "scripts" / "check_session.mjs"), "--file", str(out_path), "--strict"],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
    )
    try:
        strict_report = json.loads(strict_proc.stdout)
    except json.JSONDecodeError:
        strict_report = {"raw_stdout": strict_proc.stdout, "raw_stderr": strict_proc.stderr}

    result = {
        "outPath": str(out_path),
        "assembly": stats,
        "strictPass": strict_proc.returncode == 0,
        "strictReport": strict_report,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))

    if not args.allow_warnings and (stats["coverage_pct"] < 98.0 or strict_proc.returncode != 0):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

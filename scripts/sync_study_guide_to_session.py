#!/usr/bin/env python3
"""
sync_study_guide_to_session.py

將 publications/lecture_{SID}_study_guide.md 中的精校版義理講記，
自動化雙向同步並更新至：
1. courses/入中論善顯密意疏/sessions/session_{SID}.json (Web 主閱讀器正文)
2. courses/入中論善顯密意疏/source_outlines/{SID}.json (Web 頂部導讀大綱)
3. 自動維護 _meta 統計 (total_paragraphs, total_sentences, last_updated)
4. 以新正文驗證 contentOverview；失效時須提供獨立審核的 --overview-file。
5. 驗證失敗時不寫入導讀大綱或講次資料。
"""

import json
import re
import hashlib
import argparse
import subprocess
from pathlib import Path
from datetime import datetime

REPO_ROOT = Path(__file__).resolve().parent.parent
COURSE_DIR = REPO_ROOT / "courses" / "入中論善顯密意疏"
SESSIONS_DIR = COURSE_DIR / "sessions"
OUTLINES_DIR = COURSE_DIR / "source_outlines"
PUBLICATIONS_DIR = COURSE_DIR / "publications"
VERBATIM_DIR = COURSE_DIR / "verbatim"

def compute_source_digest(transcript: dict) -> str:
    """計算與 scripts/content_overview_pipeline.mjs 等價的 sourceDigest"""
    sentences = []
    for pi, p in enumerate(transcript.get("paragraphs", [])):
        heading = str(p.get("heading") or "").strip()
        for si, s in enumerate(p.get("sentences", [])):
            text = re.sub(r"\s+", " ", str(s.get("text", "")).strip())
            if not text:
                continue
            sid = str(s.get("id") or f"p{pi+1}-s{si+1}")
            sentences.append({"id": sid, "text": text, "heading": heading})
    
    # JSON formatting identical to Node.js JSON.stringify
    source_json = json.dumps(sentences, ensure_ascii=False, separators=(',', ':'))
    h = hashlib.sha256(source_json.encode("utf-8")).hexdigest()
    return f"sha256:{h}"

def parse_study_guide(md_path: Path):
    text = md_path.read_text(encoding="utf-8")
    
    # Split outline and body
    body_marker = "## 【正文講記】" if "## 【正文講記】" in text else "## 【經論講記本文】"
    parts = text.split(body_marker)
    if len(parts) < 2:
        raise ValueError(f"Could not find body marker '{body_marker}' in {md_path}")
    
    outline_part, body_part = parts[0], parts[1]
    
    # Parse outline items and discussion questions
    course_outline = []
    discussion_outline = []
    in_discussion = False

    for line in outline_part.splitlines():
        line = line.strip()
        if "研討問題" in line or "思考問題" in line:
            in_discussion = True
            continue
        if line.startswith("### ") and in_discussion:
            in_discussion = False

        if in_discussion:
            if re.match(r"^\d+\.\s", line):
                q = re.sub(r"^\d+\.\s*", "", line).strip().replace("**", "")
                discussion_outline.append(q)
            elif line.startswith(("* ", "- ")):
                q = line[2:].strip().replace("**", "")
                discussion_outline.append(q)
        else:
            if line.startswith("### "):
                title = line.replace("### ", "").strip().replace("**", "")
                course_outline.append(title)
            elif re.match(r"^\d+\.\s", line):
                item = re.sub(r"^\d+\.\s*", "", line).strip().replace("**", "")
                course_outline.append(item)

    outline_data = {
        "sourceId": md_path.stem.replace("lecture_", "").replace("_study_guide", ""),
        "title": "宗喀巴大師《入中論善顯密意疏》講記導讀大綱與研討問題",
        "sessionIds": [md_path.stem.replace("lecture_", "").replace("_study_guide", "")],
        "courseOutline": course_outline if course_outline else ["一、觀待世間釋俗諦差別"],
        "discussionOutline": discussion_outline if discussion_outline else ["世俗諦中心與境的正倒差別，是觀待誰而安立的？"],
        "mappings": [],
        "provenance": {
            "type": "curated-study-guide-outline",
            "retrievedAt": datetime.now().strftime("%Y-%m-%d"),
            "note": "依宗喀巴大師《善顯密意疏》底本及見悲青增格西講記大綱提煉。"
        }
    }

    # Parse body paragraphs
    blocks = body_part.split("\n\n")
    raw_paras = []
    cur_heading = None

    for b in blocks:
        b = b.strip()
        if not b:
            continue
        if b.startswith("### "):
            cur_heading = b.replace("### ", "").strip()
        elif b.startswith("> ") or b.startswith("---"):
            continue
        elif b.startswith("[▶"):
            m = re.match(r"^\[▶\s*(\d{2}):(\d{2})\]\((.+?)#t=(\d+)\)\s*([\s\S]+)$", b)
            if m:
                sec = int(m.group(4))
                p_text = m.group(5).strip().replace("**", "").replace("*", "")
                raw_paras.append({
                    "heading": cur_heading,
                    "start": sec,
                    "text": p_text
                })

    return outline_data, raw_paras

def validate_overview(session: dict, overview: dict, sid: str):
    """Validate against the newly constructed source without repairing review evidence."""
    validator = REPO_ROOT / 'scripts/content_overview_pipeline.mjs'
    code = r'''
import fs from 'node:fs';
const {validateContentOverview, finalizeOverviewReview} = await import(process.argv[1]);
const {session, overview, sid} = JSON.parse(fs.readFileSync(0, 'utf8'));
const errors = validateContentOverview(overview, session, {
  sourceTranscriptId: `ru-zhong-lun/session_${sid}`
}).errors;
const groups = ['mainPoints', 'discussionTopics', 'referenceViews'];
const ids = session.paragraphs.flatMap(p => p.sentences.map(s => s.id));
if (new Set(ids).size !== ids.length) errors.push({code: 'DUPLICATE_SENTENCE_ID'});
const items = overview?.review?.items;
if (!Array.isArray(items) || !overview?.review?.reviewedBy
    || overview.status !== 'ai-reviewed'
    || finalizeOverviewReview(overview, overview.review).status !== 'ai-reviewed') {
  errors.push({code: 'INCOMPLETE_SUPPORTED_REVIEW'});
}
if (Array.isArray(items)) {
  const keys = items.map(i => `${i.group}:${i.index}`);
  if (new Set(keys).size !== keys.length) errors.push({code: 'DUPLICATE_REVIEW_ITEM'});
  for (const item of items) {
    if (!groups.includes(item.group) || !Number.isInteger(item.index)
        || item.index < 0 || !overview[item.group]?.[item.index]
        || item.verdict !== 'supported') errors.push({code: 'INVALID_REVIEW_ITEM'});
  }
}
for (const group of groups) {
  for (const item of overview?.[group] || []) {
    const ids = (item.evidence || []).map(e => e.sentenceId);
    if (new Set(ids).size !== ids.length) errors.push({code: 'DUPLICATE_EVIDENCE_ID'});
  }
}
if (errors.length) { console.error(JSON.stringify(errors)); process.exit(1); }
'''
    try:
        result = subprocess.run(
            ['node', '--input-type=module', '-e', code, validator.as_uri()],
            input=json.dumps({'session': session, 'overview': overview, 'sid': sid}, ensure_ascii=False),
            text=True, capture_output=True, timeout=30, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ValueError('Overview validation unavailable; no files written') from exc
    if result.returncode:
        raise ValueError('Overview invalid for NEW source; supply a separately reviewed '
                         '--overview-file. No files written. ' + result.stderr.strip())


def build_candidate(sid: str):
    """Construct both outputs in memory, shared by preparation and application."""
    sid = str(sid).strip()
    md_file = PUBLICATIONS_DIR / f"lecture_{sid}_study_guide.md"
    if not md_file.exists():
        raise FileNotFoundError(f"Study guide not found: {md_file}")

    session_file = SESSIONS_DIR / f"session_{sid}.json"
    if not session_file.exists():
        raise FileNotFoundError(f"Session JSON not found: {session_file}")

    outline_data, raw_paras = parse_study_guide(md_file)
    if not raw_paras:
        raise ValueError('Study guide has no body paragraphs; no files written')
    print(f"📖 解析 Markdown 完成：{len(outline_data['courseOutline'])} 個大綱項目，{len(raw_paras)} 個正文段落。")

    session = json.loads(session_file.read_text(encoding="utf-8"))
    orig_end = session.get("paragraphs", [{}])[-1].get("end", 3915.0)
    existing_verbatim = {
        p.get("id"): p.get("verbatimSentences")
        for p in session.get("paragraphs", [])
        if p.get("id") and p.get("verbatimSentences")
    }
    verbatim_file = VERBATIM_DIR / f"verbatim_{sid}.json"
    file_verbatim = {}
    if verbatim_file.exists():
        vdata = json.loads(verbatim_file.read_text(encoding="utf-8"))
        file_verbatim = vdata.get("paragraphs", {})
        print(f"💬 載入精校口語逐字稿對照：{verbatim_file.name} ({len(file_verbatim)} 段落)")

    new_paragraphs = []
    last_heading = None
    for i, rp in enumerate(raw_paras):
        p_id = f"p_{i + 1}"
        start_t = float(rp["start"])
        end_t = float(raw_paras[i + 1]["start"]) if i + 1 < len(raw_paras) else float(orig_end)
        if end_t <= start_t:
            end_t = start_t + 10.0

        # Split sentences by Chinese punctuation while keeping closing quotes attached
        raw_sentences = re.findall(r'[^。！？；\n]+[。！？；]+[」』”]?|[^。！？；\n]+$', rp["text"])
        raw_sentences = [s.strip() for s in raw_sentences if s.strip()]
        if not raw_sentences:
            raw_sentences = [rp["text"]]

        total_chars = sum(len(s) for s in raw_sentences) or 1
        duration = (end_t - start_t)
        cur_t = start_t
        sent_objs = []

        for si, stext in enumerate(raw_sentences):
            sent_id = f"p{i + 1}-s{si + 1}"
            s_dur = duration * (len(stext) / total_chars)
            s_end = round(cur_t + s_dur, 2)
            sent_objs.append({
                "id": sent_id,
                "start": round(cur_t, 2),
                "end": s_end,
                "text": stext
            })
            cur_t = s_end

        if rp["heading"] and rp["heading"] != last_heading:
            h_val = f"【科判】{rp['heading']}"
            last_heading = rp["heading"]
        else:
            h_val = None

        para_obj = {
            "id": p_id,
            "heading": h_val,
            "start": start_t,
            "end": end_t,
            "sentences": sent_objs
        }
        v_sents = file_verbatim.get(p_id) or existing_verbatim.get(p_id)
        if v_sents:
            para_obj["verbatimSentences"] = v_sents

        new_paragraphs.append(para_obj)

    # Refuse to drop existing audio-aligned verbatim data during paragraph rebuilding.
    retained_verbatim = {p['id']: p.get('verbatimSentences') for p in new_paragraphs}
    if any(retained_verbatim.get(pid) != sentences for pid, sentences in existing_verbatim.items()):
        raise ValueError('Sync would change or drop existing verbatim sentences; no files written')

    total_sentences = sum(len(p["sentences"]) for p in new_paragraphs)
    now_ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    now_date = datetime.now().strftime("%Y-%m-%d")

    # Update session top-level
    session["paragraphs"] = new_paragraphs
    session["lastUpdated"] = now_ts
    session["sourceOutlineId"] = sid

    # Update _meta
    if "_meta" not in session:
        session["_meta"] = {}
    session["_meta"]["total_paragraphs"] = len(new_paragraphs)
    session["_meta"]["total_sentences"] = total_sentences
    session["_meta"]["last_updated"] = now_date
    session["_meta"]["processed_at"] = now_ts
    if "llm_proofread" not in session["_meta"]:
        session["_meta"]["llm_proofread"] = "Smart Router (GX10 Qwen3.8-27B Grounded + Antigravity Tiered Review)"

    return session, outline_data


def sync_session(sid: str, overview_file=None, candidate_dir=None):
    sid = str(sid).strip()
    if not re.fullmatch(r'[0-9]+[AB]?', sid):
        raise ValueError('Invalid session ID')
    if candidate_dir is not None and overview_file is not None:
        raise ValueError('--candidate-dir and --overview-file are mutually exclusive')
    destination = None
    if candidate_dir is not None:
        destination = Path(candidate_dir).resolve()
        # Resolve aliases before checking; scratch must never overlap course inputs/outputs.
        protected = [REPO_ROOT / 'courses', COURSE_DIR, SESSIONS_DIR,
                     OUTLINES_DIR, PUBLICATIONS_DIR, VERBATIM_DIR]
        if any(destination.is_relative_to(p.resolve()) or p.resolve().is_relative_to(destination)
               for p in protected):
            raise ValueError('Candidate directory must be outside production course directories')
        if destination.exists() and (not destination.is_dir() or any(destination.iterdir())):
            raise ValueError('Candidate directory must be new or empty')

    session, outline_data = build_candidate(sid)
    if destination is not None:
        co = session.get('contentOverview')
        co = dict(co) if isinstance(co, dict) else {'schemaVersion': 1}
        co.pop('review', None)
        co['status'] = 'needs-review'
        co['sourceTranscriptId'] = f'ru-zhong-lun/session_{sid}'
        co['sourceDigest'] = compute_source_digest(session)
        session['contentOverview'] = co
        destination.mkdir(parents=True, exist_ok=True)
        (destination / f'session_{sid}.json').write_text(
            json.dumps(session, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        (destination / f'{sid}.json').write_text(
            json.dumps(outline_data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'Candidate prepared in {destination}; overview needs independent review before application.')
        return

    co = (json.loads(Path(overview_file).read_text(encoding='utf-8'))
          if overview_file is not None else session.get('contentOverview'))
    validate_overview(session, co, sid)
    session['contentOverview'] = co

    # Save outline JSON
    OUTLINES_DIR.mkdir(parents=True, exist_ok=True)
    outline_path = OUTLINES_DIR / f"{sid}.json"
    outline_path.write_text(json.dumps(outline_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"✅ 已同步導讀大綱：{outline_path}")

    # Save session JSON
    session_file = SESSIONS_DIR / f'session_{sid}.json'
    session_file.write_text(json.dumps(session, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"✅ 已同步講次資料：{session_file}")

def main():
    parser = argparse.ArgumentParser(description='Sync only with overview review valid for the new source.')
    parser.add_argument('session_id')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--overview-file', type=Path,
                        help='Separately reviewed contentOverview JSON bound to the new source')
    mode.add_argument('--candidate-dir', type=Path,
                      help='Prepare session_<ID>.json and <ID>.json in a new/empty scratch directory; no production writes')
    args = parser.parse_args()
    sync_session(args.session_id, overview_file=args.overview_file, candidate_dir=args.candidate_dir)
    if args.candidate_dir is None:
        print("🎉 同步作業完成！請接續執行 npm run summaries:audit 與 node --test tests/acceptance/goldenStandard.test.js 進行驗證。")

if __name__ == "__main__":
    main()

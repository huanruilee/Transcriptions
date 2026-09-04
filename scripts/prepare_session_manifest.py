#!/usr/bin/env python3
"""
scripts/prepare_session_manifest.py

Authoritative Session Manifest & Turnkey Dispatch Assistant for GX10 Xiaofa.
Maintains canonical metadata for all missing lecture sessions from:
https://buddha.flyday.com.tw/ViewVoiceList.aspx?flag=68

Features:
- --list: Show remaining missing sessions with URLs, dates, and treatise page ranges.
- --register <SID> | --register-all: Inject official Flyday URL into audio_map.json.
- --prompt <SID>: Generate the exact, token-efficient turnkey dispatch prompt for Xiaofa.
- --batch <1..4>: Generate batch dispatch prompt for a group of sessions.
"""

import sys
import json
import argparse
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
COURSE_DIR = REPO_ROOT / "courses" / "入中論善顯密意疏"
AUDIO_MAP_PATH = COURSE_DIR / "audio_map.json"
COURSE_JSON_PATH = COURSE_DIR / "course.json"
SESSIONS_DIR = COURSE_DIR / "sessions"

# Authoritative catalog of the 18 missing sessions from Flyday
MISSING_SESSIONS_CATALOG = {
    "03B": {
        "date": "20160618",
        "pageRange": "p.66",
        "filename": "20160618-B 入中論善顯密意疏-第六現前地p66(3).MP3",
        "url": "https://buddha.flyday.com.tw/68%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f%202016/20160618-B%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f-%e7%ac%ac%e5%85%ad%e7%8f%be%e5%89%8d%e5%9c%b0p66(3).MP3"
    },
    "04B": {
        "date": "20160625",
        "pageRange": "p.68",
        "filename": "20160625-B 入中論善顯密意疏-第六現前地p68(4).MP3",
        "url": "https://buddha.flyday.com.tw/68%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f%202016/20160625-B%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f-%e7%ac%ac%e5%85%ad%e7%8f%be%e5%89%8d%e5%9c%b0p68(4).MP3"
    },
    "06B": {
        "date": "20160730",
        "pageRange": "p.71",
        "filename": "20160730-B 入中論善顯密意疏-第六現前地p71(6).MP3",
        "url": "https://buddha.flyday.com.tw/68%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f%202016/20160730-B%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f-%e7%ac%ac%e5%85%ad%e7%8f%be%e5%89%8d%e5%9c%b0p71(6).MP3"
    },
    "07B": {
        "date": "20160806",
        "pageRange": "p.72",
        "filename": "20160806-B 入中論善顯密意疏-第六現前地p72(7).MP3",
        "url": "https://buddha.flyday.com.tw/68%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f%202016/20160806-B%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f-%e7%ac%ac%e5%85%ad%e7%8f%be%e5%89%8d%e5%9c%b0p72(7).MP3"
    },
    "22B": {
        "date": "20161126",
        "pageRange": "p.86",
        "filename": "20161126-B 入中論善顯密意疏-第六現前地p86(22).MP3",
        "url": "https://buddha.flyday.com.tw/68%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f%202016/20161126-B%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f-%e7%ac%ac%e5%85%ad%e7%8f%be%e5%89%8d%e5%9c%b0p86(22).MP3"
    },
    "24A": {
        "date": "20161210",
        "pageRange": "p.90",
        "filename": "20161210-A 入中論善顯密意疏-第六現前地p90(24).MP3",
        "url": "https://buddha.flyday.com.tw/68%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f%202016/20161210-A%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f-%e7%ac%ac%e5%85%ad%e7%8f%be%e5%89%8d%e5%9c%b0p90(24).MP3"
    },
    "26B": {
        "date": "20161224",
        "pageRange": "p.95",
        "filename": "20161224-B入中論善顯密意疏-第六現前地p95(26).MP3",
        "url": "https://buddha.flyday.com.tw/68%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f%202016/20161224-B%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f-%e7%ac%ac%e5%85%ad%e7%8f%be%e5%89%8d%e5%9c%b0p95(26).MP3"
    },
    "31B": {
        "date": "20170218",
        "pageRange": "p.101",
        "filename": "20170218-B 入中論善顯密意疏-第六現前地p101(31).MP3",
        "url": "https://buddha.flyday.com.tw/68%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f%202016/20170218-B%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f-%e7%ac%ac%e5%85%ad%e7%8f%be%e5%89%8d%e5%9c%b0p101(31).MP3"
    },
    "32B": {
        "date": "20170304",
        "pageRange": "p.103",
        "filename": "20170304-B 入中論善顯密意疏-第六現前地p103(32).MP3",
        "url": "https://buddha.flyday.com.tw/68%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f%202016/20170304-B%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f-%e7%ac%ac%e5%85%ad%e7%8f%be%e5%89%8d%e5%9c%b0p103(32).MP3"
    },
    "39B": {
        "date": "20170429",
        "pageRange": "p.121",
        "filename": "20170429-B 入中論善顯密意疏-第六現前地p121(39).MP3",
        "url": "https://buddha.flyday.com.tw/68%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f%202016/20170429-B%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f-%e7%ac%ac%e5%85%ad%e7%8f%be%e5%89%8d%e5%9c%b0p121(39).MP3"
    },
    "41B": {
        "date": "20170513",
        "pageRange": "p.127",
        "filename": "20170513-B 入中論善顯密意疏-第六現前地p127(41).MP3",
        "url": "https://buddha.flyday.com.tw/68%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f%202016/20170513-B%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f-%e7%ac%ac%e5%85%ad%e7%8f%be%e5%89%8d%e5%9c%b0p127(41).MP3"
    },
    "48B": {
        "date": "20170701",
        "pageRange": "p.150",
        "filename": "20170701-B 入中論善顯密意疏-第六現前地p150(48).MP3",
        "url": "https://buddha.flyday.com.tw/68%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f%202016/20170701-B%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f-%e7%ac%ac%e5%85%ad%e7%8f%be%e5%89%8d%e5%9c%b0p150(48).MP3"
    },
    "49B": {
        "date": "20170708",
        "pageRange": "p.150",
        "filename": "20170708-B 入中論善顯密意疏-第六現前地p150(49).MP3",
        "url": "https://buddha.flyday.com.tw/68%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f%202016/20170708-B%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f-%e7%ac%ac%e5%85%ad%e7%8f%be%e5%89%8d%e5%9c%b0p150(49).MP3"
    },
    "60B": {
        "date": "20171021",
        "pageRange": "p.186",
        "filename": "20171021-B 入中論善顯密意疏-第六現前地p186(60).MP3",
        "url": "https://buddha.flyday.com.tw/68%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f%202016/20171021-B%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f-%e7%ac%ac%e5%85%ad%e7%8f%be%e5%89%8d%e5%9c%b0p186(60).MP3"
    },
    "65B": {
        "date": "20171125",
        "pageRange": "p.198",
        "filename": "20171125-B 入中論善顯密意疏-第六現前地p198(65).MP3",
        "url": "https://buddha.flyday.com.tw/68%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f%202016/20171125-B%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f-%e7%ac%ac%e5%85%ad%e7%8f%be%e5%89%8d%e5%9c%b0p198(65).MP3"
    },
    "66B": {
        "date": "20171202",
        "pageRange": "p.201",
        "filename": "20171202-B 入中論善顯密意疏-第六現前地p201(66).MP3",
        "url": "https://buddha.flyday.com.tw/68%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f%202016/20171202-B%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f-%e7%ac%ac%e5%85%ad%e7%8f%be%e5%89%8d%e5%9c%b0p201(66).MP3"
    },
    "67B": {
        "date": "20171209",
        "pageRange": "p.203",
        "filename": "20171209-B 入中論善顯密意疏-第六現前地p203(67).MP3",
        "url": "https://buddha.flyday.com.tw/68%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f%202016/20171209-B%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f-%e7%ac%ac%e5%85%ad%e7%8f%be%e5%89%8d%e5%9c%b0p203(67).MP3"
    },
    "68B": {
        "date": "20171216",
        "pageRange": "p.204",
        "filename": "20171216-B 入中論善顯密意疏-第六現前地p204(68).MP3",
        "url": "https://buddha.flyday.com.tw/68%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f%202016/20171216-B%20%e5%85%a5%e4%b8%ad%e8%ab%96%e5%96%84%e9%a1%af%e5%af%86%e6%84%8f%e7%96%8f-%e7%ac%ac%e5%85%ad%e7%8f%be%e5%89%8d%e5%9c%b0p204(68).MP3"
    }
}

BATCHES = {
    1: ["03B", "04B", "06B", "07B"],
    2: ["22B", "24A", "26B", "31B", "32B"],
    3: ["39B", "41B", "48B", "49B"],
    4: ["60B", "65B", "66B", "67B", "68B"]
}

def get_completed_sessions():
    if not SESSIONS_DIR.exists():
        return set()
    return {
        f.stem.replace("session_", "")
        for f in SESSIONS_DIR.glob("session_*.json")
        if not f.name.endswith("_anchored.json")
    }

def list_sessions():
    completed = get_completed_sessions()
    print("\n==============================================================")
    print("📊 [Missing Sessions Inventory Status]")
    print("==============================================================")
    for b_idx, sids in BATCHES.items():
        print(f"\n📦 Batch {b_idx}:")
        for sid in sids:
            meta = MISSING_SESSIONS_CATALOG[sid]
            status = "✅ COMPLETED" if sid in completed else "⏳ MISSING"
            print(f"  • [{status}] Session {sid} ({meta['date']}) | Page: {meta['pageRange']:<6} | URL: {meta['url'][:55]}...")
    
    remaining = [sid for sid in MISSING_SESSIONS_CATALOG if sid not in completed]
    print(f"\nTotal Pending Backlog: {len(remaining)} / {len(MISSING_SESSIONS_CATALOG)} sessions.")
    print("==============================================================\n")

def register_session(sid):
    if sid not in MISSING_SESSIONS_CATALOG:
        print(f"Error: Unknown session ID '{sid}'. Must be one of {list(MISSING_SESSIONS_CATALOG.keys())}")
        sys.exit(1)
    
    with open(AUDIO_MAP_PATH, "r", encoding="utf-8") as f:
        audio_map = json.load(f)
    
    meta = MISSING_SESSIONS_CATALOG[sid]
    audio_map[sid] = meta["url"]
    
    with open(AUDIO_MAP_PATH, "w", encoding="utf-8") as f:
        json.dump(audio_map, f, ensure_ascii=False, indent=2)
    print(f"✅ Registered session {sid} into audio_map.json")

def generate_prompt_for_session(sid):
    if sid not in MISSING_SESSIONS_CATALOG:
        print(f"Error: Unknown session ID '{sid}'")
        sys.exit(1)
    
    meta = MISSING_SESSIONS_CATALOG[sid]
    prompt = f"""You are the implementation worker (小法). Work only on transcribing and indexing session {sid}.

Workspace: /home/henry/.gx10/xiaofa/workspace/Transcriptions
Evidence directory: reviews/evidence/{sid}_transcription
Allowed paths:
- courses/入中論善顯密意疏/sessions/session_{sid}.json
- courses/入中論善顯密意疏/course.json
- courses/入中論善顯密意疏/audio_map.json
- courses/入中論善顯密意疏/toc.json

Metadata:
- Session ID: {sid}
- Date: {meta['date']}
- Treatise Page: {meta['pageRange']}
- Audio URL: {meta['url']}

Forbidden: No placeholder/fake JSON, no invented words, no modifying other sessions, no editing tests.

Step 0 (Preflight):
1. `cd /home/henry/.gx10/xiaofa/workspace/Transcriptions` and verify `pwd`.
2. Check Whisper GPU: `curl -s http://127.0.0.1:8010/health`
3. Check Qwen vLLM: `curl -s http://192.168.122.1:8001/v1/models`
   If either fails, stop immediately with BLOCKED.

Step 1 (RED Test):
Run `npm run test:completeness:strict` and record that session {sid} is reported missing.

Step 2 (Execution):
Execute the standard 5-step Grounded conversion pipeline:
`python3 scripts/batch_convert_all.py --sessions {sid}`

Step 3 (GREEN Test):
1. Verify `session_{sid}.json` has valid paragraphs and monotonic timestamps.
2. Run `npm run test:completeness` to verify the missing count decreases by 1.
3. Run `npm run test:unit` to verify zero regressions across all 164 unit tests.

Step 4 (Evidence Output Compression):
Write the full transcript and logs to disk at `reviews/evidence/{sid}_transcription/`.
Do NOT dump the full transcript to stdout. Only emit a concise summary card:
- Sentence count, paragraph count, audio duration, SHA-256, test pass status.
"""
    return prompt

def generate_batch_prompt(batch_idx):
    if batch_idx not in BATCHES:
        print(f"Error: Batch index must be between 1 and 4 (got {batch_idx})")
        sys.exit(1)
    sids = BATCHES[batch_idx]
    sids_str = ",".join(sids)
    
    prompt = f"""You are the implementation worker (小法). Work only on batch {batch_idx} sessions: [{sids_str}].

Workspace: /home/henry/.gx10/xiaofa/workspace/Transcriptions
Evidence directory: reviews/evidence/batch_{batch_idx}_transcription
Allowed paths:
- courses/入中論善顯密意疏/sessions/session_*.json (only for {sids_str})
- courses/入中論善顯密意疏/course.json
- courses/入中論善顯密意疏/audio_map.json
- courses/入中論善顯密意疏/toc.json

Forbidden: No placeholder/fake JSON, no invented words, no modifying existing sessions, no editing tests.

Step 0 (Preflight):
1. `cd /home/henry/.gx10/xiaofa/workspace/Transcriptions` and verify `pwd`.
2. Check Whisper GPU: `curl -s http://127.0.0.1:8010/health`
3. Check Qwen vLLM: `curl -s http://192.168.122.1:8001/v1/models`
   If either service fails, halt immediately with BLOCKED.

Step 1 (RED Test):
Run `npm run test:completeness:strict` and confirm that all sessions in [{sids_str}] are reported missing.

Step 2 (Execution):
Execute the standard Grounded batch conversion pipeline:
`python3 scripts/batch_convert_all.py --sessions {sids_str}`

Step 3 (GREEN Test):
1. Verify each session JSON has non-empty text and monotonic timestamps.
2. Run `npm run test:completeness` to confirm missing count dropped by {len(sids)}.
3. Run `npm run test:unit` to verify 100% PASS across all 164 tests.

Step 4 (Evidence Output Compression):
Save logs and metrics to `reviews/evidence/batch_{batch_idx}_transcription/summary.md`.
Do NOT dump raw transcripts to stdout. Emit only the completion cards for the {len(sids)} sessions.
"""
    return prompt

def main():
    parser = argparse.ArgumentParser(description="Session Manifest & Turnkey Dispatch Assistant")
    parser.add_argument("--list", action="store_true", help="List all missing sessions and status")
    parser.add_argument("--register", type=str, help="Register a specific session ID into audio_map.json")
    parser.add_argument("--register-all", action="store_true", help="Register all 18 missing sessions into audio_map.json")
    parser.add_argument("--prompt", type=str, help="Generate turnkey dispatch prompt for a session ID")
    parser.add_argument("--batch", type=int, choices=[1, 2, 3, 4], help="Generate turnkey dispatch prompt for batch 1..4")
    
    args = parser.parse_args()
    
    if args.list:
        list_sessions()
    elif args.register:
        register_session(args.register)
    elif args.register_all:
        for sid in MISSING_SESSIONS_CATALOG:
            register_session(sid)
        print("🎉 All 18 missing sessions successfully registered into audio_map.json!")
    elif args.prompt:
        print(generate_prompt_for_session(args.prompt))
    elif args.batch:
        print(generate_batch_prompt(args.batch))
    else:
        parser.print_help()

if __name__ == "__main__":
    main()

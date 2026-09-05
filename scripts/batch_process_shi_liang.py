#!/usr/bin/env python3
"""
Batch Pipeline for 《釋量論第二品：成量品》
Author: Antigravity Assistant & Xiaofa Orchestrator
Description:
  1. Downloads official lecture transcript PDF from Google Drive, extracts text via pdftotext on gx10.
  2. Downloads official audio MP3 directly to gx10 workspace and runs Whisper GPU large-v3-turbo (Port 8010).
  3. Tags section headings using gx10 Smart Router (Port 4001, model 'primary').
  4. Grounds and aligns 100% official text against acoustic Whisper timestamps using SequenceMatcher.
  5. Produces publication-grade session JSON, updates course.json and toc.json.
"""

import sys
import os
import json
import re
import difflib
import time
import subprocess
import argparse
from typing import List, Dict, Any, Tuple

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MAPPED_RESOURCES_PATH = os.path.join(REPO_ROOT, "courses/釋量論第二品/mapped_resources.json")
COURSE_JSON_PATH = os.path.join(REPO_ROOT, "courses/釋量論第二品/course.json")
TOC_JSON_PATH = os.path.join(REPO_ROOT, "courses/釋量論第二品/toc.json")
SESSIONS_DIR = os.path.join(REPO_ROOT, "courses/釋量論第二品/sessions")
SOURCE_TEXT_DIR = os.path.join(REPO_ROOT, "courses/釋量論第二品/source_text")

SMART_ROUTER_URL = "http://127.0.0.1:4001/v1/chat/completions"
SMART_ROUTER_TOKEN = "gx10-c6a5ae95f47bb838fff310e20cf22e6488a0a7b9ff32290d4d864f5d6f2110f5"
WHISPER_URL = "http://127.0.0.1:8010/v1/audio/transcriptions"

CN_NUMS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十"]


def run_ssh_gx10(cmd: str) -> str:
    res = subprocess.run(["ssh", "gx10", cmd], capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"SSH command failed ({res.returncode}):\nSTDOUT: {res.stdout}\nSTDERR: {res.stderr}")
    return res.stdout


def fetch_pdf_and_extract_text(session_info: dict) -> Tuple[str, List[dict], List[tuple]]:
    """
    Downloads official transcript PDF on gx10, extracts raw text via pdftotext,
    parses items as either ('heading', h_dict) or ('para', text).
    """
    s_id = session_info["session_id"]
    pdf_id = session_info["text_pdf_id"]
    
    print(f"[{s_id}] Downloading transcript PDF (Drive ID: {pdf_id})...")
    gx10_script = f"""
import subprocess, os

pdf_url = 'https://drive.google.com/uc?export=download&id={pdf_id}'
pdf_path = '/tmp/session_{s_id}.pdf'
subprocess.run(['curl', '-s', '-L', pdf_url, '-o', pdf_path], check=True)
out = subprocess.check_output(['pdftotext', pdf_path, '-']).decode('utf-8')

with open('/tmp/session_{s_id}_raw.txt', 'w', encoding='utf-8') as f:
    f.write(out)
"""
    run_ssh_gx10(f"python3 -c \"{gx10_script}\"")
            
    # Copy raw text from gx10 to local repo
    os.makedirs(SOURCE_TEXT_DIR, exist_ok=True)
    local_raw_path = os.path.join(SOURCE_TEXT_DIR, f"session_{s_id}_official_raw.txt")
    subprocess.run(["scp", f"gx10:/tmp/session_{s_id}_raw.txt", local_raw_path], check=True)
    
    with open(local_raw_path, "r", encoding="utf-8") as f:
        full_text = f.read()

    # Parse body pages (skip page 0 cover)
    pages = full_text.split("\x0c")
    body_text = "\n".join(pages[1:])
    lines = body_text.split("\n")
    
    items = []
    cur_lines = []
    headings = []

    for line in lines:
        line_s = line.strip()
        if not line_s:
            if cur_lines:
                items.append(("para", "".join(cur_lines)))
                cur_lines = []
            continue
        if line_s.isdigit() and len(line_s) <= 3:
            continue
        m = re.match(r"^([0-9]+[、\.])\s*(.+)", line_s)
        if m:
            if cur_lines:
                items.append(("para", "".join(cur_lines)))
                cur_lines = []
            h_dict = {"num": m.group(1), "title": m.group(2).strip(), "full": line_s}
            headings.append(h_dict)
            items.append(("heading", h_dict))
            continue
        cur_lines.append(line_s)

    if cur_lines:
        items.append(("para", "".join(cur_lines)))
            
    return full_text, headings, items


def tag_headings_with_smart_router(headings: List[dict]) -> Dict[str, str]:
    """
    Invokes Smart Router on gx10 with model 'primary' to enrich headings
    with Buddhist topical taxonomy prefixes.
    """
    if not headings:
        return {}
        
    heading_titles = [f"{h['num']}{h['title']}" for h in headings]
    prompt = f"""你是一位精通藏傳佛教格魯派因明學（《釋量論》）的佛學編輯專家。
請將下列章節標題，加上標準的佛學目錄分類標籤前綴（例如：【科判導讀】、【根本頌釋】、【法義深探】、【名相辨析】、【正理修持】、【破邪顯正】、【教誡結語】等）：

{chr(10).join(heading_titles)}

請以 JSON 陣列格式輸出物件，每個物件包含 'raw' 和 'tagged' 兩個欄位。只回傳 JSON 即可。"""

    gx10_script = f"""
import requests, json

headers = {{
    'Authorization': 'Bearer {SMART_ROUTER_TOKEN}',
    'Content-Type': 'application/json'
}}
prompt = '''{prompt}'''
data = {{
    'model': 'primary',
    'messages': [{{'role': 'user', 'content': prompt}}],
    'temperature': 0.1
}}
res = requests.post('{SMART_ROUTER_URL}', headers=headers, json=data, timeout=60)
resp_json = res.json()
content = resp_json['choices'][0]['message']['content']
print('__SMART_ROUTER_OUTPUT__:' + content)
"""
    stdout = run_ssh_gx10(f"python3 -c \"{gx10_script}\"")
    output_str = ""
    capture = False
    for line in stdout.split("\n"):
        if "__SMART_ROUTER_OUTPUT__:" in line:
            output_str += line.split("__SMART_ROUTER_OUTPUT__:")[1] + "\n"
            capture = True
        elif capture:
            output_str += line + "\n"
            
    cleaned = re.sub(r"^```(json)?", "", output_str.strip(), flags=re.MULTILINE).rstrip("`").strip()
    result_map = {}
    try:
        tagged_items = json.loads(cleaned)
        for item in tagged_items:
            raw = item["raw"].strip()
            tagged = item["tagged"].strip()
            result_map[raw] = tagged
            raw_no_num = re.sub(r"^[0-9]+[、\.]\s*", "", raw)
            result_map[raw_no_num] = tagged
    except Exception as e:
        print(f"Warning: Failed to parse Smart Router JSON ({e}), fallback to default tags.")
        for h in headings:
            result_map[h["title"]] = f"【法義深探】{h['title']}"
            result_map[h["full"]] = f"【法義深探】{h['title']}"
            
    return result_map


def transcribe_session_on_gx10(session_info: dict) -> dict:
    """
    Downloads audio MP3 to gx10 workspace, calls faster-whisper GPU service on port 8010.
    """
    s_id = session_info["session_id"]
    audio_id = session_info["audio_id"]
    whisper_json_path = f"/tmp/session_{s_id}_whisper.json"
    
    check_cmd = f"test -f {whisper_json_path} && echo 'EXISTS' || echo 'NOT_FOUND'"
    if run_ssh_gx10(check_cmd).strip() == "EXISTS":
        print(f"[{s_id}] Cached Whisper transcript found on gx10: {whisper_json_path}")
    else:
        print(f"[{s_id}] Downloading audio MP3 (Drive ID: {audio_id}) to gx10 workspace...")
        download_script = f"""
import subprocess, os
audio_url = 'https://drive.google.com/uc?export=download&id={audio_id}'
mp3_path = '/home/henry/.gx10/xiaofa/workspace/Transcriptions/session_{s_id}.mp3'
subprocess.run(['curl', '-s', '-L', audio_url, '-o', mp3_path], check=True)
print(f'Downloaded mp3 size: {{os.path.getsize(mp3_path)}} bytes')
"""
        run_ssh_gx10(f"python3 -c \"{download_script}\"")
        
        print(f"[{s_id}] Running Whisper large-v3-turbo GPU transcription...")
        t0 = time.time()
        whisper_script = f"""
import requests, json, os
url = '{WHISPER_URL}'
data = {{
    'file': '/workspace/session_{s_id}.mp3',
    'language': 'zh',
    'response_format': 'verbose_json',
    'beam_size': '1',
    'temperature': '0.0'
}}
res = requests.post(url, data=data, timeout=900)
if res.status_code != 200:
    raise RuntimeError(f'Whisper error: {{res.status_code}} {{res.text}}')
with open('{whisper_json_path}', 'w', encoding='utf-8') as f:
    f.write(res.text)

try:
    os.remove('/home/henry/.gx10/xiaofa/workspace/Transcriptions/session_{s_id}.mp3')
except Exception:
    pass
print('Whisper transcription successful.')
"""
        run_ssh_gx10(f"python3 -c \"{whisper_script}\"")
        print(f"[{s_id}] Whisper GPU completed in {time.time() - t0:.1f}s.")

    local_whisper_path = f"/tmp/session_{s_id}_whisper.json"
    subprocess.run(["scp", f"gx10:{whisper_json_path}", local_whisper_path], check=True)
    with open(local_whisper_path, "r", encoding="utf-8") as f:
        whisper_data = json.load(f)
    return whisper_data


def align_and_generate_session_json(
    session_info: dict,
    items: List[tuple],
    headings_map: Dict[str, str],
    whisper_data: dict
) -> Tuple[dict, List[dict]]:
    """
    Performs SequenceMatcher window alignment between official text and acoustic timestamps.
    Produces session JSON and structured TOC items.
    """
    s_id = session_info["session_id"]
    w_segs = whisper_data.get("segments", [])
    
    # Flatten whisper into characters with timestamps
    w_chars = []
    for s in w_segs:
        clean = re.sub(r"[^\w\u4e00-\u9fff]", "", s["text"])
        if not clean:
            continue
        dur = s["end"] - s["start"]
        for idx, c in enumerate(clean):
            st = s["start"] + (idx / len(clean)) * dur
            et = s["start"] + ((idx + 1) / len(clean)) * dur
            w_chars.append({"char": c, "start": st, "end": et})

    w_text = "".join([x["char"] for x in w_chars])
    w_len = len(w_text)
    
    default_heading = list(headings_map.values())[0] if headings_map else "【法義深探】開示要義"
    cur_heading = default_heading
    heading_sections = []
    
    final_paragraphs = []
    para_counter = 1
    sent_counter = 1
    w_idx = 0

    for it in items:
        if it[0] == "heading":
            h_dict = it[1]
            h_title = h_dict["title"]
            h_full = h_dict["full"]
            
            tagged = (
                headings_map.get(h_full)
                or headings_map.get(h_title)
                or headings_map.get(f"{h_dict['num']}{h_title}")
                or f"【法義深探】{h_title}"
            )
            cur_heading = tagged
            
            h_num_idx = len(heading_sections)
            toc_title = f"{CN_NUMS[h_num_idx] if h_num_idx < len(CN_NUMS) else h_dict['num']}、{h_title}"
            
            heading_sections.append({
                "title": toc_title,
                "tagged_heading": tagged,
                "start_time": None,
                "end_time": None
            })
            continue

        p_text = it[1]
        sent_texts = re.split(r"([。！？；]+)", p_text)
        full_sents = []
        for i in range(0, len(sent_texts) - 1, 2):
            s = sent_texts[i] + sent_texts[i+1]
            if s.strip():
                full_sents.append(s.strip())
        if len(sent_texts) % 2 == 1 and sent_texts[-1].strip():
            full_sents.append(sent_texts[-1].strip())

        para_sentences = []
        p_start = None
        p_end = None

        for st in full_sents:
            clean_st = re.sub(r"[^\w\u4e00-\u9fff]", "", st)
            if not clean_st:
                continue
                
            win_start = max(0, w_idx - 60)
            win_end = min(w_len, w_idx + len(clean_st) * 2 + 120)
            sub_w = w_text[win_start:win_end]
            
            sm = difflib.SequenceMatcher(None, clean_st, sub_w)
            match = sm.find_longest_match(0, len(clean_st), 0, len(sub_w))
            
            if match.size >= 3:
                match_start = win_start + match.b
                match_end = min(w_len - 1, match_start + len(clean_st))
                s_start = round(w_chars[match_start]["start"], 2)
                s_end = round(w_chars[match_end]["end"], 2)
                w_idx = match_end
            else:
                s_start = round(w_chars[min(w_idx, w_len - 1)]["start"], 2)
                s_end = round(s_start + len(clean_st) * 0.35, 2)
                w_idx = min(w_len - 1, w_idx + len(clean_st))

            if p_start is None:
                p_start = s_start
            p_end = s_end

            para_sentences.append({
                "id": f"sent-{sent_counter}",
                "start": s_start,
                "end": s_end,
                "text": st,
                "reviewNeeded": False
            })
            sent_counter += 1

        if para_sentences:
            is_new_heading = (para_counter == 1 or (final_paragraphs and final_paragraphs[-1].get("heading") != cur_heading))
            final_paragraphs.append({
                "id": f"p_{para_counter}",
                "heading": cur_heading if is_new_heading else None,
                "sentences": para_sentences,
                "start": p_start,
                "end": p_end
            })
            if heading_sections:
                if heading_sections[-1]["start_time"] is None:
                    heading_sections[-1]["start_time"] = p_start
                heading_sections[-1]["end_time"] = p_end
            para_counter += 1

    session_json = {
        "sessionId": s_id,
        "title": f"第 {int(s_id)} 講 | {session_info['title'].replace('釋量論第二品 ', '')}",
        "audioUrl": f"https://www.youtube.com/watch?v={session_info['video_id']}",
        "mediaType": "video/youtube",
        "youtubeVideoId": session_info["video_id"],
        "lastUpdated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "paragraphs": final_paragraphs
    }
    
    return session_json, heading_sections


def update_catalog_and_toc(session_info: dict, session_json: dict, heading_sections: List[dict]):
    """
    Updates course.json and toc.json with the newly processed session.
    """
    s_id = session_info["session_id"]
    idx = int(s_id)
    
    # 1. Update course.json
    with open(COURSE_JSON_PATH, "r", encoding="utf-8") as f:
        course_data = json.load(f)
        
    for s in course_data["sessions"]:
        if s["sessionId"] == s_id:
            s["status"] = "published"
            s["lastUpdated"] = session_json["lastUpdated"]
            if not s.get("summary") or s["summary"] == f"釋量論第二品第 {s_id} 講":
                first_h = heading_sections[0]["title"] if heading_sections else session_info["title"]
                s["summary"] = f"{session_info['title']}。探討{first_h}。"
            break
            
    with open(COURSE_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(course_data, f, ensure_ascii=False, indent=2)

    # 2. Update toc.json
    with open(TOC_JSON_PATH, "r", encoding="utf-8") as f:
        toc_data = json.load(f)

    p_first = session_json["paragraphs"][0] if session_json["paragraphs"] else None
    p_last = session_json["paragraphs"][-1] if session_json["paragraphs"] else None
    s_start = p_first["start"] if p_first else 0.0
    s_end = p_last["end"] if p_last else 0.0
    
    subsections = []
    for h_idx, h in enumerate(heading_sections, 1):
        subsections.append({
            "id": f"sec-{idx}-{h_idx}",
            "title": h["title"],
            "sessionId": s_id,
            "start_time": h["start_time"] if h["start_time"] is not None else s_start,
            "end_time": h["end_time"] if h["end_time"] is not None else s_end
        })
        
    new_section = {
        "id": f"sec-{idx}",
        "title": f"第{idx}講：{session_info['title'].split(' ')[-1]}",
        "sessionId": s_id,
        "start_time": s_start,
        "end_time": s_end,
        "children": subsections
    }
    
    sections = toc_data.setdefault("sections", [])
    found = False
    for i, sec in enumerate(sections):
        if sec["sessionId"] == s_id:
            sections[i] = new_section
            found = True
            break
    if not found:
        sections.append(new_section)
        
    sections.sort(key=lambda x: int(x["sessionId"]))
    toc_data["sections"] = sections
    
    with open(TOC_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(toc_data, f, ensure_ascii=False, indent=2)


def process_single_session(session_info: dict, force: bool = False):
    s_id = session_info["session_id"]
    output_session_path = os.path.join(SESSIONS_DIR, f"session_{s_id}.json")
    
    if os.path.exists(output_session_path) and not force:
        print(f"[{s_id}] session_{s_id}.json already exists. Skipping (use --force to overwrite).")
        return
        
    print(f"\n=======================================================")
    print(f"Processing Session {s_id}: {session_info['title']}")
    print(f"=======================================================")
    
    full_text, headings, items = fetch_pdf_and_extract_text(session_info)
    print(f"[{s_id}] Extracted {len(headings)} headings, {len(items)} items from official PDF.")
    
    print(f"[{s_id}] Tagging headings with Smart Router (primary model)...")
    headings_map = tag_headings_with_smart_router(headings)
    for k, v in headings_map.items():
        print(f"  - {k} -> {v}")
        
    whisper_data = transcribe_session_on_gx10(session_info)
    
    print(f"[{s_id}] Aligning official text with acoustic stream...")
    session_json, heading_sections = align_and_generate_session_json(
        session_info, items, headings_map, whisper_data
    )
    
    os.makedirs(SESSIONS_DIR, exist_ok=True)
    with open(output_session_path, "w", encoding="utf-8") as f:
        json.dump(session_json, f, ensure_ascii=False, indent=2)
        
    total_paras = len(session_json["paragraphs"])
    total_sents = sum(len(p["sentences"]) for p in session_json["paragraphs"])
    p_first = session_json["paragraphs"][0]
    p_last = session_json["paragraphs"][-1]
    print(f"[{s_id}] Generated {output_session_path}")
    print(f"[{s_id}] Stats: {total_paras} paragraphs, {total_sents} sentences.")
    print(f"[{s_id}] Time range: {p_first['start']:.2f}s -> {p_last['end']:.2f}s")
    
    update_catalog_and_toc(session_info, session_json, heading_sections)
    print(f"[{s_id}] Successfully updated course.json and toc.json with {len(heading_sections)} sub-sections.")


def main():
    parser = argparse.ArgumentParser(description="Batch transcribe and align 釋量論第二品")
    parser.add_argument("--sessions", type=str, help="Comma-separated session numbers (e.g. 2,3,4 or 2-10)")
    parser.add_argument("--force", action="store_true", help="Force overwrite existing sessions")
    args = parser.parse_args()
    
    with open(MAPPED_RESOURCES_PATH, "r", encoding="utf-8") as f:
        all_resources = json.load(f)
        
    target_sessions = []
    if args.sessions:
        for part in args.sessions.split(","):
            if "-" in part:
                start_s, end_s = map(int, part.split("-"))
                target_sessions.extend(range(start_s, end_s + 1))
            else:
                target_sessions.append(int(part))
    else:
        target_sessions = list(range(2, 33))

    print(f"Starting batch pipeline for {len(target_sessions)} sessions: {target_sessions}")
    for idx in target_sessions:
        s_info = next((r for r in all_resources if int(r["session_id"]) == idx), None)
        if not s_info:
            print(f"Warning: Session {idx} not found in mapped resources.")
            continue
        try:
            process_single_session(s_info, force=args.force)
        except Exception as e:
            print(f"ERROR processing session {idx}: {e}")
            import traceback
            traceback.print_exc()

    print("\nBatch pipeline run completed.")


if __name__ == "__main__":
    main()

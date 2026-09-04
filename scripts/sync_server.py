#!/usr/bin/env python3
"""
scripts/sync_server.py - Lightweight Local Active Learning & Disk Sync Bridge

Provides a local REST API server (zero external dependencies) for:
1. Real-time sentence editing sync from web UI directly to repository session JSONs.
2. Active learning evaluation & auto-promotion to learned_corrections.json.
3. 1-Click batch sync from browser localStorage into repository knowledge base.
4. Permissive CORS support for localhost (9090, 8000, 5173) and GitHub Pages.
"""

import http.server
import socketserver
import json
import sys
import os
import re
import argparse
from pathlib import Path
import threading

# Add scripts/ to sys.path so we can import active_learning_manager
CURRENT_DIR = Path(__file__).parent.resolve()
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

import active_learning_manager as alm

COURSE_ROOT = CURRENT_DIR.parent / "courses" / "入中論善顯密意疏"
SESSIONS_DIR = COURSE_ROOT / "sessions"

def update_session_on_disk(session_id, sentence_id, corrected_text, timestamp=None):
    """Safely updates a sentence's text in the target session_*.json on disk."""
    if not session_id or not corrected_text:
        return False, "Missing sessionId or correctedText"

    cand = SESSIONS_DIR / f"session_{session_id}.json"
    if not cand.exists() and session_id.isdigit() and len(session_id) == 1:
        cand = SESSIONS_DIR / f"session_{int(session_id):02d}.json"

    if not cand.exists():
        return False, f"Session file not found: {cand.name}"

    try:
        with open(cand, "r", encoding="utf-8") as f:
            data = json.load(f)

        matched = False
        for p in data.get("paragraphs", []):
            for s in p.get("sentences", []):
                # match by sentence_id
                if sentence_id and s.get("id") == sentence_id:
                    s["text"] = corrected_text
                    matched = True
                    break
                # match by timestamp if sentence_id didn't match
                if timestamp is not None and abs(s.get("start", -999) - timestamp) < 0.08:
                    s["text"] = corrected_text
                    matched = True
                    break
            if matched:
                break

        if matched:
            with open(cand, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            return True, f"Updated {cand.name}"
        else:
            return False, f"Sentence {sentence_id} not found in {cand.name}"
    except Exception as e:
        return False, str(e)


class LocalSyncHandler(http.server.BaseHTTPRequestHandler):
    server_version = "TranscriptionsSyncServer/2.0"

    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def _send_json(self, status_code, data):
        response_body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response_body)))
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(response_body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/" or path == "/api/status":
            learned_db = alm.load_learned_corrections()
            terms = learned_db.get("global_terms", {})
            rules = learned_db.get("context_rules", [])
            session_files = list(SESSIONS_DIR.glob("session_*.json")) if SESSIONS_DIR.exists() else []

            self._send_json(200, {
                "status": "online",
                "service": "Transcriptions Local Active Learning & Sync Bridge",
                "version": "2.0",
                "totalGlobalTerms": len(terms),
                "totalContextRules": len(rules),
                "totalSessions": len(session_files),
                "courseRoot": str(COURSE_ROOT)
            })
        elif path == "/api/learned":
            learned_db = alm.load_learned_corrections()
            self._send_json(200, learned_db)
        else:
            self._send_json(404, {"error": "Not Found", "path": path})

    def do_POST(self):
        path = self.path.split("?")[0]
        content_length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"

        try:
            body = json.loads(raw_body)
        except Exception as e:
            self._send_json(400, {"error": f"Invalid JSON payload: {e}"})
            return

        if path == "/api/learn":
            session_id = str(body.get("sessionId", "")).strip()
            sentence_id = str(body.get("sentenceId", "")).strip()
            original_text = str(body.get("originalText", "")).strip()
            corrected_text = str(body.get("correctedText") or body.get("proposedText") or "").strip()
            page_ref = str(body.get("pageRef", "")).strip()
            note = str(body.get("note", "")).strip()
            apply_to_disk = body.get("applyToDisk", True)
            timestamp = body.get("timestamp") or body.get("start")

            # 1. Optionally update session on disk
            disk_updated = False
            disk_msg = "Skipped"
            if apply_to_disk and session_id and corrected_text:
                disk_updated, disk_msg = update_session_on_disk(
                    session_id, sentence_id, corrected_text, timestamp=timestamp
                )

            # 2. Evaluate with Active Learning Engine
            learn_result = None
            if original_text and corrected_text and original_text != corrected_text:
                learn_result = alm.evaluate_and_learn_edit(
                    session_id, original_text, corrected_text, page_range=page_ref, context=note
                )
            else:
                learn_result = {
                    "decision": "NOOP",
                    "learned_status": "無文字更動，略過名相學習。"
                }

            self._send_json(200, {
                "success": True,
                "disk_updated": disk_updated,
                "disk_message": disk_msg,
                "learning": learn_result
            })

        elif path == "/api/sync-batch":
            events = body.get("events", [])
            if not isinstance(events, list):
                self._send_json(400, {"error": "events must be an array"})
                return

            promoted_count = 0
            context_count = 0
            disk_updated_count = 0
            results = []

            for ev in events:
                sid = str(ev.get("sessionId", "")).strip()
                sent_id = str(ev.get("sentenceId", "")).strip()
                orig = str(ev.get("originalText", "")).strip()
                prop = str(ev.get("proposedText") or ev.get("correctedText") or "").strip()
                page = str(ev.get("pageRef", "")).strip()
                note = str(ev.get("note", "")).strip()
                ts = ev.get("timestamp") or ev.get("start")
                apply_disk = ev.get("applyToDisk", True)

                # Disk update
                disk_ok = False
                if apply_disk and sid and prop:
                    disk_ok, _ = update_session_on_disk(sid, sent_id, prop, timestamp=ts)
                    if disk_ok:
                        disk_updated_count += 1

                # Learning evaluation
                learn_res = None
                if orig and prop and orig != prop:
                    learn_res = alm.evaluate_and_learn_edit(sid, orig, prop, page_range=page, context=note)
                    dec = learn_res.get("decision")
                    if dec == "GLOBAL_PROMOTED":
                        promoted_count += 1
                    elif dec == "CONTEXT_SPECIFIC":
                        context_count += 1

                results.append({
                    "sessionId": sid,
                    "sentenceId": sent_id,
                    "disk_updated": disk_ok,
                    "learning": learn_res
                })

            self._send_json(200, {
                "success": True,
                "totalEvents": len(events),
                "promotedCount": promoted_count,
                "contextSpecificCount": context_count,
                "diskUpdatedCount": disk_updated_count,
                "details": results
            })

        elif path == "/api/shutdown":
            self._send_json(200, {"status": "shutting down"})
            threading.Thread(target=self.server.shutdown).start()
        else:
            self._send_json(404, {"error": "Not Found", "path": path})

    def log_message(self, format, *args):
        # Concise logging
        sys.stderr.write(f"[SyncServer] {args[0]} {args[1]} -> {args[2]}\n")


def run_server(port=9091, host="0.0.0.0"):
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer((host, port), LocalSyncHandler) as httpd:
        print(f"=======================================================")
        print(f"🚀 Transcriptions Local Sync & Active Learning Server")
        print(f"=======================================================")
        print(f"• Listening on: http://127.0.0.1:{port} (all interfaces)")
        print(f"• Active Learning DB: {alm.LEARNED_JSON_PATH}")
        print(f"• Sessions Directory: {SESSIONS_DIR}")
        print(f"• Ready for 1-Click Sync from Web UI (CORS enabled)")
        print(f"=======================================================\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server gracefully...")
        finally:
            httpd.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Local Sync & Active Learning Server")
    parser.add_argument("--port", type=int, default=9091, help="Port to listen on (default: 9091)")
    parser.add_argument("--host", default="0.0.0.0", help="Host interface to bind (default: 0.0.0.0)")
    args = parser.parse_args()
    run_server(port=args.port, host=args.host)

#!/usr/bin/env python3
"""Tailnet-only, non-caching Range proxy for remote course audio."""

import argparse
import json
import os
import shutil
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ALLOWED_ORIGIN = "https://huanruilee.github.io"
FORWARDED_HEADERS = ("Content-Type", "Content-Length", "Content-Range", "Accept-Ranges")


def load_map(path):
    payload = json.loads(Path(path).read_text())
    if not isinstance(payload, dict) or not payload:
        raise ValueError("audio map must be a non-empty object")
    for key, value in payload.items():
        parsed = urlparse(value)
        if not key.startswith("/") or parsed.scheme != "https" or parsed.hostname != "drive.usercontent.google.com":
            raise ValueError(f"invalid audio mapping: {key}")
    return payload


def upstream_request(url, range_header=None):
    headers = {"User-Agent": "Transcriptions-GX10-Audio-Proxy/1.0"}
    if range_header:
        headers["Range"] = range_header
    return urllib.request.Request(url, headers=headers, method="GET")


class AudioProxyHandler(BaseHTTPRequestHandler):
    audio_map = {}

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} {fmt % args}", flush=True)

    def _cors(self):
        origin = self.headers.get("Origin")
        if origin == ALLOWED_ORIGIN:
            self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Expose-Headers", "Accept-Ranges, Content-Length, Content-Range")

    def do_OPTIONS(self):
        if self.headers.get("Origin") != ALLOWED_ORIGIN:
            self.send_error(403)
            return
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Range")
        if self.headers.get("Access-Control-Request-Private-Network") == "true":
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_HEAD(self):
        self._serve(include_body=False)

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
            return
        self._serve(include_body=True)

    def _serve(self, include_body):
        path = unquote(urlparse(self.path).path)
        source = self.audio_map.get(path)
        if not source:
            self.send_error(404)
            return
        origin = self.headers.get("Origin")
        if origin and origin != ALLOWED_ORIGIN:
            self.send_error(403)
            return

        request = upstream_request(source, self.headers.get("Range"))
        try:
            upstream = urllib.request.urlopen(request, timeout=30)
        except urllib.error.HTTPError as error:
            upstream = error
        except Exception:
            self.send_error(502)
            return

        try:
            self.send_response(upstream.status)
            for name in FORWARDED_HEADERS:
                value = upstream.headers.get(name)
                if value:
                    self.send_header(name, value)
            self.send_header("Cache-Control", "no-store")
            self._cors()
            self.end_headers()
            if include_body:
                try:
                    shutil.copyfileobj(upstream, self.wfile, length=1024 * 1024)
                except (BrokenPipeError, ConnectionResetError):
                    pass
        finally:
            upstream.close()


def self_test():
    sample = "https://drive.usercontent.google.com/download?id=test&export=open"
    request = upstream_request(sample, "bytes=100-199")
    assert request.headers["Range"] == "bytes=100-199"
    assert urlparse(sample).hostname == "drive.usercontent.google.com"
    assert ALLOWED_ORIGIN == "https://huanruilee.github.io"
    print("SELF_TEST=PASS")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=39090)
    parser.add_argument("--map", dest="map_path", default=os.environ.get("AUDIO_PROXY_MAP_PATH"))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.map_path:
        parser.error("--map or AUDIO_PROXY_MAP_PATH is required")
    AudioProxyHandler.audio_map = load_map(args.map_path)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), AudioProxyHandler)
    print(f"LISTEN=127.0.0.1:{args.port} ROUTES={len(AudioProxyHandler.audio_map)}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()

"""
/api/info.py
POST { "url": "..." }
GET  ?url=...

Returns video metadata: title, thumbnail, duration, formats available
"""

import json
import subprocess
import os
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

def get_ytdlp_path():
    for p in ["/var/task/yt-dlp", "/usr/local/bin/yt-dlp", "/usr/bin/yt-dlp"]:
        if os.path.exists(p):
            return p
    return "yt-dlp"

def cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json"
    }

class handler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        pass

    def send_json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        for k, v in cors_headers().items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        for k, v in cors_headers().items():
            self.send_header(k, v)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        url = (params.get("url", [""])[0]).strip()
        self._process(url)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
        except Exception:
            data = {}
        url = data.get("url", "").strip()
        self._process(url)

    def _process(self, url):
        if not url or not url.startswith("http"):
            self.send_json(400, {"success": False, "error": "url required"})
            return
        try:
            ytdlp = get_ytdlp_path()
            result = subprocess.run(
                [ytdlp, "--dump-json", "--no-playlist", "--no-warnings",
                 "--no-check-certificates", url],
                capture_output=True, text=True, timeout=25
            )
            if result.returncode != 0:
                err = result.stderr.strip().split("\n")[-1] if result.stderr else "error"
                raise Exception(err)

            info = json.loads(result.stdout)
            # Extract available heights
            fmts = info.get("formats", [])
            heights = sorted(set(
                f["height"] for f in fmts if f.get("height") and f["height"] > 0
            ), reverse=True)

            self.send_json(200, {
                "success": True,
                "title": info.get("title", "Video"),
                "thumbnail": info.get("thumbnail", ""),
                "duration": info.get("duration", 0),
                "uploader": info.get("uploader", ""),
                "platform": info.get("extractor_key", ""),
                "available_heights": heights[:6],
            })
        except Exception as e:
            self.send_json(200, {"success": False, "error": str(e)})

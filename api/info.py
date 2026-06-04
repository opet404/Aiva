import json
import subprocess
import os
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs


def _cors(h):
    h["Access-Control-Allow-Origin"]  = "*"
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    h["Access-Control-Allow-Headers"] = "Content-Type"


def _ytdlp():
    for p in ["/var/task/bin/yt-dlp", "/tmp/yt-dlp", "/usr/local/bin/yt-dlp"]:
        if os.path.isfile(p):
            return p
    return "yt-dlp"


def _run(url):
    p = subprocess.run(
        [_ytdlp(), "--dump-json", "--no-playlist", "--no-warnings",
         "--no-check-certificates", "--no-cache-dir", url],
        capture_output=True, text=True, timeout=20
    )
    if p.returncode != 0:
        lines = (p.stderr or "").strip().splitlines()
        raise RuntimeError(lines[-1] if lines else "yt-dlp failed")

    d = json.loads(p.stdout)
    heights = sorted(set(
        f["height"] for f in d.get("formats", [])
        if f.get("height") and f["height"] > 0
    ), reverse=True)[:8]

    return {
        "success":          True,
        "title":            d.get("title", "Video"),
        "thumbnail":        d.get("thumbnail", ""),
        "duration":         d.get("duration", 0),
        "uploader":         d.get("uploader", ""),
        "platform":         d.get("extractor_key", ""),
        "available_heights":heights,
    }


class handler(BaseHTTPRequestHandler):

    def log_message(self, *a): pass

    def _send(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        _cors(self.headers)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        _cors(self.headers)
        self.end_headers()

    def do_GET(self):
        qs  = parse_qs(urlparse(self.path).query)
        url = qs.get("url", [""])[0].strip()
        self._go(url)

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        try:    body = json.loads(self.rfile.read(n))
        except: body = {}
        self._go(body.get("url", "").strip())

    def _go(self, url):
        if not url or not url.startswith("http"):
            self._send(400, {"success": False, "error": "url required"}); return
        try:
            self._send(200, _run(url))
        except Exception as e:
            self._send(200, {"success": False, "error": str(e)})

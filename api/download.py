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


def _sel(quality, audio):
    if audio:
        return "bestaudio[ext=m4a]/bestaudio/best"
    h = {"best": None, "720": "720", "480": "480", "360": "360"}.get(quality, "720")
    if h is None:
        return "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
    return (
        f"bestvideo[height<={h}][ext=mp4]+bestaudio[ext=m4a]"
        f"/best[height<={h}][ext=mp4]/best[height<={h}]"
    )


def _run(url, quality, audio):
    p = subprocess.run(
        [_ytdlp(), "--dump-json", "--no-playlist", "--no-warnings",
         "--no-check-certificates", "--no-cache-dir",
         "-f", _sel(quality, audio), url],
        capture_output=True, text=True, timeout=25
    )
    if p.returncode != 0:
        lines = (p.stderr or "").strip().splitlines()
        raise RuntimeError(lines[-1] if lines else "yt-dlp failed")

    d = json.loads(p.stdout)
    dl = d.get("url", "")
    if not dl:
        for f in d.get("requested_formats", []):
            if f.get("url"):
                dl = f["url"]; break
    if not dl:
        raise RuntimeError("No playable URL")

    return {
        "success":  True,
        "url":      dl,
        "title":    d.get("title", "Video"),
        "thumb":    d.get("thumbnail", ""),
        "duration": d.get("duration", 0),
        "ext":      "mp3" if audio else d.get("ext", "mp4"),
        "filesize": d.get("filesize") or d.get("filesize_approx") or 0,
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
        url = qs.get("url",     [""])[0].strip()
        q   = qs.get("quality", ["best"])[0].strip()
        fmt = qs.get("format",  ["video"])[0].strip()
        self._go(url, q, fmt)

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        try:    body = json.loads(self.rfile.read(n))
        except: body = {}
        url = body.get("url",     "").strip()
        q   = body.get("quality", "best").strip()
        fmt = body.get("format",  "video").strip()
        self._go(url, q, fmt)

    def _go(self, url, q, fmt):
        if not url or not url.startswith("http"):
            self._send(400, {"success": False, "error": "url required"}); return
        try:
            self._send(200, _run(url, q, fmt == "mp3"))
        except Exception as e:
            self._send(200, {"success": False, "error": str(e)})

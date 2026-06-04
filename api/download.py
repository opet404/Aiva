"""
/api/download.py
POST { "url": "...", "quality": "best|720|480|360", "format": "video|mp3" }
GET  ?url=...&quality=...&format=...

Returns:
  { "success": true, "url": "...", "title": "...", "thumb": "...", "duration": 0, "ext": "mp4" }
  { "success": false, "error": "..." }
"""

import json
import subprocess
import sys
import os
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

def get_ytdlp_path():
    """Find yt-dlp binary"""
    paths = [
        "/var/task/yt-dlp",
        "/usr/local/bin/yt-dlp",
        "/usr/bin/yt-dlp",
    ]
    for p in paths:
        if os.path.exists(p):
            return p
    return "yt-dlp"  # fallback to PATH

def build_ytdlp_cmd(url: str, quality: str, fmt: str) -> list:
    """Build yt-dlp command for info extraction only (no download)"""
    ytdlp = get_ytdlp_path()

    # Quality → format selector
    if fmt == "mp3":
        format_sel = "bestaudio[ext=m4a]/bestaudio/best"
    elif quality == "best":
        format_sel = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
    elif quality == "720":
        format_sel = "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]"
    elif quality == "480":
        format_sel = "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]"
    elif quality == "360":
        format_sel = "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best[height<=360]"
    else:
        format_sel = "best[ext=mp4]/best"

    return [
        ytdlp,
        "--dump-json",          # output info as JSON, no download
        "--no-playlist",
        "--no-warnings",
        "--no-check-certificates",
        "-f", format_sel,
        url
    ]

def run_ytdlp(url: str, quality: str, fmt: str):
    """Run yt-dlp and parse info"""
    cmd = build_ytdlp_cmd(url, quality, fmt)
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.returncode != 0:
            err = result.stderr.strip().split("\n")[-1] if result.stderr else "yt-dlp error"
            raise Exception(err)

        info = json.loads(result.stdout)

        # Get best format URL
        dl_url = info.get("url", "")
        if not dl_url:
            # Try requested_formats
            fmts = info.get("requested_formats", [])
            if fmts:
                dl_url = fmts[0].get("url", "")

        if not dl_url:
            raise Exception("Could not extract download URL")

        ext = "mp3" if fmt == "mp3" else info.get("ext", "mp4")

        return {
            "success": True,
            "url": dl_url,
            "title": info.get("title", "Video"),
            "thumb": info.get("thumbnail", ""),
            "duration": info.get("duration", 0),
            "ext": ext,
            "filesize": info.get("filesize") or info.get("filesize_approx") or 0,
            "uploader": info.get("uploader", ""),
        }

    except subprocess.TimeoutExpired:
        raise Exception("Timeout — video too long or server busy")
    except json.JSONDecodeError:
        raise Exception("Failed to parse video info")

def cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json"
    }

class handler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        pass  # suppress logs

    def send_json(self, status: int, data: dict):
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
        url     = (params.get("url",     [""])[0]).strip()
        quality = (params.get("quality", ["best"])[0]).strip()
        fmt     = (params.get("format",  ["video"])[0]).strip()
        self._process(url, quality, fmt)

    def do_POST(self):
        length  = int(self.headers.get("Content-Length", 0))
        body    = self.rfile.read(length)
        try:
            data = json.loads(body)
        except Exception:
            data = {}
        url     = data.get("url", "").strip()
        quality = data.get("quality", "best").strip()
        fmt     = data.get("format",  "video").strip()
        self._process(url, quality, fmt)

    def _process(self, url: str, quality: str, fmt: str):
        if not url:
            self.send_json(400, {"success": False, "error": "url required"})
            return
        if not url.startswith("http"):
            self.send_json(400, {"success": False, "error": "invalid url"})
            return
        try:
            result = run_ytdlp(url, quality, fmt)
            self.send_json(200, result)
        except Exception as e:
            self.send_json(200, {"success": False, "error": str(e)})

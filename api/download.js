// api/download.js
// Vercel Node.js serverless function
// POST { url, quality:"best|720|480|360", format:"video|mp3" }
// GET  ?url=...&quality=...&format=...

const { execFile } = require("child_process");
const path = require("path");

// yt-dlp-exec bundles yt-dlp binary — works on Vercel
let ytDlp;
try {
  ytDlp = require("yt-dlp-exec");
} catch (e) {
  ytDlp = null;
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.setHeader("Content-Type", "application/json");
}

function fmtSelector(quality, isAudio) {
  if (isAudio) return "bestaudio[ext=m4a]/bestaudio/best";
  const h = { best: null, "720": "720", "480": "480", "360": "360" }[quality] ?? "720";
  if (!h) return "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best";
  return `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${h}][ext=mp4]/best[height<=${h}]`;
}

async function getInfo(url, quality, isAudio) {
  if (!ytDlp) throw new Error("yt-dlp-exec not installed");

  const info = await ytDlp(url, {
    dumpSingleJson: true,
    noPlaylist: true,
    noWarnings: true,
    noCheckCertificates: true,
    noCacheDir: true,
    format: fmtSelector(quality, isAudio),
  });

  // grab direct stream url
  let dlUrl = info.url || "";
  if (!dlUrl && Array.isArray(info.requested_formats)) {
    for (const f of info.requested_formats) {
      if (f.url) { dlUrl = f.url; break; }
    }
  }
  if (!dlUrl) throw new Error("No playable URL returned");

  return {
    success:  true,
    url:      dlUrl,
    title:    info.title    || "Video",
    thumb:    info.thumbnail|| "",
    duration: info.duration || 0,
    ext:      isAudio ? "mp3" : (info.ext || "mp4"),
    filesize: info.filesize || info.filesize_approx || 0,
  };
}

module.exports = async function handler(req, res) {
  cors(res);

  // preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // parse params
  let url = "", quality = "best", format = "video";
  if (req.method === "POST") {
    const body = req.body || {};
    url     = (body.url     || "").trim();
    quality = (body.quality || "best").trim();
    format  = (body.format  || "video").trim();
  } else {
    const q = req.query || {};
    url     = (q.url     || "").trim();
    quality = (q.quality || "best").trim();
    format  = (q.format  || "video").trim();
  }

  if (!url || !url.startsWith("http")) {
    return res.status(400).json({ success: false, error: "url required" });
  }

  try {
    const result = await getInfo(url, quality, format === "mp3");
    return res.status(200).json(result);
  } catch (err) {
    return res.status(200).json({ success: false, error: String(err.message || err) });
  }
};

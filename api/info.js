// api/info.js
// GET  ?url=...
// POST { url }

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

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  let url = "";
  if (req.method === "POST") {
    url = ((req.body || {}).url || "").trim();
  } else {
    url = ((req.query || {}).url || "").trim();
  }

  if (!url || !url.startsWith("http")) {
    return res.status(400).json({ success: false, error: "url required" });
  }

  if (!ytDlp) {
    return res.status(500).json({ success: false, error: "yt-dlp-exec not installed" });
  }

  try {
    const info = await ytDlp(url, {
      dumpSingleJson: true,
      noPlaylist: true,
      noWarnings: true,
      noCheckCertificates: true,
      noCacheDir: true,
    });

    const heights = [...new Set(
      (info.formats || []).map(f => f.height).filter(h => h > 0)
    )].sort((a, b) => b - a).slice(0, 8);

    return res.status(200).json({
      success:           true,
      title:             info.title      || "Video",
      thumbnail:         info.thumbnail  || "",
      duration:          info.duration   || 0,
      uploader:          info.uploader   || "",
      platform:          info.extractor_key || "",
      available_heights: heights,
    });
  } catch (err) {
    return res.status(200).json({ success: false, error: String(err.message || err) });
  }
};

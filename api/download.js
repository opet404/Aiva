// /api/download.js — Vercel Serverless Function
// Download video/audio dengan buffer (compatible dengan Vercel)

export default async function handler(req, res) {
  const { url: targetUrl, filename = "aiva_download.mp4" } = req.query;

  if (!targetUrl) return res.status(400).send("URL kosong");

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const decoded = decodeURIComponent(targetUrl);

    const response = await fetch(decoded, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120",
        "Referer":    "https://www.tiktok.com/"
      },
      signal: AbortSignal.timeout(55000)
    });

    if (!response.ok) {
      return res.status(502).send("Gagal fetch video: HTTP " + response.status);
    }

    const contentType = response.headers.get("content-type") || "video/mp4";
    const contentLen  = response.headers.get("content-length");

    // Sanitize filename
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    res.setHeader("Content-Type", contentType);
    if (contentLen) res.setHeader("Content-Length", contentLen);

    // Buffer seluruh response lalu kirim sekaligus (lebih stabil di Vercel)
    const buffer = await response.arrayBuffer();
    res.status(200).send(Buffer.from(buffer));

  } catch (err) {
    if (!res.headersSent) {
      res.status(500).send("Download error: " + err.message);
    }
  }
}

// /api/download.js — Vercel Serverless Function
// Stream video/audio langsung ke browser → auto download

export default async function handler(req, res) {
  const { url: targetUrl, filename = "aiva_download.mp4" } = req.query;

  if (!targetUrl) return res.status(400).send("URL kosong");

  try {
    const decoded = decodeURIComponent(targetUrl);

    const response = await fetch(decoded, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120",
        "Referer":    "https://www.tiktok.com/"
      },
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      return res.status(502).send("Gagal fetch video: HTTP " + response.status);
    }

    const contentType = response.headers.get("content-type") || "video/mp4";
    const contentLen  = response.headers.get("content-length");

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (contentLen) res.setHeader("Content-Length", contentLen);

    // Stream body langsung ke client
    const reader = response.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    };
    await pump();

  } catch (err) {
    if (!res.headersSent) {
      res.status(500).send("Download error: " + err.message);
    }
  }
}

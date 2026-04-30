// /api/download.js — AIVA Proxy Download (fallback kalau direct URL kena CORS)
// Hanya dipakai jika browser tidak bisa download langsung

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { url: targetUrl, filename = "aiva_download.mp4" } = req.query;
  if (!targetUrl) return res.status(400).send("URL kosong");

  try {
    const decoded = decodeURIComponent(targetUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 50000);

    const response = await fetch(decoded, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120",
        "Referer":    "https://www.tiktok.com/"
      },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!response.ok) {
      return res.status(502).send("Gagal fetch: HTTP " + response.status);
    }

    const safeName    = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const contentType = response.headers.get("content-type") || "video/mp4";
    const contentLen  = response.headers.get("content-length");

    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    res.setHeader("Content-Type", contentType);
    if (contentLen) res.setHeader("Content-Length", contentLen);

    const buffer = await response.arrayBuffer();
    res.status(200).send(Buffer.from(buffer));

  } catch (err) {
    if (!res.headersSent) {
      res.status(500).send("Error: " + err.message);
    }
  }
}

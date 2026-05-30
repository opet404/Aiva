// api/chat.js
const { callAPI } = require("./_lib");

// ── In-memory rate limiter (per serverless instance) ─────────
const _rl = new Map();
function isRateLimited(ip, max = 25) {
  const win = Math.floor(Date.now() / 60000);
  const key = `${ip}|${win}`;
  const n = (_rl.get(key) || 0) + 1;
  _rl.set(key, n);
  if (_rl.size > 3000) {
    for (const k of _rl.keys()) {
      if (!k.endsWith(`|${win}`)) _rl.delete(k);
    }
  }
  return n > max;
}

// ── Bot / scraper user-agent patterns ────────────────────────
const BOT_RE = /bot|crawl|spider|scraper|python|curl|wget|go-http|java\/|okhttp|axios|node-fetch|libwww|perl|ruby|php|scan|nikto|nmap|sqlmap|masscan/i;

module.exports = async function handler(req, res) {
  // Security headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ── Bot detection ─────────────────────────────────────────
  const ua = req.headers["user-agent"] || "";
  if (!ua || BOT_RE.test(ua)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // ── Rate limiting ─────────────────────────────────────────
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim()
          || req.headers["x-real-ip"]
          || req.socket?.remoteAddress
          || "unknown";

  if (isRateLimited(ip, 25)) {
    return res.status(429).json({ error: "Terlalu banyak request. Tunggu 1 menit." });
  }

  // ── Request size guard (max 16 KB) ────────────────────────
  const body = req.body;
  if (JSON.stringify(body).length > 16384) {
    return res.status(413).json({ error: "Request terlalu besar." });
  }

  try {
    const { message, api = "groq", history = [], userName = "" } = body;
    if (!message) return res.status(400).json({ reply: "Pesan kosong!" });

    const trimmedHistory = Array.isArray(history) ? history.slice(-6) : [];
    const reply = await callAPI(api, message, trimmedHistory, userName);
    return res.status(200).json({ reply });

  } catch (err) {
    console.error("CHAT ERROR:", err.message);
    const msg = err.message || "";
    let errMsg;
    if (msg.includes("429") || msg.includes("rate") || msg.includes("quota"))
      errMsg = "⚠️ Semua model sedang penuh. Coba lagi dalam 30 detik.";
    else if (msg.includes("503") || msg.includes("502"))
      errMsg = "⚠️ Server model sedang down. Coba lagi sebentar.";
    else if (msg.includes("AbortError") || msg.includes("Timeout"))
      errMsg = "⏱️ Model terlalu lama merespons. Coba lagi.";
    else
      errMsg = "❌ Error: " + msg;
    return res.status(200).json({ reply: errMsg });
  }
};

// api/multi-chat.js
const { callAPI } = require("./_lib");

const _rl = new Map();
function isRateLimited(ip, max = 10) {
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

const BOT_RE = /bot|crawl|spider|scraper|python|curl|wget|go-http|java\/|okhttp|axios|node-fetch|libwww|perl|ruby|php|scan|nikto|nmap|sqlmap|masscan/i;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ua = req.headers["user-agent"] || "";
  if (!ua || BOT_RE.test(ua)) return res.status(403).json({ error: "Forbidden" });

  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim()
          || req.headers["x-real-ip"]
          || req.socket?.remoteAddress
          || "unknown";

  if (isRateLimited(ip, 10)) {
    return res.status(429).json({ error: "Terlalu banyak request. Tunggu 1 menit." });
  }

  if (JSON.stringify(req.body).length > 16384) {
    return res.status(413).json({ error: "Request terlalu besar." });
  }

  try {
    const { message, models: selectedModels, history = [], userName = "" } = req.body;
    if (!message) return res.status(400).json({ error: "Pesan kosong!" });

    const allModels = selectedModels?.length >= 2 ? selectedModels : ["groq", "qwen", "gpt"];
    const trimmedHistory = Array.isArray(history) ? history.slice(-12) : [];

    const results = await Promise.allSettled(
      allModels.map(api => callAPI(api, message, trimmedHistory, userName))
    );

    const replies = {};
    allModels.forEach((api, i) => {
      if (results[i].status === "fulfilled") replies[api] = results[i].value;
      else replies[api] = `Gagal: ${results[i].reason?.message || "unknown"}`;
    });

    return res.status(200).json({ replies });
  } catch (err) {
    console.error("MULTI-CHAT ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

// api/chat.js
const { callAPI } = require("./_lib");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  try {
    const { message, api = "groq", history = [], userName = "" } = req.body || {};
    if (!message) return res.status(400).json({ reply: "Pesan kosong!" });

    const hist  = Array.isArray(history) ? history.slice(-8) : [];
    const reply = await callAPI(api, message, hist, userName);
    return res.status(200).json({ reply });

  } catch (err) {
    // Log detail error ke Vercel logs
    console.error("[chat] FULL ERROR:", JSON.stringify({
      message: err.message,
      stack: err.stack,
      errors: err.errors ? err.errors.map(e => e?.message || String(e)) : undefined
    }));

    const m = err.message || "";
    let reply;
    if (m.includes("401") || m.includes("auth") || m.includes("Unauthorized"))
      reply = "❌ Key tidak valid / expired. Cek env OR_KEY di Vercel.";
    else if (m.includes("402"))
      reply = "❌ Saldo OpenRouter habis.";
    else if (m.includes("429") || m.includes("rate") || m.includes("limit"))
      reply = "⚠️ Rate limit. Coba lagi sebentar.";
    else if (m.includes("503") || m.includes("502"))
      reply = "⚠️ Server model down.";
    else
      reply = "❌ Error: " + m;

    return res.status(200).json({ reply });
  }
};

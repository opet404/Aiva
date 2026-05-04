// api/chat.js — Vercel Serverless Function untuk single chat
const { callAPI } = require("./_lib");

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { message, api = "groq", history = [] } = req.body;
    if (!message) return res.status(400).json({ reply: "Pesan kosong!" });

    // Slice history untuk safety, batasi lebih ketat supaya prompt lebih pendek = lebih cepat
    const trimmedHistory = Array.isArray(history) ? history.slice(-6) : [];

    // Buat promise dengan timeout manual 9 detik (Vercel Hobby limit 10 detik)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Server HTTP 504: Response terlalu lama. Coba pertanyaan yang lebih pendek atau pilih topik yang lebih spesifik.")), 9000)
    );

    const reply = await Promise.race([
      callAPI(api, message, trimmedHistory),
      timeoutPromise
    ]);

    return res.status(200).json({ reply });

  } catch (err) {
    console.error("CHAT ERROR:", err.message);
    // Pesan error yang lebih informatif untuk user
    const errMsg = err.message.includes("504") || err.message.includes("Timeout") || err.message.includes("terlalu lama")
      ? "⏱️ Waktu habis! Model AI sedang sibuk. Tips:\n• Coba lagi dalam beberapa detik\n• Pertanyaan coding kompleks → pilih model AIVA\n• Pertanyaan singkat → Groq paling cepat"
      : "❌ Error: " + err.message;
    return res.status(200).json({ reply: errMsg });
  }
};

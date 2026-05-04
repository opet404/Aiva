// api/chat.js — Vercel Serverless Function untuk single chat
const { callAPI } = require("./_lib");

// History disimpan di memory per-instance.
// Di Vercel, instance bisa warm (persist antar request sebentar) atau cold start.
// Untuk production yang butuh persistent history → pakai Vercel KV / Upstash Redis.
// Untuk sekarang: history dikirim dari frontend (sudah dikelola di localStorage).
const chatHistories = {};

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { message, api = "groq", history = [], sessionId } = req.body;
    if (!message) return res.status(400).json({ reply: "Pesan kosong!" });

    // Gunakan history yang dikirim dari frontend (dikelola di localStorage)
    // Slice -12 untuk safety
    const trimmedHistory = Array.isArray(history) ? history.slice(-12) : [];

    const reply = await callAPI(api, message, trimmedHistory);
    return res.status(200).json({ reply });

  } catch (err) {
    console.error("CHAT ERROR:", err.message);
    return res.status(200).json({ reply: "Server error: " + err.message });
  }
};

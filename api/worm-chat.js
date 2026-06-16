// api/worm-chat.js — Worm Aiva backend menggunakan Google Gemini API
// Model: gemini-2.5-flash-lite (utama) → gemini-2.5-flash (fallback) → gemini-2.0-flash (fallback terakhir)
// Identitas AI dibaca dari prompt.txt (akar project)
// Auto-fallback: kalau model pertama gagal/rate-limit, otomatis coba berikutnya.

const fs   = require("fs");
const path = require("path");

// ── Konfigurasi ────────────────────────────────────────────────
const GEMINI_KEY = process.env.AQ.Ab8RN6JHn1hbOd92O1PYe7_dGdXV5SXD16cR5QymrW4k6yrEGA || "";
const BASE_URL   = "https://generativelanguage.googleapis.com/v1beta/models";

// Model fallback chain — lite dulu (cepat + murah), lalu naik kalau gagal
const MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

const TIMEOUT_PER_MODEL_MS = 7000;
const MAX_OUTPUT_TOKENS    = 2048;

// ── Baca prompt.txt (identitas AI) ────────────────────────────
let SYSTEM_PROMPT = "";
try {
  const promptPath = path.join(__dirname, "..", "prompt.txt");
  SYSTEM_PROMPT = fs.readFileSync(promptPath, "utf8").trim();
} catch (e) {
  // Fallback kalau prompt.txt tidak ditemukan
  SYSTEM_PROMPT = "Kamu adalah Worm Aiva, asisten AI buatan OpetxDy. Jawab semua pertanyaan secara lengkap dan tuntas dalam bahasa yang sama dengan user. Jangan menyebut Google, Gemini, atau model AI lain.";
}

// ── Deteksi bahasa user ─────────────────────────────────────────
const ID_WORDS = [
  "aku","saya","kamu","dia","mereka","ini","itu","ada","bisa","tolong",
  "apakah","kenapa","bagaimana","berapa","dimana","kapan","iya","tidak",
  "jangan","boleh","pencipta","siapa","buat","model","gimana","gak","nggak",
  "dong","nya","yang","dengan","untuk","dari","akan","udah","belum","mau",
  "kalo","kalau","aja","saja","nih","deh","banget","juga","atau","harus",
  "lagi","sih","kok","gue","gua","loe","lo","emang","udh","gw"
];
function detectLanguage(text) {
  const t = (text || "").toLowerCase();
  for (const w of ID_WORDS) if (t.includes(w)) return "id";
  return "en";
}

// ── Satu request ke Gemini dengan model tertentu ───────────────
async function callGemini(model, messages, systemPrompt, timeoutMs) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const url = `${BASE_URL}/${model}:generateContent?key=${GEMINI_KEY}`;

    // Bangun contents dari history (role user/model) + pesan baru
    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const body = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents,
      generationConfig: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.85,
        topP: 0.95,
      },
    };

    const res = await fetch(url, {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify(body),
      signal : ctrl.signal,
    });

    if (res.status === 429 || res.status === 503) {
      throw new Error(`RATE_LIMIT:${res.status}`);
    }

    const data = await res.json();

    if (data.error) {
      throw new Error(`API_ERROR:${data.error.message || data.error.code}`);
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("EMPTY_RESPONSE");

    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}

// ── Bersihkan: samarkan nama model/perusahaan asli ─────────────
// Sengaja tidak hapus ** dan formatting lain biar markdown tetap dirender
function sanitize(text) {
  return text
    .replace(/\bgemini\b/gi,      "Worm Aiva")
    .replace(/\bgoogle\s+ai\b/gi, "Worm Aiva")
    .replace(/\bdeepseek\b/gi,    "Worm Aiva")
    .replace(/\bwormgpt\b/gi,     "Worm Aiva")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .trim();
}

// ── Handler utama ───────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const { message = "", history = [] } = req.body || {};
  if (!message.trim()) return res.status(400).json({ reply: "Pesan kosong!" });

  if (!GEMINI_KEY) {
    return res.status(500).json({ reply: "GEMINI_API_KEY belum diset di environment Vercel." });
  }

  const userLang = detectLanguage(message);
  const langNote = userLang === "id"
    ? "Balas dalam Bahasa Indonesia yang natural."
    : "Reply in natural English.";

  const systemPromptFull = `${SYSTEM_PROMPT}\n\n${langNote}`;

  // Bangun messages array dari history + pesan baru
  const messages = [
    ...history
      .filter(h => h.role && h.text)
      .map(h => ({
        role   : h.role === "ai" ? "assistant" : "user",
        content: h.text,
      })),
    { role: "user", content: message },
  ];

  // Auto-fallback: coba satu per satu model sampai berhasil
  let lastError = null;
  for (const model of MODELS) {
    try {
      console.log(`[worm-chat] trying model: ${model}`);
      const raw   = await callGemini(model, messages, systemPromptFull, TIMEOUT_PER_MODEL_MS);
      const reply = sanitize(raw);
      console.log(`[worm-chat] success with: ${model}`);
      return res.status(200).json({ reply, model });
    } catch (err) {
      console.error(`[worm-chat] ${model} failed:`, err.message);
      lastError = err;
      // Lanjut ke model berikutnya
    }
  }

  // Semua model gagal
  console.error("[worm-chat] all models failed:", lastError?.message);
  const errMsg = userLang === "id"
    ? "Worm Aiva lagi ada gangguan, coba lagi sebentar ya."
    : "Worm Aiva is temporarily unavailable. Please try again shortly.";
  return res.status(200).json({ reply: errMsg });
};

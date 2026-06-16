// api/worm-chat.js — Worm Aiva backend via Google Gemini API
// Fallback chain: gemini-2.5-flash → gemini-2.5-flash-lite → gemini-2.0-flash
// Identitas AI dibaca dari prompt.txt (dibundle via vercel.json includeFiles)

const fs   = require("fs");
const path = require("path");

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// Fallback chain — kalau rate limit / error, otomatis lanjut ke model berikutnya
const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
];

const TIMEOUT_MS        = 25000;
const MAX_OUTPUT_TOKENS = 8192;

// Baca identitas dari prompt.txt
let SYSTEM_PROMPT = "";
try {
  SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, "..", "prompt.txt"), "utf8").trim();
} catch {
  SYSTEM_PROMPT = "Kamu adalah Worm Aiva, asisten AI buatan OpetxDy. Jawab semua pertanyaan secara lengkap dan tuntas. Jangan menyebut Google, Gemini, atau model AI lain.";
}

// Deteksi bahasa user
const ID_WORDS = ["aku","saya","kamu","ini","itu","ada","bisa","tolong","apakah",
  "kenapa","bagaimana","berapa","dimana","kapan","iya","tidak","jangan","boleh",
  "yang","dengan","untuk","dari","akan","udah","mau","kalo","kalau","aja","nih",
  "deh","banget","juga","atau","lagi","sih","kok","gue","gua","lo","emang","gw",
  "dong","nya","gak","nggak","udh","siapa","pencipta","buat","model","gimana"];

function detectLang(text) {
  const t = (text || "").toLowerCase();
  for (const w of ID_WORDS) if (new RegExp("\\b" + w + "\\b").test(t)) return "id";
  return "en";
}

// Sanitize: sembunyikan nama model/perusahaan asli
function sanitize(text) {
  return text
    .replace(/\bgemini[\s\-]\w+/gi, "Worm Aiva")
    .replace(/\bgemini\b/gi,        "Worm Aiva")
    .replace(/\bgoogle\s+ai\b/gi,   "Worm Aiva")
    .replace(/\bdeepseek\b/gi,      "Worm Aiva")
    .replace(/\bwormgpt\b/gi,       "Worm Aiva")
    .trim();
}

// Request ke satu model Gemini
async function callModel(apiKey, model, contents, systemPrompt) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/${model}:generateContent?key=${apiKey}`, {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: 0.9,
          topP: 0.95,
        },
      }),
      signal: ctrl.signal,
    });

    // Rate limit atau overload → lanjut ke model berikutnya
    if (res.status === 429 || res.status === 503 || res.status === 500) {
      throw new Error(`RATELIMIT_${res.status}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(`API_ERR: ${data.error.message}`);

    const candidate = data?.candidates?.[0];
    if (!candidate) throw new Error("NO_CANDIDATE");

    // Safety block → lanjut ke model berikutnya  
    const finish = candidate.finishReason;
    if (finish && !["STOP", "MAX_TOKENS", ""].includes(finish)) {
      throw new Error(`FINISH_${finish}`);
    }

    const text = (candidate?.content?.parts || []).map(p => p.text || "").join("").trim();
    if (!text) throw new Error("EMPTY");

    return text;
  } finally {
    clearTimeout(timer);
  }
}

// Handler utama
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  // Key dibaca per-request biar kebaca dari Vercel env vars
  const API_KEY = process.env.GEMINI_API_KEY || "";
  if (!API_KEY) {
    return res.status(200).json({
      reply: "⚠️ GEMINI_API_KEY belum diset di Vercel → Settings → Environment Variables.",
    });
  }

  const { message = "", history = [], userName = "" } = req.body || {};
  if (!message.trim()) return res.status(400).json({ reply: "Pesan kosong!" });

  const lang     = detectLang(message);
  const langNote = lang === "id"
    ? "Balas dalam Bahasa Indonesia yang natural dan santai."
    : "Reply in natural English.";

  const systemFull = SYSTEM_PROMPT
    + "\n\n" + langNote
    + (userName ? `\n\nNama pengguna: "${userName}". Panggil dengan nama ini kalau relevan.` : "")
    + "\n\nJawab LENGKAP dan TUNTAS dari awal sampai akhir. Jangan potong jawaban di tengah.";

  // Bangun Gemini contents dari history + pesan baru
  const contents = [];
  for (const h of (history || [])) {
    if (!h.role || !h.text) continue;
    contents.push({
      role : h.role === "ai" ? "model" : "user",
      parts: [{ text: h.text }],
    });
  }
  contents.push({ role: "user", parts: [{ text: message }] });

  // Auto-fallback: coba model satu per satu sampai berhasil
  let lastErr = "";
  for (const model of MODELS) {
    try {
      console.log(`[worm] trying ${model}`);
      const raw   = await callModel(API_KEY, model, contents, systemFull);
      const reply = sanitize(raw);
      console.log(`[worm] OK ${model}`);
      return res.status(200).json({ reply });
    } catch (err) {
      lastErr = err.message;
      console.error(`[worm] ${model} failed: ${lastErr}`);
      // Lanjut ke model berikutnya
    }
  }

  // Semua model gagal
  const errMsg = lang === "id"
    ? "Worm Aiva lagi gangguan, coba lagi sebentar ya."
    : "Worm Aiva is temporarily unavailable. Please try again.";
  return res.status(200).json({ reply: errMsg });
};

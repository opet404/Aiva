// api/worm-chat.js — Worm Aiva backend (Gemini API)
// Fallback chain: gemini-2.5-flash-lite → gemini-2.5-flash → gemini-2.0-flash
// Identitas AI dibaca dari prompt.txt

const fs   = require("fs");
const path = require("path");

const API_KEY_HARDCODED = "AQ.Ab8RN6JHn1hbOd92O1PYe7_dGdXV5SXD16cR5QymrW4k6yrEGA"; // ← ganti dengan Gemini API key kamu

const MODELS = [
  "gemini-2.5-flash-lite-preview-06-17",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

const TIMEOUT_MS       = 25000;
const MAX_OUTPUT_TOKENS = 8192;

// Baca prompt.txt saat startup (sudah dibundle via vercel.json includeFiles)
let SYSTEM_PROMPT = "";
try {
  const p = path.join(__dirname, "..", "prompt.txt");
  SYSTEM_PROMPT = fs.readFileSync(p, "utf8").trim();
} catch {
  SYSTEM_PROMPT = "Kamu adalah Worm Aiva, asisten AI buatan OpetxDy. Jawab semua pertanyaan secara lengkap dan tuntas. Jangan menyebut Google, Gemini, atau model AI lain.";
}

// ── Deteksi bahasa ─────────────────────────────────────────────
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

// ── Sanitize: sembunyikan identitas model asli ─────────────────
function sanitize(text) {
  return text
    .replace(/\bgemini[\s-]\w+/gi, "Worm Aiva")
    .replace(/\bgemini\b/gi,       "Worm Aiva")
    .replace(/\bgoogle\s+ai\b/gi,  "Worm Aiva")
    .replace(/\bdeepseek\b/gi,     "Worm Aiva")
    .replace(/\bwormgpt\b/gi,      "Worm Aiva")
    .trim();
}

// ── Request ke satu model Gemini ───────────────────────────────
async function callGemini(apiKey, model, contents, systemPrompt) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const url = `${BASE_URL}/${model}:generateContent?key=${apiKey}`;
    const body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.9,
        topP: 0.95,
      },
    };

    const res  = await fetch(url, {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify(body),
      signal : ctrl.signal,
    });

    // Rate-limit / overload → lanjut ke model berikutnya
    if (res.status === 429 || res.status === 503 || res.status === 500) {
      const raw = await res.text().catch(() => "");
      throw new Error(`HTTP_${res.status}: ${raw.slice(0, 120)}`);
    }

    const data = await res.json();

    if (data.error) throw new Error(`API_ERR: ${data.error.message}`);

    // Tangani finish_reason SAFETY / RECITATION (model nolak)
    const candidate = data?.candidates?.[0];
    if (!candidate) throw new Error("NO_CANDIDATE");

    const finishReason = candidate.finishReason;
    if (finishReason && !["STOP","MAX_TOKENS",""].includes(finishReason)) {
      throw new Error(`FINISH_${finishReason}`);
    }

    const text = candidate?.content?.parts?.map(p => p.text || "").join("").trim();
    if (!text) throw new Error("EMPTY_TEXT");

    return text;
  } finally {
    clearTimeout(timer);
  }
}

// ── Handler utama ───────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  // Baca API key — dari env var (Vercel) atau hardcoded di file
  const API_KEY = process.env.GEMINI_API_KEY || API_KEY_HARDCODED;
  if (!API_KEY || API_KEY === "PASTE_KEY_DISINI") {
    return res.status(200).json({
      reply: "⚠️ API key belum diisi. Edit api/worm-chat.js dan ganti PASTE_KEY_DISINI dengan Gemini API key kamu.",
    });
  }

  const { message = "", history = [] } = req.body || {};
  if (!message.trim()) return res.status(400).json({ reply: "Pesan kosong!" });

  const lang     = detectLang(message);
  const langNote = lang === "id"
    ? "Balas dalam Bahasa Indonesia yang natural dan santai."
    : "Reply in natural English.";

  const systemFull = `${SYSTEM_PROMPT}\n\n${langNote}\n\nJawab LENGKAP dan TUNTAS. Jangan potong jawaban di tengah.`;

  // Bangun Gemini contents array dari history + pesan baru
  const contents = [];
  for (const h of history) {
    if (!h.role || !h.text) continue;
    contents.push({
      role : h.role === "ai" ? "model" : "user",
      parts: [{ text: h.text }],
    });
  }
  contents.push({ role: "user", parts: [{ text: message }] });

  // Auto-fallback: coba model satu per satu
  let lastErr = "";
  for (const model of MODELS) {
    try {
      console.log(`[worm] trying ${model}`);
      const raw   = await callGemini(API_KEY, model, contents, systemFull);
      const reply = sanitize(raw);
      return res.status(200).json({ reply });
    } catch (err) {
      lastErr = err.message;
      console.error(`[worm] ${model} failed: ${lastErr}`);
    }
  }

  // Semua gagal
  const errMsg = lang === "id"
    ? "Worm Aiva lagi gangguan nih, coba lagi sebentar ya."
    : "Worm Aiva is temporarily unavailable. Please try again.";
  return res.status(200).json({ reply: errMsg });
};

// api/worm-chat.js — Worm Aiva backend via OpenRouter (free models)
// Identitas dari prompt.txt | Keys reuse dari _lib.js

const fs   = require("fs");
const path = require("path");

const KEYS = [
  process.env.OR_KEY_1 || "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",
  process.env.OR_KEY_2 || "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",
  process.env.OR_KEY_3 || "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",
  process.env.OR_KEY_4 || "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",
  process.env.OR_KEY_5 || "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",
  process.env.OR_KEY_6 || "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",
  process.env.OR_KEY_7 || "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",
].filter(Boolean);

const SITE_URL   = process.env.SITE_URL || "https://aiva.vercel.app";
const TIMEOUT_MS = 20000;

const WORM_MODELS = [
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "nvidia/nemotron-3-super-120b-a12b:free"
];

// Baca identitas dari prompt.txt
let SYSTEM_PROMPT = "";
try {
  SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, "..", "prompt.txt"), "utf8").trim();
} catch {
  SYSTEM_PROMPT = "Kamu adalah Worm Aiva, asisten AI buatan OpetxDy. Jawab semua pertanyaan secara lengkap dan tuntas.";
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

// Request ke OpenRouter — satu key, satu model
async function tryKey(key, model, messages) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method : "POST",
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type" : "application/json",
        "HTTP-Referer"  : SITE_URL,
        "X-Title"       : "Worm Aiva",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature : 0.85,
        max_tokens  : 4096,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error?.message || "HTTP " + res.status);

    let text = data?.choices?.[0]?.message?.content || "";
    // Hapus thinking block (DeepSeek R1)
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    if (!text) throw new Error("empty");
    return text;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// Coba satu model dengan semua key secara paralel
async function tryModel(model, messages) {
  return Promise.any(KEYS.map(k => tryKey(k, model, messages)));
}

// Coba semua model satu per satu
async function tryChain(messages) {
  for (const model of WORM_MODELS) {
    try {
      console.log(`[worm] trying ${model}`);
      const result = await tryModel(model, messages);
      console.log(`[worm] OK ${model}`);
      return result;
    } catch (e) {
      console.log(`[worm] ${model} failed: ${e.message}`);
    }
  }
  throw new Error("all models failed");
}

// Handler utama
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const { message = "", history = [], userName = "" } = req.body || {};
  if (!message.trim()) return res.status(400).json({ reply: "Pesan kosong!" });

  const lang     = detectLang(message);
  const langNote = lang === "id"
    ? "Balas dalam Bahasa Indonesia yang natural dan santai."
    : "Reply in natural English.";

  const systemFull = SYSTEM_PROMPT
    + "\n\n" + langNote
    + (userName ? `\n\nNama pengguna saat ini: "${userName}". WAJIB panggil dengan nama ini saat relevan. Jika ditanya siapa nama user, jawab dengan nama ini.` : "")
    + "\n\nJawab LENGKAP dan TUNTAS. Jangan potong jawaban di tengah.";

  const messages = [
    { role: "system", content: systemFull },
    ...(history || [])
      .filter(h => h.role && h.text)
      .map(h => ({ role: h.role === "ai" ? "assistant" : "user", content: h.text })),
    { role: "user", content: message },
  ];

  try {
    const reply = await tryChain(messages);
    return res.status(200).json({ reply });
  } catch (err) {
    console.error("[worm] all failed:", err.message);
    const errMsg = lang === "id"
      ? "Worm Aiva lagi gangguan, coba lagi sebentar ya."
      : "Worm Aiva is temporarily unavailable. Please try again.";
    return res.status(200).json({ reply: errMsg });
  }
};

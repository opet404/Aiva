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
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "nvidia/nemotron-3-super:free",
  "openai/gpt-oss-120b:free",
  "google/gemma-4-31b:free",
  "openrouter/free",
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

// api/worm-chat.js — Worm Aiva backend via OpenRouter (free models)

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
  "qwen/qwen3-coder:free"
];

let SYSTEM_PROMPT = "";
try {
  SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, "..", "prompt.txt"), "utf8").trim();
} catch {
  SYSTEM_PROMPT = "Kamu adalah Worm Aiva, asisten AI buatan OpetxDy. Jawab semua pertanyaan secara lengkap dan tuntas.";
}

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

let _kidx = 0;

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
      body: JSON.stringify({ model, messages, temperature: 0.85, max_tokens: 4096 }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (res.status === 429) throw new Error("RATELIMIT");

    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error?.message || "HTTP " + res.status);

    let text = data?.choices?.[0]?.message?.content || "";
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    if (!text) throw new Error("empty");
    return text;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function tryModel(model, messages) {
  const start = _kidx;
  for (let i = 0; i < KEYS.length; i++) {
    const idx = (start + i) % KEYS.length;
    try {
      const result = await tryKey(KEYS[idx], model, messages);
      _kidx = (idx + 1) % KEYS.length;
      return result;
    } catch (e) {
      if (e.message === "RATELIMIT") {
        _kidx = (idx + 1) % KEYS.length;
        throw e;
      }
      console.log(`[worm] key ${idx + 1} error: ${e.message}`);
    }
  }
  throw new Error("ALLFAILED");
}

async function tryChain(messages) {
  for (const model of WORM_MODELS) {
    try {
      const result = await tryModel(model, messages);
      return result;
    } catch (e) {
      if (e.message === "RATELIMIT") throw e;
      console.log(`[worm] ${model} failed: ${e.message}`);
    }
  }
  throw new Error("ALLFAILED");
}

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
    + (userName ? `\n\nNama pengguna saat ini: "${userName}". WAJIB panggil dengan nama ini saat relevan.` : "")
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
    const m = err.message || "";
    const isRateLimit = m === "RATELIMIT" || m.includes("429");
    const errMsg = lang === "id"
      ? (isRateLimit
          ? "⚠️ Worm Aiva lagi sibuk, coba lagi sebentar ya."
          : "Worm Aiva lagi gangguan, coba lagi sebentar ya.")
      : (isRateLimit
          ? "⚠️ Worm Aiva is busy, please try again shortly."
          : "Worm Aiva is temporarily unavailable. Please try again.");
    return res.status(200).json({ reply: errMsg });
  }
};

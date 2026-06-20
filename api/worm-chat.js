// api/worm-chat.js — Worm Aiva backend via OpenRouter

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
  "deepseek/deepseek-r1-0528:free",
  "deepseek/deepseek-v3-base:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "mistralai/devstral-small:free",
  "google/gemma-3-27b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  FREE_ROUTER,
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
        "Authorization" : "Bearer " + key,
        "Content-Type"  : "application/json",
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
  const key = KEYS[_kidx % KEYS.length];
  _kidx = (_kidx + 1) % KEYS.length;
  try {
    return await tryKey(key, model, messages);
  } catch (e) {
    if (e.message !== "RATELIMIT") {
      const key2 = KEYS[_kidx % KEYS.length];
      _kidx = (_kidx + 1) % KEYS.length;
      return await tryKey(key2, model, messages);
    }
    throw e;
  }
}

async function tryChain(messages) {
  let allLimit = true;
  for (const model of WORM_MODELS) {
    try {
      console.log(`[worm] trying ${model}`);
      const result = await tryModel(model, messages);
      console.log(`[worm] OK ${model}`);
      return result;
    } catch (e) {
      const msg = e.message || "";
      console.log(`[worm] ${model} failed: ${msg}`);
      if (msg !== "RATELIMIT") allLimit = false;
      // Lanjut model berikutnya — tiap model punya limit sendiri
    }
  }
  throw new Error(allLimit ? "RATELIMIT" : "ALLFAILED");
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
    const m      = err.message || "";
    const isRL   = m === "RATELIMIT";
    const errMsg = lang === "id"
      ? (isRL ? "⚠️ Worm Aiva lagi sibuk, coba lagi sebentar ya." : "Worm Aiva lagi gangguan, coba lagi sebentar ya.")
      : (isRL ? "⚠️ Worm Aiva is busy, please try again shortly." : "Worm Aiva is temporarily unavailable.");
    return res.status(200).json({ reply: errMsg });
  }
};

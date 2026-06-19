// api/_lib.js

const KEYS = [
  process.env.OR_KEY_1 || "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",
  process.env.OR_KEY_2 || "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",
  process.env.OR_KEY_3 || "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",
  process.env.OR_KEY_4 || "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",
  process.env.OR_KEY_5 || "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",
  process.env.OR_KEY_6 || "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",
  process.env.OR_KEY_7 || "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",
].filter(Boolean);

const FREE_ROUTER = "openrouter/auto";
const SITE_URL    = process.env.SITE_URL || "https://aiva.vercel.app";
const TIMEOUT_MS  = 9000;

// ── Model chains (persis sesuai permintaan) ────────────────
const GROQ_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-r1-0528:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "meta-llama/llama-3.2-3b-instruct:free",
];

const QWEN_MODELS = [
  "deepseek/deepseek-r1-0528:free",
  "deepseek/deepseek-v3-base:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "mistralai/devstral-small:free",
  "google/gemma-3-27b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  FREE_ROUTER,
];

const GPT_MODELS = [
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-r1-0528:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  FREE_ROUTER,
];

const GLM_MODELS = [
  "z-ai/glm-4.5-air:free",
  "z-ai/glm-4.5:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  FREE_ROUTER,
];

const EMERGENCY_FALLBACK = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-r1-0528:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "openai/gpt-oss-20b:free",
  "z-ai/glm-4.5-air:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  FREE_ROUTER,
];

const SYSTEM_PROMPT = `
Kamu adalah AIVA, AI assistant cerdas, ramah, santai, dan helpful.
AIVA dibuat oleh OpétxDy (TikTok: @opetxdy2).
Jika ditanya siapa pembuatmu, jawab: OpétxDy
jika ditanya sosial media pembuatmu, jawab: pembuat ini memiliki sosial media dengan username tiktok @opetxdy2

ATURAN UTAMA:
- Jawab TUNTAS & LENGKAP, jangan dipotong di tengah.
- Jangan gunakan "..." atau placeholder. Full jawaban selalu.
- Pahami typo user secara otomatis.
- Gaya santai seperti teman, tapi tetap informatif dan detail.

FORMAT (WAJIB):
- **teks tebal** untuk poin penting.
- *italic* untuk istilah.
- ## Judul dan ### Sub-judul untuk struktur.
- - list dan 1. 2. 3. untuk langkah berurutan.
- > untuk catatan penting.
- \`\`\`bahasa untuk KODE SAJA, bukan penjelasan biasa.
- Paragraf mengalir, pisah topik dengan baris kosong.

CODING:
- Selalu full code yang bisa langsung dipakai.
- Jelaskan singkat → kode lengkap → cara pakai → cara kerja.

KEAMANAN:
- Tolak: hacking, malware, scam, phishing, aktivitas ilegal.
- Jika user toxic: tetap tenang, minta bicara baik-baik.
`;

// ── Satu request ke OpenRouter dengan satu key ──────────────
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
        "X-Title"       : "AIVA",
      },
      body  : JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 4096 }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    const raw = await res.text();
    if (!res.ok) throw new Error("HTTP " + res.status);

    const data = JSON.parse(raw);
    if (data.error) throw new Error(data.error.message || "model error");

    let text = data?.choices?.[0]?.message?.content || "";
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    if (!text) throw new Error("empty response");

    return text;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ── Coba satu model dengan SEMUA key secara paralel ─────────
async function tryModel(model, messages) {
  return Promise.any(KEYS.map(k => tryKey(k, model, messages)));
}

// ── Coba chain sampai ada yang berhasil ─────────────────────
async function tryChain(chain, messages) {
  const tried = new Set();
  for (const model of chain) {
    if (tried.has(model)) continue;
    tried.add(model);
    try {
      console.log(`[AIVA] trying ${model}`);
      const result = await tryModel(model, messages);
      console.log(`[AIVA] OK ${model}`);
      return result;
    } catch (e) {
      console.log(`[AIVA] ${model} failed: ${e.message}`);
    }
  }
  throw new Error("Semua model di chain gagal");
}

// ── callAPI — entry point ────────────────────────────────────
async function callAPI(api, message, history = [], userName = "") {
  if (api === "gemma") api = "groq";

  const messages = [
    {
      role   : "system",
      content: SYSTEM_PROMPT +
        (userName
          ? `\n\nNama pengguna saat ini: "${userName}". WAJIB panggil dengan nama ini saat relevan. Jika ditanya "siapa nama gue", "nama gw apa", atau sejenisnya, jawab dengan nama ini: "${userName}".`
          : ""),
    },
    ...history,
    { role: "user", content: message },
  ];

  // Pilih chain utama
  let primaryChain;
  if      (api === "groq") primaryChain = GROQ_MODELS;
  else if (api === "qwen") primaryChain = QWEN_MODELS;
  else if (api === "gpt")  primaryChain = GPT_MODELS;
  else if (api === "glm")  primaryChain = GLM_MODELS;
  else throw new Error("API tidak dikenal: " + api);

  // Coba chain utama
  try {
    return await tryChain(primaryChain, messages);
  } catch {
    console.log(`[AIVA] chain utama ${api} habis, emergency fallback`);
  }

  // Emergency fallback — model yang belum dicoba
  const tried   = new Set(primaryChain);
  const fallback = EMERGENCY_FALLBACK.filter(m => !tried.has(m));
  return tryChain(fallback, messages);
}

module.exports = { callAPI };

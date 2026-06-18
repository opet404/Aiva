// api/_lib.js

const KEYS = [
  process.env.OR_KEY_1,
  process.env.OR_KEY_2,
  process.env.OR_KEY_3,
  process.env.OR_KEY_4,
  process.env.OR_KEY_5,
  process.env.OR_KEY_6,
  process.env.OR_KEY_7,
].filter(Boolean);

// Fallback ke hardcode kalau env kosong (untuk debug)
const HARDCODED_KEYS = [
  "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",
  "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",
  "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",
  "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",
  "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",
  "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",
  "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",
];

const ALL_KEYS = KEYS.length > 0 ? KEYS : HARDCODED_KEYS;

console.log(`[AIVA] Keys loaded: ${KEYS.length} from env, ${ALL_KEYS.length} total`);

const FREE_ROUTER = "openrouter/free";
const SITE_URL    = process.env.SITE_URL || "https://aiva-beta.vercel.app";
const TIMEOUT_MS  = 9000;

// Model IDs dari screenshot OpenRouter user (verified exist Juni 2025)
const GROQ_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "nvidia/nemotron-3-super:free",
  "openai/gpt-oss-120b:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "google/gemma-4-31b:free",
  "meta-llama/llama-3.2-3b-instruct:free",
  FREE_ROUTER,
];

const QWEN_MODELS = [
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "qwen/qwen3-coder-480b-a35b-instruct:free",
  "nvidia/nemotron-3-super:free",
  "openai/gpt-oss-120b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-4-31b:free",
  FREE_ROUTER,
];

const GPT_MODELS = [
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
  "nvidia/nemotron-3-super:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "google/gemma-4-31b:free",
  FREE_ROUTER,
];

const GLM_MODELS = [
  "google/gemma-4-31b:free",
  "nvidia/nemotron-3-super:free",
  "openai/gpt-oss-120b:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  FREE_ROUTER,
];

const EMERGENCY_FALLBACK = [
  FREE_ROUTER,
  "nvidia/nemotron-3-super:free",
  "openai/gpt-oss-20b:free",
  "meta-llama/llama-3.2-3b-instruct:free",
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
    if (!res.ok) {
      let errMsg = "HTTP " + res.status;
      try { errMsg = JSON.parse(raw)?.error?.message || errMsg; } catch {}
      throw new Error(errMsg);
    }

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

async function tryModel(model, messages) {
  return Promise.any(ALL_KEYS.map(k => tryKey(k, model, messages)));
}

async function tryChain(chain, messages) {
  const tried = new Set();
  const errors = [];
  for (const model of chain) {
    if (tried.has(model)) continue;
    tried.add(model);
    try {
      console.log(`[AIVA] trying ${model}`);
      const result = await tryModel(model, messages);
      console.log(`[AIVA] OK ${model}`);
      return result;
    } catch (e) {
      const errDetail = e?.errors?.map(x => x?.message || String(x)).join(" | ") || e.message;
      console.log(`[AIVA] ${model} FAILED: ${errDetail}`);
      errors.push(`${model}: ${errDetail}`);
    }
  }
  throw new Error("Semua model di chain gagal. Details: " + errors.join(" || "));
}

async function callAPI(api, message, history = [], userName = "") {
  if (api === "gemma") api = "glm";

  const messages = [
    {
      role   : "system",
      content: SYSTEM_PROMPT +
        (userName
          ? `\n\nNama pengguna saat ini: "${userName}". WAJIB panggil dengan nama ini saat relevan.`
          : ""),
    },
    ...history,
    { role: "user", content: message },
  ];

  let primaryChain;
  if      (api === "groq") primaryChain = GROQ_MODELS;
  else if (api === "qwen") primaryChain = QWEN_MODELS;
  else if (api === "gpt")  primaryChain = GPT_MODELS;
  else if (api === "glm")  primaryChain = GLM_MODELS;
  else throw new Error("API tidak dikenal: " + api);

  try {
    return await tryChain(primaryChain, messages);
  } catch (e) {
    console.log(`[AIVA] chain utama ${api} habis: ${e.message}`);
  }

  const tried    = new Set(primaryChain);
  const fallback = EMERGENCY_FALLBACK.filter(m => !tried.has(m));
  return tryChain(fallback, messages);
}

module.exports = { callAPI };

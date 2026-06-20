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

// ── Model chains ────────────────────────────────────────────
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

// ── Round-robin key index ────────────────────────────────────
let _kidx = 0;

// ── Request ke 1 key + 1 model ──────────────────────────────
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
        "X-Title"       : "AIVA",
      },
      body  : JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 4096 }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    const raw = await res.text();

    if (res.status === 429) throw new Error("RATELIMIT");
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

// ── Coba model dengan 1 key dulu, kalau 429 langsung skip model ─
// (7 key dari 1 akun = rate limit sama → tidak perlu coba semua key)
async function tryModel(model, messages) {
  const key = KEYS[_kidx % KEYS.length];
  _kidx = (_kidx + 1) % KEYS.length;
  try {
    return await tryKey(key, model, messages);
  } catch (e) {
    // Kalau bukan 429, coba 1 key lagi (beda index) untuk antisipasi key expired
    if (e.message !== "RATELIMIT") {
      const key2 = KEYS[_kidx % KEYS.length];
      _kidx = (_kidx + 1) % KEYS.length;
      return await tryKey(key2, model, messages);
    }
    throw e; // 429 → langsung lempar, lanjut ke model lain
  }
}

// ── Coba tiap model satu per satu — 429 BUKAN alasan berhenti ──
// Tiap model di OpenRouter punya pool rate limit SENDIRI.
// Kalau llama-3.3 kena 429, deepseek bisa jadi masih free.
async function tryChain(chain, messages) {
  const tried    = new Set();
  let   allLimit = true; // tracking: apakah SEMUA model 429?

  for (const model of chain) {
    if (tried.has(model)) continue;
    tried.add(model);
    try {
      console.log(`[AIVA] trying ${model}`);
      const result = await tryModel(model, messages);
      console.log(`[AIVA] OK ${model}`);
      return result;
    } catch (e) {
      const msg = e.message || "";
      console.log(`[AIVA] ${model} failed: ${msg}`);
      if (msg !== "RATELIMIT") allLimit = false;
      // Lanjut ke model berikutnya — APAPUN errornya termasuk 429
    }
  }

  // Semua model sudah dicoba dan gagal
  throw new Error(allLimit ? "RATELIMIT" : "ALLFAILED");
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

  let primaryChain;
  if      (api === "groq") primaryChain = GROQ_MODELS;
  else if (api === "qwen") primaryChain = QWEN_MODELS;
  else if (api === "gpt")  primaryChain = GPT_MODELS;
  else if (api === "glm")  primaryChain = GLM_MODELS;
  else throw new Error("API tidak dikenal: " + api);

  try {
    return await tryChain(primaryChain, messages);
  } catch (e) {
    // Chain utama habis — coba emergency fallback dengan model yang belum dicoba
    const tried    = new Set(primaryChain);
    const fallback = EMERGENCY_FALLBACK.filter(m => !tried.has(m));
    if (fallback.length === 0) throw e;
    console.log(`[AIVA] chain utama ${api} habis, emergency fallback (${fallback.length} models)`);
    return tryChain(fallback, messages);
  }
}

module.exports = { callAPI };

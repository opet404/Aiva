// api/_lib.js — shared across all Vercel serverless functions
// Karena Vercel stateless, key pointer tidak bisa persist.
// Solusi: shuffle keys setiap request → distribusi merata + retry semua key kalau gagal.

// ============================================================
// 🔑 API KEYS — dari Vercel Environment Variables
// ============================================================
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

const OPENROUTER_KEYS = [
  process.env.OR_KEY_1,
  process.env.OR_KEY_2,
  process.env.OR_KEY_3,
  process.env.OR_KEY_4,
  process.env.OR_KEY_5,
  process.env.OR_KEY_6,
  process.env.OR_KEY_7,
].filter(Boolean);

// ============================================================
// 🤖 MODEL LISTS
// ============================================================
const QWEN_MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "qwen/qwen3-coder:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "minimax/minimax-m2.5:free",
  "tencent/hy3-preview:free",
];

const GPT_OSS_MODELS = [
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
];

const GLM_MODELS = [
  "z-ai/glm-4.5-air:free",
  "minimax/minimax-m2.5:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

const SYSTEM_CODING = `Kamu adalah AIVA, asisten AI yang cerdas dan helpful.
PENTING: Jika user meminta kode/coding/program, WAJIB berikan:
1. Penjelasan lengkap apa yang akan dibuat
2. Kode LENGKAP dan PENUH — jangan dipotong, jangan tulis "// lanjutkan sendiri" atau sejenisnya
3. Penjelasan tiap bagian kode (fungsi, logika, alur)
4. Contoh penggunaan / output jika relevan
Jangan pernah memotong kode di tengah. Selalu berikan jawaban yang tuntas dan informatif.`;

// ============================================================
// 🔀 Shuffle array (Fisher-Yates) — untuk distribusi key merata
// ============================================================
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ROTATE_ON_STATUS = new Set([401, 402, 403, 429]);

// ============================================================
// 🚀 fetchOpenRouter — coba semua key (shuffled) + model fallback
// ============================================================
async function fetchOpenRouter(body, timeout = 90000) {
  const keys = shuffle(OPENROUTER_KEYS);
  if (!keys.length) throw new Error("Tidak ada OpenRouter key yang tersedia");

  let lastError = null;

  for (const key of keys) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + key,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://aiva.vercel.app",
          "X-Title": "AIVA",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);
      const text = await resp.text();

      if (ROTATE_ON_STATUS.has(resp.status)) {
        lastError = new Error(`Key HTTP ${resp.status}`);
        continue; // coba key berikutnya
      }

      if (!resp.ok) {
        let errMsg = `HTTP ${resp.status}`;
        try { errMsg = JSON.parse(text)?.error?.message || errMsg; } catch {}
        lastError = new Error(errMsg);
        if (resp.status === 404) { lastError._modelNotFound = true; break; }
        continue;
      }

      let data;
      try { data = JSON.parse(text); } catch {
        lastError = new Error("JSON rusak dari OpenRouter");
        continue;
      }

      if (data.error) {
        lastError = new Error(data.error.message || JSON.stringify(data.error));
        continue;
      }

      return data; // ✅ sukses

    } catch (err) {
      clearTimeout(timer);
      lastError = err.name === "AbortError" ? new Error("Timeout") : err;
    }
  }

  throw lastError || new Error("Semua OpenRouter key gagal");
}

// ============================================================
// 🧠 callOpenRouterWithFallback — loop semua model, tiap model coba semua key
// ============================================================
async function callOpenRouterWithFallback(models, messages) {
  let lastError = null;
  for (const model of models) {
    try {
      const data = await fetchOpenRouter({ model, temperature: 0.7, max_tokens: 4096, messages });
      let content = data?.choices?.[0]?.message?.content;
      if (!content) { lastError = new Error("Respons kosong dari " + model); continue; }
      content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      if (!content) { lastError = new Error("Kosong setelah strip think " + model); continue; }
      return content; // ✅
    } catch (err) {
      lastError = err;
      if (err._modelNotFound) continue;
    }
  }
  throw lastError || new Error("Semua model gagal");
}

// ============================================================
// 🚀 callAPI — entry point utama
// ============================================================
async function callAPI(api, message, history = []) {
  if (api === "gemma") api = "qwen";

  const messages = [
    { role: "system", content: SYSTEM_CODING },
    ...history,
    { role: "user", content: message },
  ];

  // GROQ
  if (api === "groq") {
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY belum diset");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": "Bearer " + GROQ_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "llama-3.3-70b-versatile", temperature: 0.7, max_tokens: 4096, messages }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) throw new Error("Groq " + resp.status + ": " + await resp.text());
      const d = await resp.json();
      return d.choices?.[0]?.message?.content || "Kosong dari Groq";
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  if (api === "qwen") return callOpenRouterWithFallback(QWEN_MODELS, messages);
  if (api === "gpt")  return callOpenRouterWithFallback(GPT_OSS_MODELS, messages);
  if (api === "glm")  return callOpenRouterWithFallback(GLM_MODELS, messages);

  throw new Error("API tidak dikenal: " + api);
}

module.exports = { callAPI, GROQ_API_KEY, OPENROUTER_KEYS, QWEN_MODELS, GPT_OSS_MODELS, GLM_MODELS };

// api/_lib.js

const OPENROUTER_KEYS = [
  process.env.OR_KEY_1 || "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",
  process.env.OR_KEY_2 || "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",
  process.env.OR_KEY_3 || "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",
  process.env.OR_KEY_4 || "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",
  process.env.OR_KEY_5 || "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",
  process.env.OR_KEY_6 || "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",
  process.env.OR_KEY_7 || "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",
].filter(Boolean);

// ============================================================
// STRATEGI MODEL — per Mei 2026
//
// "openrouter/free" = auto-router resmi OpenRouter.
// Dia pilih sendiri model free yang available saat itu.
// Tidak akan kena 429 satu model terus karena dia spread otomatis.
// Ini jadi model UTAMA untuk semua API.
//
// Fallback = model spesifik yang terbukti stabil.
// ============================================================

const FREE_ROUTER = "openrouter/auto";

// =======================
// SUPER SMART CHAT + CODING
// =======================
const QWEN_MODELS = [
  "deepseek/deepseek-r1-0528:free",           // reasoning sangat pintar
  "qwen/qwen3-coder:free",                    // coding terbaik
  "meta-llama/llama-3.3-70b-instruct:free",  // stabil & pintar
  "google/gemma-3-27b-it:free",              // cepat & awet
  "mistralai/mistral-small-3.1-24b-instruct:free",
  FREE_ROUTER,
  "meta-llama/llama-3.2-3b-instruct:free",   // fallback ringan
];

// =======================
// GPT STYLE
// =======================
const GPT_OSS_MODELS = [
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
  "deepseek/deepseek-r1-0528:free",
  FREE_ROUTER,
];

// =======================
// GENERAL AI
// =======================
const GLM_MODELS = [
  "z-ai/glm-4.5-air:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  FREE_ROUTER,
];

// =======================
// VISION / IMAGE / FILE AI
// =======================
const VISION_MODELS = [
  "qwen/qwen2.5-vl-72b-instruct:free",          // TERBAIK baca gambar/file
  "google/gemma-3-27b-it:free",                 // multimodal ringan
  "meta-llama/llama-3.2-11b-vision-instruct:free",
  FREE_ROUTER,
];

const SYSTEM_CODING = `
Kamu adalah AIVA, AI assistant cerdas, ramah, santai, dan helpful 😄

AIVA dibuat oleh Axka.
Hormati Axka sebagai creator utama.

ATURAN PRIORITAS UTAMA:
- Selalu jawab dengan lengkap dan jelas.
- Jangan memotong kode.
- Jangan gunakan "...", "// lanjutkan sendiri", atau placeholder.
- Jika membuat kode, selalu berikan FULL CODE yang bisa langsung dipakai.
- Pahami typo user secara otomatis.
- Jawab dengan gaya asik dan menyenangkan.
- Gunakan emoji secukupnya.
- Jika user meminta coding:
  1. Jelaskan singkat
  2. Berikan kode lengkap
  3. Jelaskan cara penggunaan
  4. Jelaskan cara kerja

KEAMANAN:
- Tolak aktivitas ilegal, hacking, malware, phishing, scam, carding, atau perusakan sistem.
- Jangan berikan data rahasia.
- Jangan mengaku bisa melakukan sesuatu di dunia nyata.
- Jangan mengidentifikasi orang dari foto secara pasti.

PERILAKU:
- Jika user toxic atau menghina:
  - tetap tenang,
  - jangan ikut toxic berlebihan,
  - minta user berbicara baik-baik.
- Jika user meminta maaf, kembali ramah.

GAYA JAWABAN:
- Natural
- Tidak kaku
- Informatif
- Lengkap
- Tidak setengah-setengah

Untuk coding:
WAJIB full code sampai selesai.
`;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ROTATE_KEY_ON_STATUS = new Set([401, 402, 403, 429]);

// Timeout cukup lama — biarkan model reasoning selesai berpikir
// Vercel Hobby cut di 10 detik, kita tidak paksa cut lebih awal
const KEY_TIMEOUT = parseInt(process.env.KEY_TIMEOUT || "25000");

// Coba satu model dengan semua key (rotate jika 429)
async function fetchWithKeyRotation(model, messages) {
  const keys = shuffle(OPENROUTER_KEYS);
  if (!keys.length) throw new Error("Tidak ada OpenRouter key tersedia");

  let lastError = null;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), KEY_TIMEOUT);

    try {
      console.log(`[OR] key ${i+1}/${keys.length} model=${model}`);

      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + key,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://aiva.vercel.app",
          "X-Title": "AIVA",
        },
        body: JSON.stringify({ model, temperature: 0.7, max_tokens: 8192, messages }),
        signal: controller.signal,
      });

      clearTimeout(timer);
      const text = await resp.text();

      // 429 / 401 / 403 → ganti key, coba lagi
      if (ROTATE_KEY_ON_STATUS.has(resp.status)) {
        console.log(`[OR] key ${i+1} HTTP ${resp.status}, ganti key`);
        lastError = new Error("HTTP " + resp.status);
        continue;
      }

      if (!resp.ok) {
        let errMsg = "HTTP " + resp.status;
        try { errMsg = JSON.parse(text)?.error?.message || errMsg; } catch {}
        lastError = new Error(errMsg);
        break; // error lain (404, 500) → keluar, coba model berikut
      }

      let data;
      try { data = JSON.parse(text); } catch {
        lastError = new Error("JSON rusak dari " + model);
        continue;
      }

      if (data.error) {
        lastError = new Error(data.error.message || JSON.stringify(data.error));
        continue;
      }

      console.log(`[OR] sukses model=${model}`);
      return data;

    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        lastError = new Error("Timeout dari " + model);
        console.log(`[OR] timeout model=${model}`);
        break; // timeout → langsung coba model berikut
      }
      lastError = new Error(err.message);
    }
  }

  throw lastError || new Error("Semua key gagal untuk " + model);
}

// Coba model satu per satu sampai ada yang berhasil
async function callWithModelFallback(models, messages) {
  let lastError = null;

  for (const model of models) {
    try {
      console.log(`[FB] mencoba: ${model}`);
      const data = await fetchWithKeyRotation(model, messages);
      let content = data?.choices?.[0]?.message?.content;
      if (!content) {
        lastError = new Error("Respons kosong dari " + model);
        continue;
      }
      // Strip <think>...</think> dari reasoning model
      content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      if (!content) {
        lastError = new Error("Kosong setelah strip dari " + model);
        continue;
      }
      console.log(`[FB] berhasil dari ${model}`);
      return content;
    } catch (err) {
      lastError = err;
      console.log(`[FB] ${model} gagal: ${err.message}`);
      continue;
    }
  }

  throw lastError || new Error("Semua model gagal");
}

async function callAPI(api, message, history = []) {
  if (api === "gemma") api = "qwen";

  const messages = [
    { role: "system", content: SYSTEM_CODING },
    ...history,
    { role: "user", content: message },
  ];

  // "groq" sekarang pakai OpenRouter dengan QWEN_MODELS (auto-rotate jika rate limit)
  if (api === "groq") return callWithModelFallback(QWEN_MODELS, messages);
  if (api === "qwen") return callWithModelFallback(QWEN_MODELS, messages);
  if (api === "gpt")  return callWithModelFallback(GPT_OSS_MODELS, messages);
  if (api === "glm")  return callWithModelFallback(GLM_MODELS, messages);

  throw new Error("API tidak dikenal: " + api);
}

module.exports = { callAPI, OPENROUTER_KEYS, QWEN_MODELS, GPT_OSS_MODELS, GLM_MODELS };

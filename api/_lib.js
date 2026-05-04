// api/_lib.js

const GROQ_API_KEY =
  process.env.GROQ_API_KEY ||
  "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";

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
// DAFTAR MODEL — semua dicek valid per Mei 2026
// Sumber: https://openrouter.ai/models (free tier)
// ============================================================

// AIVA / Qwen — model untuk coding & general
// Diurutkan: paling stabil & cepat duluan
const QWEN_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",      // ✅ stabil, cepat, 66K ctx
  "qwen/qwen3-coder:free",                        // ✅ terbaik untuk coding, 262K ctx
  "qwen/qwen3-next-80b-a3b-instruct:free",        // ✅ reasoning bagus, 262K ctx
  "nvidia/nemotron-3-super-120b-a12b:free",       // ✅ kuat, 262K ctx
  "google/gemma-4-31b-it:free",                   // ✅ multimodal, 262K ctx
  "minimax/minimax-m2.5:free",                    // ✅ 197K ctx
  "nousresearch/hermes-3-llama-3.1-405b:free",   // ✅ 131K ctx
  "meta-llama/llama-3.2-3b-instruct:free",        // ✅ kecil tapi stabil, fallback terakhir
];

// GPT-OSS — model OpenAI open source
const GPT_OSS_MODELS = [
  "openai/gpt-oss-20b:free",                     // ✅ 131K ctx, cepat
  "openai/gpt-oss-120b:free",                    // ✅ 131K ctx, lebih pintar
  "meta-llama/llama-3.3-70b-instruct:free",      // ✅ fallback reliable
  "nvidia/nemotron-3-super-120b-a12b:free",      // ✅ fallback ke-2
];

// GLM — Z.AI GLM model (BUKAN mistral, itu sudah dihapus)
const GLM_MODELS = [
  "z-ai/glm-4.5-air:free",                       // ✅ GLM resmi, 131K ctx
  "meta-llama/llama-3.3-70b-instruct:free",      // ✅ fallback cepat
  "google/gemma-3-27b-it:free",                  // ✅ 131K ctx
  "nvidia/nemotron-nano-9b-v2:free",             // ✅ 128K ctx, ringan
  "google/gemma-3-12b-it:free",                  // ✅ 33K ctx, fallback terakhir
];

const SYSTEM_CODING = `Kamu adalah AIVA, asisten AI yang cerdas dan helpful.
PENTING: Jika user meminta kode/coding/program, WAJIB berikan:
1. Penjelasan lengkap apa yang akan dibuat
2. Kode LENGKAP dan PENUH — jangan dipotong, jangan tulis "// lanjutkan sendiri" atau sejenisnya
3. Penjelasan tiap bagian kode (fungsi, logika, alur)
4. Contoh penggunaan / output jika relevan
Jangan pernah memotong kode di tengah. Selalu berikan jawaban yang tuntas dan informatif.`;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Status yang perlu ganti KEY (bukan ganti model)
const ROTATE_KEY_ON_STATUS = new Set([401, 402, 403, 429]);

// Timeout per API call — cukup lama supaya model reasoning bisa selesai berpikir
// Vercel Hobby max 10 detik, tapi kita kasih 25 detik supaya ada buffer
// (Vercel akan cut sendiri jika sudah 10 detik, bukan error dari kita)
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
      console.log(`[OR] key ${i+1}/${keys.length} model=${model} key=...${key.slice(-6)}`);

      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + key,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://aiva.vercel.app",
          "X-Title": "AIVA",
        },
        body: JSON.stringify({ model, temperature: 0.7, max_tokens: 2048, messages }),
        signal: controller.signal,
      });

      clearTimeout(timer);
      const text = await resp.text();

      // 429/401/403 → ganti key, coba lagi
      if (ROTATE_KEY_ON_STATUS.has(resp.status)) {
        console.log(`[OR] key ${i+1} status ${resp.status}, ganti key`);
        lastError = new Error("HTTP " + resp.status);
        continue;
      }

      if (!resp.ok) {
        let errMsg = "HTTP " + resp.status;
        try { errMsg = JSON.parse(text)?.error?.message || errMsg; } catch {}
        lastError = new Error(errMsg);
        lastError._status = resp.status;
        break; // 404 / 500 → jangan rotate key, langsung keluar
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
        // Timeout → jangan coba key lain (model ini memang lambat), langsung fallback model berikut
        lastError = new Error("Timeout " + KEY_TIMEOUT + "ms dari " + model);
        console.log(`[OR] timeout model=${model}`);
        break;
      }
      lastError = new Error(err.message);
      console.log(`[OR] err: ${err.message}`);
    }
  }

  throw lastError || new Error("Semua key gagal untuk " + model);
}

// Coba model satu per satu, dengan key rotation di tiap model
async function callWithModelFallback(models, messages) {
  let lastError = null;

  for (const model of models) {
    try {
      console.log(`[FB] mencoba model: ${model}`);
      const data = await fetchWithKeyRotation(model, messages);
      let content = data?.choices?.[0]?.message?.content;
      if (!content) {
        lastError = new Error("Respons kosong dari " + model);
        console.log(`[FB] kosong dari ${model}, coba model berikut`);
        continue;
      }
      // Strip <think>...</think> dari reasoning model (Qwen3, Nemotron, dll)
      content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      if (!content) {
        lastError = new Error("Kosong setelah strip thinking dari " + model);
        continue;
      }
      console.log(`[FB] berhasil dari ${model}`);
      return content;
    } catch (err) {
      lastError = err;
      console.log(`[FB] model ${model} gagal: ${err.message}, coba model berikut`);
      continue; // selalu lanjut ke model berikut
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

  // Groq — endpoint sendiri, bukan OpenRouter
  if (api === "groq") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), KEY_TIMEOUT);
    try {
      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + GROQ_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.7,
          max_tokens: 2048,
          messages,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error("Groq HTTP " + resp.status + ": " + errText);
      }
      const d = await resp.json();
      return d.choices?.[0]?.message?.content || "Respons kosong dari Groq";
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  if (api === "qwen") return callWithModelFallback(QWEN_MODELS, messages);
  if (api === "gpt")  return callWithModelFallback(GPT_OSS_MODELS, messages);
  if (api === "glm")  return callWithModelFallback(GLM_MODELS, messages);

  throw new Error("API tidak dikenal: " + api);
}

module.exports = { callAPI, GROQ_API_KEY, OPENROUTER_KEYS, QWEN_MODELS, GPT_OSS_MODELS, GLM_MODELS };

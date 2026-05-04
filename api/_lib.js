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

// Model diurutkan dari yang paling ringan/cepat dulu
// supaya dalam timeout 10 detik Vercel Hobby masih bisa dapet response
const QWEN_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",   // paling cepat
  "qwen/qwen3-coder:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "minimax/minimax-m2.5:free",
  "tencent/hy3-preview:free",
];

const GPT_OSS_MODELS = [
  "openai/gpt-oss-20b:free",    // lebih kecil = lebih cepat
  "openai/gpt-oss-120b:free",
];

const GLM_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",   // paling cepat sebagai fallback pertama
  "z-ai/glm-4.5-air:free",
  "minimax/minimax-m2.5:free",
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

const ROTATE_ON_STATUS = new Set([401, 402, 403, 429]);

// Timeout per-key: 8 detik (aman untuk Vercel Hobby 10 detik limit)
// Kalau pakai Vercel Pro, bisa naikkan ke 55000
const KEY_TIMEOUT = parseInt(process.env.KEY_TIMEOUT || "7000");

async function fetchOpenRouter(body) {
  const keys = shuffle(OPENROUTER_KEYS);
  if (!keys.length) throw new Error("Tidak ada OpenRouter key tersedia");

  let lastError = null;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), KEY_TIMEOUT);

    try {
      console.log(`[OR] ${i+1}/${keys.length} model=${body.model} key=...${key.slice(-6)}`);

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
        lastError = new Error("HTTP " + resp.status);
        continue;
      }

      if (!resp.ok) {
        let errMsg = "HTTP " + resp.status;
        try { errMsg = JSON.parse(text)?.error?.message || errMsg; } catch {}
        lastError = new Error(errMsg);
        if (resp.status === 404) { lastError._modelNotFound = true; break; }
        continue;
      }

      let data;
      try { data = JSON.parse(text); } catch {
        lastError = new Error("JSON rusak");
        continue;
      }

      if (data.error) {
        lastError = new Error(data.error.message || JSON.stringify(data.error));
        continue;
      }

      console.log(`[OR] sukses`);
      return data;

    } catch (err) {
      clearTimeout(timer);
      lastError = new Error(err.name === "AbortError" ? "Timeout " + KEY_TIMEOUT + "ms" : err.message);
      console.log(`[OR] err: ${lastError.message}`);
    }
  }

  throw lastError || new Error("Semua key gagal");
}

async function callWithModelFallback(models, messages) {
  // Di Vercel Hobby (limit 10 detik), JANGAN loop banyak model — langsung pakai 1 model saja
  // Pilih random dari 2 model pertama supaya ada variasi tapi tetap cepat
  const fastModels = models.slice(0, 2);
  const model = fastModels[Math.floor(Math.random() * fastModels.length)];
  
  try {
    console.log(`[FB] using: ${model}`);
    const data = await fetchOpenRouter({ model, temperature: 0.7, max_tokens: 1500, messages });
    let content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Kosong dari " + model);
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    if (!content) throw new Error("Kosong setelah strip " + model);
    return content;
  } catch (err) {
    // Fallback ke model ke-3 kalau ada
    if (models[2] && !err._modelNotFound) {
      try {
        console.log(`[FB] fallback: ${models[2]}`);
        const data2 = await fetchOpenRouter({ model: models[2], temperature: 0.7, max_tokens: 1500, messages });
        let content = data2?.choices?.[0]?.message?.content;
        if (content) {
          content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
          if (content) return content;
        }
      } catch (_) {}
    }
    throw err;
  }
}

async function callAPI(api, message, history = []) {
  if (api === "gemma") api = "qwen";

  const messages = [
    { role: "system", content: SYSTEM_CODING },
    ...history,
    { role: "user", content: message },
  ];

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
          max_tokens: 1500,
          messages,
        }),
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

  if (api === "qwen") return callWithModelFallback(QWEN_MODELS, messages);
  if (api === "gpt")  return callWithModelFallback(GPT_OSS_MODELS, messages);
  if (api === "glm")  return callWithModelFallback(GLM_MODELS, messages);

  throw new Error("API tidak dikenal: " + api);
}

module.exports = { callAPI, GROQ_API_KEY, OPENROUTER_KEYS, QWEN_MODELS, GPT_OSS_MODELS, GLM_MODELS };

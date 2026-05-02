const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");
const path    = require("path");

const app  = express();
const PORT = 3000;

// ============================================================
// 🔑 API KEYS
// ============================================================
const GROQ_API_KEY = "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";

// 7 OpenRouter keys — otomatis fallback key 1 → 7
const OPENROUTER_KEYS = [
  "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",
  "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",
  "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",
  "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",
  "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",
  "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",
  "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",
];

// ============================================================
// 🤖 MODEL LISTS (semua FREE, confirmed aktif Mei 2026)
// ============================================================
const QWEN_MODELS = [
  "qwen/qwen3-coder:free",                  // terkuat untuk coding, 262K context
  "qwen/qwen3-next-80b-a3b-instruct:free",  // general purpose, 262K context
];

const GPT_OSS_MODELS = [
  "openai/gpt-oss-120b:free",  // OpenAI 117B MoE, 131K context
  "openai/gpt-oss-20b:free",   // OpenAI 21B fallback, 131K context
];

// ============================================================
// 🔁 OPENROUTER FETCH WITH KEY ROTATION
// Rotasi otomatis kalau: 401, 402, 403, 429, timeout, error body
// ============================================================
const ROTATE_ON_STATUS = new Set([401, 402, 403, 429]);

async function fetchOpenRouter(body, timeout = 90000) {
  let lastError = null;

  for (let i = 0; i < OPENROUTER_KEYS.length; i++) {
    const key = OPENROUTER_KEYS[i];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      console.log(`🔑 Mencoba OpenRouter key ${i + 1}/${OPENROUTER_KEYS.length} — model: ${body.model}`);

      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + key,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:" + PORT,
          "X-Title": "AIVA",
          "User-Agent": "AIVA/1.0"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timer);
      const text = await resp.text();

      if (ROTATE_ON_STATUS.has(resp.status)) {
        console.log(`⚠️  Key ${i + 1} ditolak (HTTP ${resp.status}) → pindah key berikutnya`);
        lastError = new Error(`Key ${i + 1} HTTP ${resp.status}`);
        continue;
      }

      if (!resp.ok) {
        console.log(`❌ Key ${i + 1} error HTTP ${resp.status}`);
        lastError = new Error(`HTTP ${resp.status}`);
        continue;
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        console.log(`❌ Key ${i + 1} JSON rusak`);
        lastError = new Error("JSON rusak dari key " + (i + 1));
        continue;
      }

      if (data.error) {
        const msg = data.error.message || JSON.stringify(data.error);
        console.log(`⚠️  Key ${i + 1} API error: ${msg} → pindah key berikutnya`);
        lastError = new Error(msg);
        continue;
      }

      console.log(`✅ OpenRouter key ${i + 1} berhasil`);
      return { data, keyIndex: i + 1 };

    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        console.log(`⏱️  Key ${i + 1} timeout → pindah key berikutnya`);
        lastError = new Error("Timeout key " + (i + 1));
      } else {
        console.log(`❌ Key ${i + 1} fetch error: ${err.message}`);
        lastError = err;
      }
    }
  }

  throw lastError || new Error("Semua OpenRouter key habis / gagal semua");
}

// ============================================================
// 🧠 SESSION MEMORY
// ============================================================
const chatHistories = {};

// ============================================================
// 🧠 SYSTEM PROMPT
// ============================================================
const SYSTEM_CODING = `Kamu adalah AIVA, asisten AI yang cerdas dan helpful.
PENTING: Jika user meminta kode/coding/program, WAJIB berikan:
1. Penjelasan lengkap apa yang akan dibuat
2. Kode LENGKAP dan PENUH — jangan dipotong, jangan tulis "// lanjutkan sendiri" atau sejenisnya
3. Penjelasan tiap bagian kode (fungsi, logika, alur)
4. Contoh penggunaan / output jika relevan
Jangan pernah memotong kode di tengah. Selalu berikan jawaban yang tuntas dan informatif.`;

// ============================================================
// 🔥 FETCH WITH TIMEOUT (untuk Groq)
// ============================================================
function fetchWithTimeout(url, options, timeout = 90000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

// ============================================================
// 🚀 CALL API
// ============================================================
async function callAPI(api, message, history) {

  // ===== GROQ =====
  if (api === "groq") {
    const resp = await fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + GROQ_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.7,
          max_tokens: 4096,
          messages: [
            { role: "system", content: SYSTEM_CODING },
            ...history,
            { role: "user", content: message }
          ]
        })
      }
    );

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error("Groq " + resp.status + ": " + txt);
    }
    const d = await resp.json();
    return d.choices?.[0]?.message?.content || "Kosong dari Groq";
  }

  // ===== QWEN (free models, fallback antar model + key rotation) =====
  if (api === "qwen") {
    let lastError = null;
    for (const model of QWEN_MODELS) {
      try {
        console.log("🔥 Qwen coba model:", model);
        const { data } = await fetchOpenRouter({
          model,
          temperature: 0.6,
          max_tokens: 4096,
          messages: [
            { role: "system", content: SYSTEM_CODING },
            ...history,
            { role: "user", content: message }
          ]
        });
        // Strip <think>...</think> kalau ada (model reasoning)
        let content = data?.choices?.[0]?.message?.content;
        if (!content) { lastError = new Error("Kosong dari " + model); continue; }
        content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        if (!content) { lastError = new Error("Kosong setelah strip think dari " + model); continue; }
        console.log("✅ Qwen sukses:", model);
        return content;
      } catch (err) {
        console.log("❌ Qwen model gagal:", model, "—", err.message);
        lastError = err;
      }
    }
    throw lastError || new Error("Semua Qwen model gagal");
  }

  // ===== GPT-OSS (free models, fallback antar model + key rotation) =====
  if (api === "gpt") {
    let lastError = null;
    for (const model of GPT_OSS_MODELS) {
      try {
        console.log("🔥 GPT-OSS coba model:", model);
        const { data } = await fetchOpenRouter({
          model,
          temperature: 0.7,
          max_tokens: 4096,
          messages: [
            { role: "system", content: SYSTEM_CODING },
            ...history,
            { role: "user", content: message }
          ]
        });
        // Strip <think>...</think> kalau ada
        let content = data?.choices?.[0]?.message?.content;
        if (!content) { lastError = new Error("Kosong dari " + model); continue; }
        content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        if (!content) { lastError = new Error("Kosong setelah strip think dari " + model); continue; }
        console.log("✅ GPT-OSS sukses:", model);
        return content;
      } catch (err) {
        console.log("❌ GPT-OSS model gagal:", model, "—", err.message);
        lastError = err;
      }
    }
    throw lastError || new Error("Semua GPT-OSS model gagal");
  }

  throw new Error("API tidak dikenal: " + api);
}

// ============================================================
// Express middleware
// ============================================================
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ============================================================
// 💬 CHAT (single model)
// ============================================================
app.post("/chat", async (req, res) => {
  try {
    const { message, api = "groq", sessionId = "default" } = req.body;
    if (!message) return res.json({ reply: "Pesan kosong!" });

    if (!chatHistories[sessionId]) chatHistories[sessionId] = [];
    chatHistories[sessionId].push({ role: "user", content: message });
    chatHistories[sessionId] = chatHistories[sessionId].slice(-12);

    const reply = await callAPI(api, message, chatHistories[sessionId]);

    chatHistories[sessionId].push({ role: "assistant", content: reply });
    res.json({ reply });

  } catch (err) {
    console.error("CHAT ERROR:", err.message);
    res.json({ reply: "Server error: " + err.message });
  }
});

// ============================================================
// 🔀 MULTI CHAT (paralel semua model terpilih)
// ============================================================
app.post("/multi-chat", async (req, res) => {
  try {
    const { message, models: selectedModels } = req.body;
    if (!message) return res.json({ error: "Pesan kosong!" });

    const allModels = selectedModels && selectedModels.length >= 2
      ? selectedModels
      : ["groq", "qwen", "gpt"];

    const results = await Promise.allSettled(
      allModels.map(api => callAPI(api, message, []))
    );

    const replies = {};
    allModels.forEach((api, i) => {
      replies[api] = results[i].status === "fulfilled"
        ? results[i].value
        : `Gagal: ${results[i].reason?.message || "unknown error"}`;
    });

    res.json({ replies });

  } catch (err) {
    res.json({ error: err.message });
  }
});

// ============================================================
// 📊 STATUS
// ============================================================
app.get("/status", (req, res) => {
  const keys = OPENROUTER_KEYS.map((k, i) => ({
    nomor: i + 1,
    status: "✅ aktif",
    preview: k.slice(0, 24) + "..."
  }));
  res.json({
    groq_key: "✅ aktif",
    openrouter_keys: keys,
    total_aktif: keys.length,
    models: {
      qwen: QWEN_MODELS,
      gpt_oss: GPT_OSS_MODELS
    },
    info: "Key rotation otomatis. Free models: Qwen3 Coder + GPT-OSS 120B/20B"
  });
});

// ============================================================
// 🚀 START
// ============================================================
app.listen(PORT, () => {
  console.log(`🔥 AIVA jalan di http://localhost:${PORT}`);
  console.log(`🔑 OpenRouter keys aktif: ${OPENROUTER_KEYS.length}`);
  console.log(`🤖 Qwen models: ${QWEN_MODELS.join(", ")}`);
  console.log(`🤖 GPT-OSS models: ${GPT_OSS_MODELS.join(", ")}`);
  console.log(`📊 Cek status: http://localhost:${PORT}/status`);
});

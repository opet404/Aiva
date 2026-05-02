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

// 7 OpenRouter keys — sistem otomatis fallback urut key 1 → 7
// Kalau key 1 habis/error → otomatis pindah ke key 2, dst.
// Ganti value "GANTI_DENGAN_KEY_X_KAMU" dengan key OpenRouter kamu.
const OPENROUTER_KEYS = [
  "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",
  "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",  // Key 2
  "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",  // Key 3
  "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",  // Key 4
  "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",  // Key 5
  "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",  // Key 6
  "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",  // Key 7
];

// ============================================================
// 🔁 OPENROUTER FETCH WITH KEY ROTATION
// Otomatis pindah ke key berikutnya kalau:
//   - Rate limit (429)
//   - Unauthorized / payment required (401, 402, 403)
//   - Timeout
//   - API error di response body
// ============================================================
const ROTATE_ON_STATUS = new Set([401, 402, 403, 429]);

async function fetchOpenRouter(body, timeout = 90000) {
  let lastError = null;

  for (let i = 0; i < OPENROUTER_KEYS.length; i++) {
    const key = OPENROUTER_KEYS[i];

    // Lewati placeholder yang belum diisi
    if (key.includes("GANTI_DENGAN_KEY")) {
      console.log(`⏭️  Key ${i + 1} dilewati (belum diisi)`);
      continue;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      console.log(`🔑 Mencoba OpenRouter key ${i + 1}/${OPENROUTER_KEYS.length}`);

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

      // Status yang picu rotasi key
      if (ROTATE_ON_STATUS.has(resp.status)) {
        console.log(`⚠️  Key ${i + 1} ditolak (HTTP ${resp.status}) → pindah key berikutnya`);
        lastError = new Error(`Key ${i + 1} HTTP ${resp.status}`);
        continue;
      }

      if (!resp.ok) {
        console.log(`❌ Key ${i + 1} error HTTP ${resp.status}`);
        lastError = new Error(`Key ${i + 1} HTTP ${resp.status}`);
        continue;
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        console.log(`❌ Key ${i + 1} JSON rusak`);
        lastError = new Error("JSON rusak key " + (i + 1));
        continue;
      }

      // Error di response body → rotasi juga
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
let chatHistories = {};

// ============================================================
// 🧠 MODEL LISTS (fallback per model)
// ============================================================
const QWEN_MODELS = [
  "qwen/qwen2.5-72b-instruct",
  "qwen/qwen2.5-7b-instruct",
  "qwen/qwen3-30b-a3b"
];

const GLM_MODELS = [
  "z-ai/glm-4.5-air:free",
  "z-ai/glm-4.5-air"
];

const GPT_OSS_MODELS = [
  "microsoft/phi-4-reasoning-plus:free",
  "microsoft/phi-4:free",
  "openai/gpt-4o-mini"
];

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
// 🔥 FETCH WITH TIMEOUT (untuk Groq — pakai key sendiri)
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

  // ===== GROQ (key Groq sendiri, tidak pakai OpenRouter) =====
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

  // ===== QWEN — model fallback + key rotation =====
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
        const content = data?.choices?.[0]?.message?.content;
        if (!content) { lastError = new Error("Kosong dari " + model); continue; }
        console.log("✅ Qwen sukses:", model);
        return content;
      } catch (err) {
        console.log("❌ Qwen model gagal:", model, "—", err.message);
        lastError = err;
      }
    }
    throw lastError || new Error("Semua Qwen model gagal");
  }

  // ===== GLM — model fallback + key rotation =====
  if (api === "glm") {
    let lastError = null;
    for (const model of GLM_MODELS) {
      try {
        console.log("🔥 GLM coba model:", model);
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
        let content = data?.choices?.[0]?.message?.content;
        if (!content) { lastError = new Error("Kosong dari " + model); continue; }
        // Strip <think>...</think>
        content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        if (!content) { lastError = new Error("Kosong setelah strip think dari " + model); continue; }
        console.log("✅ GLM sukses:", model);
        return content;
      } catch (err) {
        console.log("❌ GLM model gagal:", model, "—", err.message);
        lastError = err;
      }
    }
    throw lastError || new Error("Semua GLM model gagal");
  }

  // ===== GPT-OSS 20B — model fallback + key rotation =====
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
        const content = data?.choices?.[0]?.message?.content;
        if (!content) { lastError = new Error("Kosong dari " + model); continue; }
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
      : ["groq", "qwen", "glm", "gpt"];

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
// 📊 STATUS — cek jumlah key aktif (buka /status di browser)
// ============================================================
app.get("/status", (req, res) => {
  const keys = OPENROUTER_KEYS.map((k, i) => ({
    nomor: i + 1,
    status: k.includes("GANTI_DENGAN_KEY") ? "❌ belum diisi" : "✅ aktif",
    preview: k.includes("GANTI_DENGAN_KEY") ? "(placeholder)" : k.slice(0, 24) + "..."
  }));
  res.json({
    groq_key: "✅ aktif",
    openrouter_keys: keys,
    total_aktif: keys.filter(k => k.status.includes("aktif")).length,
    total_keys: keys.length,
    info: "Sistem akan fallback otomatis ke key berikutnya jika key aktif habis/error"
  });
});

// ============================================================
// 🚀 START
// ============================================================
app.listen(PORT, () => {
  const activeKeys = OPENROUTER_KEYS.filter(k => !k.includes("GANTI_DENGAN_KEY")).length;
  console.log(`🔥 AIVA jalan di http://localhost:${PORT}`);
  console.log(`🔑 OpenRouter keys aktif: ${activeKeys}/${OPENROUTER_KEYS.length}`);
  if (activeKeys < OPENROUTER_KEYS.length) {
    console.log(`⚠️  ${OPENROUTER_KEYS.length - activeKeys} key belum diisi — isi di bagian OPENROUTER_KEYS`);
  }
  console.log(`📊 Cek status: http://localhost:${PORT}/status`);
});

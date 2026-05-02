const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");
const path    = require("path");

const app  = express();
const PORT = 3000;

// 🔑 API KEY
const GROQ_API_KEY       = "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";
const OPENROUTER_API_KEY = "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";

// 🧠 SESSION MEMORY
let chatHistories = {};

// 🧠 MODEL QWEN (STABIL)
const QWEN_MODELS = [
  "qwen/qwen2.5-72b-instruct",
  "qwen/qwen2.5-7b-instruct",
  "qwen/qwen3-30b-a3b"
];

// 🧠 MODEL GLM (z.ai - Free via OpenRouter) — pakai titik bukan dash!
const GLM_MODELS = [
  "z-ai/glm-4.5-air:free",
  "z-ai/glm-4.5-air"
];

// 🧠 SYSTEM PROMPT — full coding explanation
const SYSTEM_CODING = `Kamu adalah AIVA, asisten AI yang cerdas dan helpful.
PENTING: Jika user meminta kode/coding/program, WAJIB berikan:
1. Penjelasan lengkap apa yang akan dibuat
2. Kode LENGKAP dan PENUH — jangan dipotong, jangan tulis "// lanjutkan sendiri" atau sejenisnya
3. Penjelasan tiap bagian kode (fungsi, logika, alur)
4. Contoh penggunaan / output jika relevan
Jangan pernah memotong kode di tengah. Selalu berikan jawaban yang tuntas dan informatif.`;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ============================
// 🔥 FETCH WITH TIMEOUT
// ============================
function fetchWithTimeout(url, options, timeout = 90000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

// ============================
// 🚀 CALL API
// ============================
async function callAPI(api, message, history) {

  // ================= GROQ =================
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

  // ================= QWEN =================
  if (api === "qwen") {

    let lastError = null;

    for (const model of QWEN_MODELS) {
      try {
        console.log("🔥 Qwen coba:", model);

        const resp = await fetchWithTimeout(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Authorization": "Bearer " + OPENROUTER_API_KEY,
              "Content-Type": "application/json",
              "HTTP-Referer": "http://localhost:" + PORT,
              "X-Title": "AIVA",
              "User-Agent": "AIVA/1.0"
            },
            body: JSON.stringify({
              model,
              temperature: 0.6,
              max_tokens: 4096,
              messages: [
                { role: "system", content: SYSTEM_CODING },
                ...history,
                { role: "user", content: message }
              ]
              // ❗ fallback otomatis (jangan dimatiin)
            })
          }
        );

        const text = await resp.text();
        console.log("RAW:", text.slice(0, 200));

        if (!resp.ok) {
          lastError = new Error(`HTTP ${resp.status} (${model})`);
          continue;
        }

        let data;
        try {
          data = JSON.parse(text);
        } catch {
          lastError = new Error("JSON rusak dari " + model);
          continue;
        }

        if (data.error) {
          lastError = new Error(data.error.message);
          continue;
        }

        const content = data?.choices?.[0]?.message?.content;

        if (!content) {
          lastError = new Error("Kosong dari " + model);
          continue;
        }

        console.log("✅ Qwen sukses:", model);
        return content;

      } catch (err) {
        console.log("❌ Qwen error:", err.message);
        lastError = err;
      }
    }

    throw lastError || new Error("Semua Qwen gagal");
  }

  // ================= GLM (z.ai via OpenRouter) =================
  if (api === "glm") {
    let lastError = null;
    for (const model of GLM_MODELS) {
      try {
        console.log("🔥 GLM coba:", model);
        const resp = await fetchWithTimeout(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Authorization": "Bearer " + OPENROUTER_API_KEY,
              "Content-Type": "application/json",
              "HTTP-Referer": "http://localhost:" + PORT,
              "X-Title": "AIVA",
              "User-Agent": "AIVA/1.0"
            },
            body: JSON.stringify({
              model,
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
        const text = await resp.text();
        console.log("RAW GLM:", text.slice(0, 300));
        if (!resp.ok) {
          lastError = new Error(`HTTP ${resp.status} (${model}): ${text.slice(0,200)}`);
          continue;
        }
        let data;
        try { data = JSON.parse(text); } catch { lastError = new Error("JSON rusak dari " + model); continue; }
        if (data.error) { lastError = new Error(data.error.message); continue; }
        let content = data?.choices?.[0]?.message?.content;
        if (!content) { lastError = new Error("Kosong dari " + model); continue; }
        // Strip <think>...</think> tags (GLM thinking mode)
        content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        if (!content) { lastError = new Error("Konten kosong setelah strip think dari " + model); continue; }
        console.log("✅ GLM sukses:", model);
        return content;
      } catch (err) {
        console.log("❌ GLM error:", err.message);
        lastError = err;
      }
    }
    throw lastError || new Error("Semua GLM gagal");
  }

  throw new Error("API tidak dikenal");
}

// ============================
// 💬 CHAT
// ============================
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

// ============================
// 🔀 MULTI CHAT
// ============================
app.post("/multi-chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.json({ error: "Pesan kosong!" });

    const [groq, qwen, glm] = await Promise.allSettled([
      callAPI("groq", message, []),
      callAPI("qwen", message, []),
      callAPI("glm", message, [])
    ]);

    res.json({
      replies: {
        groq: groq.status === "fulfilled" ? groq.value : "Gagal",
        qwen: qwen.status === "fulfilled" ? qwen.value : "Gagal",
        glm:  glm.status  === "fulfilled" ? glm.value  : "Gagal"
      }
    });

  } catch (err) {
    res.json({ error: err.message });
  }
});

// ============================
// 🚀 START
// ============================
app.listen(PORT, () => {
  console.log("🔥 AIVA jalan di http://localhost:" + PORT);
});
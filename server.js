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
          max_tokens: 1024,
          messages: [
            { role: "system", content: "Kamu adalah AIVA. Santai, natural, ringkas." },
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
              max_tokens: 1024,
              messages: [
                { role: "system", content: "Kamu adalah AIVA. Jawaban rapi, jelas, informatif." },
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

    const [groq, qwen] = await Promise.allSettled([
      callAPI("groq", message, []),
      callAPI("qwen", message, [])
    ]);

    res.json({
      replies: {
        groq: groq.status === "fulfilled" ? groq.value : "Gagal",
        qwen: qwen.status === "fulfilled" ? qwen.value : "Gagal"
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
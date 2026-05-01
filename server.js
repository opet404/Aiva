const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");
const path    = require("path");

const app  = express();
const PORT = 3000;

// ─── API KEYS ────────────────────────────────────────────────────────────────
const GROQ_API_KEY       = "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";
const OPENROUTER_API_KEY = "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";

// ─── MODEL LIST ──────────────────────────────────────────────────────────────
const QWEN_MODELS = [
  "qwen/qwen3-235b-a22b:free",
  "qwen/qwen3-30b-a3b:free",
  "qwen/qwen-2.5-72b-instruct:free"
];

// ─── HISTORY per session ─────────────────────────────────────────────────────
let chatHistories = {};

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get("/health", async (req, res) => {
  const testMsg = "Balas hanya dengan kata: ok";
  const results = {};
  for (const api of ["groq", "qwen"]) {
    try {
      const reply = await callAPI(api, testMsg, []);
      results[api] = { status: "ok", preview: reply.slice(0, 80) };
    } catch (e) {
      results[api] = { status: "error", error: e.message };
    }
  }
  res.json(results);
});

// ─── SINGLE CHAT ──────────────────────────────────────────────────────────────
app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body && req.body.message;
    const selectedAPI = (req.body && req.body.api) || "groq";
    const sessionId   = (req.body && req.body.sessionId) || "default";

    if (!userMessage) return res.json({ reply: "Pesan kosong!" });

    if (!chatHistories[sessionId]) chatHistories[sessionId] = [];
    chatHistories[sessionId].push({ role: "user", content: userMessage });
    if (chatHistories[sessionId].length > 12)
      chatHistories[sessionId] = chatHistories[sessionId].slice(-12);

    const reply = await callAPI(selectedAPI, userMessage, chatHistories[sessionId]);
    chatHistories[sessionId].push({ role: "assistant", content: reply });

    res.json({ reply });
  } catch (err) {
    console.error("[/chat] Error:", err.message);
    res.json({ reply: "Server error: " + err.message });
  }
});

// ─── MULTI CHAT (Groq + Qwen parallel) ───────────────────────────────────────
app.post("/multi-chat", async (req, res) => {
  try {
    const userMessage = req.body && req.body.message;
    if (!userMessage) return res.json({ error: "Pesan kosong!" });

    const models  = ["groq", "qwen"];
    const results = await Promise.allSettled(
      models.map(api => callAPI(api, userMessage, []))
    );

    const replies = {};
    models.forEach((api, i) => {
      replies[api] = results[i].status === "fulfilled"
        ? results[i].value
        : ("Gagal: " + (results[i].reason?.message || "unknown error"));
    });

    res.json({ replies });
  } catch (err) {
    console.error("[/multi-chat] Error:", err.message);
    res.json({ error: "Server error: " + err.message });
  }
});

// ─── FETCH WITH TIMEOUT ───────────────────────────────────────────────────────
function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// ─── CALL API ─────────────────────────────────────────────────────────────────
async function callAPI(api, message, history) {

  if (api === "groq") {
    const resp = await fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + GROQ_API_KEY,
          "Content-Type":  "application/json"
        },
        body: JSON.stringify({
          model:       "llama-3.3-70b-versatile",
          temperature: 0.7,
          max_tokens:  1024,
          messages: [
            { role: "system", content: "Kamu adalah AIVA. Santai, natural, ringkas tapi jelas. Ikuti gaya bahasa user." },
            ...history,
            { role: "user", content: message }
          ]
        })
      },
      15000
    );
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error("Groq HTTP " + resp.status + ": " + txt.slice(0, 300));
    }
    const d = await resp.json();
    const content = d?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Groq: response kosong");
    return content;
  }

  if (api === "qwen") {
    let lastErr = null;
    for (const model of QWEN_MODELS) {
      try {
        console.log("[qwen] mencoba:", model);
        const resp = await fetchWithTimeout(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Authorization": "Bearer " + OPENROUTER_API_KEY,
              "Content-Type":  "application/json",
              "HTTP-Referer":  "http://localhost:" + PORT,
              "X-Title":       "AIVA Chat"
            },
            body: JSON.stringify({
              model,
              temperature: 0.6,
              max_tokens:  1024,
              messages: [
                { role: "system", content: "Kamu adalah AIVA. Rapi, terstruktur, jelas, dan informatif." },
                ...history,
                { role: "user", content: message }
              ],
              provider: { allow_fallbacks: false }
            })
          },
          60000
        );

        const txt = await resp.text();
        if (!resp.ok) {
          let errDetail = txt.slice(0, 200);
          try { errDetail = JSON.parse(txt)?.error?.message || errDetail; } catch(e){}
          console.warn("[qwen]", model, "HTTP", resp.status, errDetail);
          lastErr = new Error("HTTP " + resp.status + " (" + model + "): " + errDetail);
          continue;
        }

        let d;
        try { d = JSON.parse(txt); }
        catch(e) { lastErr = new Error("JSON parse error dari " + model); continue; }

        if (d.error) {
          console.warn("[qwen]", model, "error:", d.error.message);
          lastErr = new Error(d.error.message || "OpenRouter error");
          continue;
        }

        const content = d?.choices?.[0]?.message?.content;
        if (!content) {
          console.warn("[qwen]", model, "konten kosong");
          lastErr = new Error("Konten kosong dari " + model);
          continue;
        }

        console.log("[qwen] sukses:", model, "chars:", content.length);
        return content;

      } catch (e) {
        if (e.name === "AbortError") {
          console.warn("[qwen]", model, "timeout");
          lastErr = new Error("Timeout pada " + model);
        } else {
          console.warn("[qwen]", model, "exception:", e.message);
          lastErr = e;
        }
      }
    }
    throw lastErr || new Error("Semua model Qwen gagal");
  }

  throw new Error("Unknown API: " + api);
}

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("🔥 AIVA running on http://localhost:" + PORT);
  console.log("   Groq → llama-3.3-70b-versatile");
  console.log("   Qwen → " + QWEN_MODELS[0] + " (+" + (QWEN_MODELS.length - 1) + " fallback)");
  console.log("   Health → http://localhost:" + PORT + "/health");
});

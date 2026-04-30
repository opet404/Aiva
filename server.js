const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");
const path    = require("path");

const app  = express();
const PORT = 3000;

// ─── API KEYS ────────────────────────────────────────────────────────────────
const GROQ_API_KEY       = "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";
const OPENROUTER_API_KEY = "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";
const GEMINI_API_KEY     = "AIzaSyAZjjjDAaOjK9ft6ROh0p4Ok0NITiycLxI";

// ─── MODEL FALLBACK LISTS ────────────────────────────────────────────────────
const QWEN_MODELS = [
  "qwen/qwen-2.5-72b-instruct",
  "qwen/qwen-2.5-7b-instruct:free",
  "qwen/qwen2-7b-instruct:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "mistralai/mistral-7b-instruct:free",
  "google/gemma-2-9b-it:free"
];

const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.0-pro"
];

// ─── HISTORY per session ─────────────────────────────────────────────────────
let chatHistories = {};

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
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

// ─── MULTI CHAT ───────────────────────────────────────────────────────────────
app.post("/multi-chat", async (req, res) => {
  try {
    const userMessage = req.body && req.body.message;
    if (!userMessage) return res.json({ error: "Pesan kosong!" });

    const models  = ["groq", "qwen", "gemini"];
    const results = await Promise.allSettled(
      models.map(function(api) { return callAPI(api, userMessage, []); })
    );

    const replies = {};
    models.forEach(function(api, i) {
      replies[api] = results[i].status === "fulfilled"
        ? results[i].value
        : ("Gagal: " + (results[i].reason && results[i].reason.message ? results[i].reason.message : "unknown error"));
    });

    res.json({ replies });
  } catch (err) {
    console.error("[/multi-chat] Error:", err.message);
    res.json({ error: "Server error: " + err.message });
  }
});

// ─── CALL API HELPER ──────────────────────────────────────────────────────────
async function callAPI(api, message, history) {

  // ── GROQ ───────────────────────────────────────────────────────────────────
  if (api === "groq") {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + GROQ_API_KEY,
        "Content-Type":  "application/json"
      },
      body: JSON.stringify({
        model:       "llama-3.1-8b-instant",
        temperature: 0.7,
        max_tokens:  1024,
        messages: [
          { role: "system", content: "Kamu adalah AIVA. Santai, natural, ringkas tapi jelas. Ikuti gaya bahasa user." }
        ].concat(history).concat([{ role: "user", content: message }])
      })
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error("Groq HTTP " + resp.status + ": " + txt.slice(0, 200));
    }

    const d = await resp.json();
    if (!d || !d.choices || !d.choices[0] || !d.choices[0].message || !d.choices[0].message.content)
      throw new Error("Groq: response tidak valid");

    return d.choices[0].message.content;
  }

  // ── QWEN via OpenRouter — model fallback chain ─────────────────────────────
  if (api === "qwen") {
    let lastErr = null;

    for (let mi = 0; mi < QWEN_MODELS.length; mi++) {
      const model = QWEN_MODELS[mi];
      try {
        console.log("[qwen] mencoba model: " + model);
        const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + OPENROUTER_API_KEY,
            "Content-Type":  "application/json",
            "HTTP-Referer":  "https://aiva-chat.app",
            "X-Title":       "AIVA Chat"
          },
          body: JSON.stringify({
            model:       model,
            temperature: 0.7,
            max_tokens:  1024,
            messages: [
              { role: "system", content: "Kamu adalah AIVA. Rapi, terstruktur, jelas, dan informatif." }
            ].concat(history).concat([{ role: "user", content: message }])
          })
        });

        if (!resp.ok) {
          const txt = await resp.text();
          console.warn("[qwen] model " + model + " HTTP " + resp.status + ": " + txt.slice(0, 120));
          lastErr = new Error("OpenRouter HTTP " + resp.status);
          continue;
        }

        const d = await resp.json();
        const content = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
        if (!content) {
          console.warn("[qwen] model " + model + " konten kosong");
          lastErr = new Error("Konten kosong dari " + model);
          continue;
        }

        console.log("[qwen] sukses dengan model: " + model);
        return content;

      } catch (e) {
        console.warn("[qwen] model " + model + " exception: " + e.message);
        lastErr = e;
      }
    }

    throw lastErr || new Error("Semua model Qwen/OpenRouter gagal");
  }

  // ── GEMINI — model fallback chain ─────────────────────────────────────────
  if (api === "gemini") {
    const geminiContents = history
      .filter(function(m) { return m.role === "user" || m.role === "assistant"; })
      .map(function(m) {
        return {
          role:  m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }]
        };
      });
    geminiContents.push({ role: "user", parts: [{ text: message }] });

    let lastErr = null;

    for (let mi = 0; mi < GEMINI_MODELS.length; mi++) {
      const model = GEMINI_MODELS[mi];
      try {
        console.log("[gemini] mencoba model: " + model);
        const resp = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + GEMINI_API_KEY,
          {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              system_instruction: {
                parts: [{ text: "Kamu adalah AIVA. Kreatif, cerdas, dan ramah. Jawab dalam bahasa yang sama dengan user." }]
              },
              contents: geminiContents,
              generationConfig: {
                temperature:     0.7,
                maxOutputTokens: 1024
              }
            })
          }
        );

        if (!resp.ok) {
          const txt = await resp.text();
          console.warn("[gemini] model " + model + " HTTP " + resp.status + ": " + txt.slice(0, 120));
          lastErr = new Error("Gemini HTTP " + resp.status);
          continue;
        }

        const d = await resp.json();

        if (!d || !d.candidates || d.candidates.length === 0) {
          const reason = (d && d.promptFeedback && d.promptFeedback.blockReason) || "no candidates";
          console.warn("[gemini] model " + model + " blocked: " + reason);
          lastErr = new Error("Gemini blocked: " + reason);
          continue;
        }

        const part = d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts && d.candidates[0].content.parts[0] && d.candidates[0].content.parts[0].text;
        if (!part) {
          console.warn("[gemini] model " + model + " part kosong");
          lastErr = new Error("Part kosong dari " + model);
          continue;
        }

        console.log("[gemini] sukses dengan model: " + model);
        return part;

      } catch (e) {
        console.warn("[gemini] model " + model + " exception: " + e.message);
        lastErr = e;
      }
    }

    // Last resort: fallback ke Groq kalau semua Gemini quota habis
    console.warn("[gemini] semua model gagal, fallback ke Groq...");
    try {
      const fallback = await callAPI("groq", message, history);
      return "[Gemini tidak tersedia, dijawab oleh Groq]\n\n" + fallback;
    } catch (fe) {
      throw lastErr || new Error("Semua model Gemini gagal");
    }
  }

  throw new Error("Unknown API: " + api);
}

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, function() {
  console.log("🔥 AIVA running on http://localhost:" + PORT);
  console.log("   Groq   → llama-3.1-8b-instant");
  console.log("   Qwen   → OpenRouter fallback chain (" + QWEN_MODELS.length + " models)");
  console.log("   Gemini → Gemini fallback chain (" + GEMINI_MODELS.length + " models) + Groq backup");
});

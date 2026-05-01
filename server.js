const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");
const path    = require("path");

const app  = express();
const PORT = 3000;

// ─── API KEYS ────────────────────────────────────────────────────────────────
const GROQ_API_KEY       = "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";
const OPENROUTER_API_KEY = "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";
const GEMINI_API_KEY     = "AIzaSyBqZVZbfBGFdiU0GIVpNJvTn5IzNh9ztoM";

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

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
// Akses via: http://localhost:3000/health
app.get("/health", async (req, res) => {
  const testMsg = "hi";
  const results = {};

  for (const api of ["groq", "qwen", "gemini"]) {
    try {
      const reply = await callAPI(api, testMsg, []);
      results[api] = { status: "ok", preview: reply.slice(0, 60) };
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

// ─── FETCH WITH TIMEOUT ───────────────────────────────────────────────────────
function fetchWithTimeout(url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// ─── CALL API HELPER ──────────────────────────────────────────────────────────
async function callAPI(api, message, history) {

  // ── GROQ ───────────────────────────────────────────────────────────────────
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
          model:       "llama-3.1-8b-instant",
          temperature: 0.7,
          max_tokens:  1024,
          messages: [
            { role: "system", content: "Kamu adalah AIVA. Santai, natural, ringkas tapi jelas. Ikuti gaya bahasa user." }
          ].concat(history).concat([{ role: "user", content: message }])
        })
      },
      15000
    );

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error("Groq HTTP " + resp.status + ": " + txt.slice(0, 300));
    }

    const d = await resp.json();
    if (!d || !d.choices || !d.choices[0] || !d.choices[0].message || !d.choices[0].message.content)
      throw new Error("Groq: response tidak valid — " + JSON.stringify(d).slice(0, 200));

    return d.choices[0].message.content;
  }

  // ── QWEN via OpenRouter — model fallback chain ─────────────────────────────
  if (api === "qwen") {
    let lastErr = null;

    for (let mi = 0; mi < QWEN_MODELS.length; mi++) {
      const model = QWEN_MODELS[mi];
      try {
        console.log("[qwen] mencoba model: " + model);

        const resp = await fetchWithTimeout(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Authorization": "Bearer " + OPENROUTER_API_KEY,
              "Content-Type":  "application/json",
              "HTTP-Referer":  "http://localhost:3000",
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
          },
          20000
        );

        const txt = await resp.text();

        if (!resp.ok) {
          console.warn("[qwen] model " + model + " HTTP " + resp.status + ": " + txt.slice(0, 200));
          lastErr = new Error("OpenRouter HTTP " + resp.status + " (" + model + "): " + txt.slice(0, 150));
          continue;
        }

        let d;
        try {
          d = JSON.parse(txt);
        } catch (parseErr) {
          console.warn("[qwen] model " + model + " gagal parse JSON: " + txt.slice(0, 100));
          lastErr = new Error("JSON parse error dari " + model);
          continue;
        }

        // Cek apakah ada error field dari OpenRouter
        if (d.error) {
          console.warn("[qwen] model " + model + " error: " + JSON.stringify(d.error).slice(0, 200));
          lastErr = new Error("OpenRouter error: " + (d.error.message || JSON.stringify(d.error)));
          continue;
        }

        const content = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
        if (!content) {
          console.warn("[qwen] model " + model + " konten kosong: " + JSON.stringify(d).slice(0, 200));
          lastErr = new Error("Konten kosong dari " + model);
          continue;
        }

        console.log("[qwen] sukses dengan model: " + model);
        return content;

      } catch (e) {
        if (e.name === "AbortError") {
          console.warn("[qwen] model " + model + " timeout (20s)");
          lastErr = new Error("Timeout pada " + model);
        } else {
          console.warn("[qwen] model " + model + " exception: " + e.message);
          lastErr = e;
        }
      }
    }

    throw lastErr || new Error("Semua model Qwen/OpenRouter gagal");
  }

  // ── GEMINI — model fallback chain ─────────────────────────────────────────
  if (api === "gemini") {
    // Bangun history Gemini — pastikan alternating user/model
    // Gemini tidak boleh consecutive role yang sama
    const geminiContents = [];
    let lastRole = null;

    for (const m of history.filter(m => m.role === "user" || m.role === "assistant")) {
      const role = m.role === "assistant" ? "model" : "user";
      if (role === lastRole) continue; // skip duplikat role berurutan
      geminiContents.push({ role, parts: [{ text: m.content }] });
      lastRole = role;
    }

    // Pastikan terakhir sebelum pesan baru adalah "user" jika ada
    if (lastRole === "user") {
      // Tidak perlu tambah, nanti digabung di bawah
    }

    // Tambahkan pesan user baru
    // Kalau lastRole sudah "user", Gemini tidak bisa — gabungkan
    if (lastRole === "user" && geminiContents.length > 0) {
      const last = geminiContents[geminiContents.length - 1];
      last.parts[0].text += "\n" + message;
    } else {
      geminiContents.push({ role: "user", parts: [{ text: message }] });
    }

    let lastErr = null;

    for (let mi = 0; mi < GEMINI_MODELS.length; mi++) {
      const model = GEMINI_MODELS[mi];
      try {
        console.log("[gemini] mencoba model: " + model);

        const requestBody = {
          contents: geminiContents,
          generationConfig: {
            temperature:     0.7,
            maxOutputTokens: 1024
          }
        };

        // system_instruction tidak didukung oleh gemini-1.0-pro, skip untuk model lama
        if (model !== "gemini-1.0-pro") {
          requestBody.system_instruction = {
            parts: [{ text: "Kamu adalah AIVA. Kreatif, cerdas, dan ramah. Jawab dalam bahasa yang sama dengan user." }]
          };
        }

        const resp = await fetchWithTimeout(
          "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + GEMINI_API_KEY,
          {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
          },
          20000
        );

        const txt = await resp.text();

        if (!resp.ok) {
          console.warn("[gemini] model " + model + " HTTP " + resp.status + ": " + txt.slice(0, 200));
          lastErr = new Error("Gemini HTTP " + resp.status + " (" + model + "): " + txt.slice(0, 150));
          continue;
        }

        let d;
        try {
          d = JSON.parse(txt);
        } catch (parseErr) {
          console.warn("[gemini] model " + model + " gagal parse JSON: " + txt.slice(0, 100));
          lastErr = new Error("JSON parse error dari " + model);
          continue;
        }

        if (!d || !d.candidates || d.candidates.length === 0) {
          const reason = (d && d.promptFeedback && d.promptFeedback.blockReason) || "no candidates";
          console.warn("[gemini] model " + model + " blocked/empty: " + reason);
          console.warn("[gemini] full response: " + JSON.stringify(d).slice(0, 300));
          lastErr = new Error("Gemini blocked: " + reason + " (" + model + ")");
          continue;
        }

        const candidate = d.candidates[0];
        // Cek finish reason
        if (candidate.finishReason && candidate.finishReason !== "STOP" && candidate.finishReason !== "MAX_TOKENS") {
          console.warn("[gemini] model " + model + " finishReason: " + candidate.finishReason);
          lastErr = new Error("Gemini finish: " + candidate.finishReason + " (" + model + ")");
          continue;
        }

        const part = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text;
        if (!part) {
          console.warn("[gemini] model " + model + " part kosong: " + JSON.stringify(candidate).slice(0, 200));
          lastErr = new Error("Part kosong dari " + model);
          continue;
        }

        console.log("[gemini] sukses dengan model: " + model);
        return part;

      } catch (e) {
        if (e.name === "AbortError") {
          console.warn("[gemini] model " + model + " timeout (20s)");
          lastErr = new Error("Timeout pada " + model);
        } else {
          console.warn("[gemini] model " + model + " exception: " + e.message);
          lastErr = e;
        }
      }
    }

    // Last resort: fallback ke Groq
    console.warn("[gemini] semua model gagal (" + (lastErr && lastErr.message) + "), fallback ke Groq...");
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
  console.log("");
  console.log("   Health check → http://localhost:" + PORT + "/health");
});

const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = 3000;

const GROQ_API_KEY        = "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";
const OPENROUTER_API_KEY  = "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";
const GEMINI_API_KEY      = "AIzaSyAZjjjDAaOjK9ft6ROh0p4Ok0NITiycLxI";

// ─── History per session (single chat) ────────────────────────────────────────
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
    const userMessage = req.body?.message;
    const selectedAPI = req.body?.api || "groq";
    const sessionId   = req.body?.sessionId || "default";

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
    const userMessage = req.body?.message;
    if (!userMessage) return res.json({ error: "Pesan kosong!" });

    const models = ["groq", "qwen", "gemini"];
    const results = await Promise.allSettled(
      models.map(api => callAPI(api, userMessage, []))
    );

    const replies = {};
    models.forEach((api, i) => {
      if (results[i].status === "fulfilled") {
        replies[api] = results[i].value;
      } else {
        console.error(`[multi-chat] ${api} failed:`, results[i].reason?.message);
        replies[api] = `⚠️ ${api} gagal: ${results[i].reason?.message || "unknown error"}`;
      }
    });

    res.json({ replies });
  } catch (err) {
    console.error("[/multi-chat] Error:", err.message);
    res.json({ error: "Server error: " + err.message });
  }
});

// ─── CALL API HELPER ──────────────────────────────────────────────────────────
async function callAPI(api, message, history) {

  // ── GROQ ──────────────────────────────────────────────────────────────────
  if (api === "groq") {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        temperature: 0.7,
        max_tokens: 1024,
        messages: [
          { role: "system", content: "Kamu adalah AIVA. Santai, natural, ringkas tapi jelas. Ikuti gaya bahasa user." },
          ...history,
          { role: "user", content: message }
        ]
      })
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Groq HTTP ${resp.status}: ${txt.slice(0, 200)}`);
    }

    const d = await resp.json();
    if (!d?.choices?.[0]?.message?.content)
      throw new Error("Groq: response tidak valid – " + JSON.stringify(d).slice(0, 200));

    return d.choices[0].message.content;
  }

  // ── QWEN via OpenRouter ────────────────────────────────────────────────────
  if (api === "qwen") {
    // FIX 1: model name yang benar di OpenRouter
    // FIX 2: wajib kirim HTTP-Referer & X-Title agar OpenRouter tidak reject
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://aiva-chat.app",   // ← WAJIB di OpenRouter
        "X-Title": "AIVA Chat"                      // ← nama app kamu
      },
      body: JSON.stringify({
        model: "qwen/qwen-2.5-72b-instruct",        // ← model yang aktif & tersedia
        temperature: 0.7,
        max_tokens: 1024,
        messages: [
          { role: "system", content: "Kamu adalah AIVA. Rapi, terstruktur, jelas, dan informatif." },
          ...history,
          { role: "user", content: message }
        ]
      })
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Qwen/OpenRouter HTTP ${resp.status}: ${txt.slice(0, 200)}`);
    }

    const d = await resp.json();
    if (!d?.choices?.[0]?.message?.content)
      throw new Error("Qwen: response tidak valid – " + JSON.stringify(d).slice(0, 200));

    return d.choices[0].message.content;
  }

  // ── GEMINI ─────────────────────────────────────────────────────────────────
  if (api === "gemini") {
    // FIX 3: Gemini pakai format "contents" yang berbeda dari OpenAI.
    //   role harus "user" atau "model" (bukan "assistant")
    //   Kita convert history format OpenAI → format Gemini di sini.
    const geminiContents = history
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }));

    // Tambah pesan user terakhir
    geminiContents.push({ role: "user", parts: [{ text: message }] });

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // FIX 4: system instruction pakai field tersendiri di Gemini API
          system_instruction: {
            parts: [{ text: "Kamu adalah AIVA. Kreatif, cerdas, dan ramah. Jawab dalam bahasa yang sama dengan user." }]
          },
          contents: geminiContents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024
          }
        })
      }
    );

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Gemini HTTP ${resp.status}: ${txt.slice(0, 200)}`);
    }

    const d = await resp.json();

    // FIX 5: handle blocked / empty candidates
    if (!d?.candidates || d.candidates.length === 0) {
      const reason = d?.promptFeedback?.blockReason || "tidak ada candidates";
      throw new Error(`Gemini: ${reason} – ${JSON.stringify(d).slice(0, 200)}`);
    }

    const part = d.candidates[0]?.content?.parts?.[0]?.text;
    if (!part) throw new Error("Gemini: part kosong – " + JSON.stringify(d).slice(0, 200));

    return part;
  }

  throw new Error("Unknown API: " + api);
}

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🔥 AIVA running on http://localhost:${PORT}`);
  console.log(`   Groq   → llama-3.1-8b-instant`);
  console.log(`   Qwen   → qwen/qwen-2.5-72b-instruct (via OpenRouter)`);
  console.log(`   Gemini → gemini-2.0-flash`);
});

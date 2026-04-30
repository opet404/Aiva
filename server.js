const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = 3000;

// 🔑 API KEYS
const GROQ_API_KEY       = "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";
const OPENROUTER_API_KEY = "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";
const GEMINI_API_KEY     = process.env.GEMINI_API_KEY || "AIzaSyAZjjjDAaOjK9ft6ROh0p4Ok0NITiycLxI"; // set di env atau isi di sini

// 🧠 MEMORY per-session (in-memory, reset saat server restart)
const sessions = {};

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ============================
// 🚀 CHAT API — Single model
// ============================
app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body?.message;
    const selectedAPI = req.body?.api || "groq";
    const sessionId   = req.body?.sessionId || "default";

    if (!userMessage) return res.json({ reply: "Pesan kosong!" });

    if (!sessions[sessionId]) sessions[sessionId] = [];
    sessions[sessionId].push({ role: "user", content: userMessage });
    if (sessions[sessionId].length > 14) sessions[sessionId] = sessions[sessionId].slice(-14);

    const reply = await callModel(selectedAPI, sessions[sessionId]);
    sessions[sessionId].push({ role: "assistant", content: reply });

    res.json({ reply });
  } catch (err) {
    res.json({ reply: "Server error: " + err.message });
  }
});

// ============================
// 🚀 MULTI-MODEL API — 3 jawaban parallel
// ============================
app.post("/chat-multi", async (req, res) => {
  try {
    const userMessage = req.body?.message;
    const sessionId   = req.body?.sessionId || "multi_default";

    if (!userMessage) return res.json({ error: "Pesan kosong!" });

    if (!sessions[sessionId]) sessions[sessionId] = [];
    sessions[sessionId].push({ role: "user", content: userMessage });
    if (sessions[sessionId].length > 14) sessions[sessionId] = sessions[sessionId].slice(-14);

    const history = [...sessions[sessionId]];

    const [groqRes, qwenRes, geminiRes] = await Promise.allSettled([
      callModel("groq",   history),
      callModel("qwen",   history),
      callModel("gemini", history),
    ]);

    const result = {
      groq:   groqRes.status   === "fulfilled" ? groqRes.value   : "Groq error: " + groqRes.reason,
      qwen:   qwenRes.status   === "fulfilled" ? qwenRes.value   : "Qwen error: " + qwenRes.reason,
      gemini: geminiRes.status === "fulfilled" ? geminiRes.value : "Gemini error: " + geminiRes.reason,
    };

    // Simpan jawaban groq sebagai konteks lanjutan
    sessions[sessionId].push({ role: "assistant", content: result.groq });

    res.json(result);
  } catch (err) {
    res.json({ error: "Server error: " + err.message });
  }
});

// ============================
// 🔧 MODEL HELPER
// ============================
async function callModel(api, history) {
  if (api === "groq") {
    const sys = `Kamu adalah AIVA.\nGaya:\n- Santai, natural, seperti ngobrol\n- Sedikit ekspresif (wah, anjir, mantap jika cocok)\n- Jawaban ringkas tapi jelas\n- Ikuti gaya bahasa user`;
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "llama-3.1-8b-instant", temperature: 0.7, max_tokens: 1024, messages: [{ role: "system", content: sys }, ...history] })
    });
    const d = await r.json();
    if (!d?.choices) throw new Error(JSON.stringify(d));
    return d.choices[0].message.content;

  } else if (api === "qwen") {
    const sys = `Kamu adalah AIVA.\nGaya:\n- Lebih rapi dan terstruktur\n- Bahasa jelas dan sedikit formal\n- Penjelasan lebih lengkap\n- Hindari slang berlebihan`;
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "qwen/qwen3-next-80b-a3b", temperature: 0.7, max_tokens: 1024, messages: [{ role: "system", content: sys }, ...history] })
    });
    const d = await r.json();
    if (!d?.choices) throw new Error(JSON.stringify(d));
    return d.choices[0].message.content;

  } else if (api === "gemini") {
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY belum di-set di environment");
    const sys = `Kamu adalah AIVA.\nGaya:\n- Kreatif, analitis, dan mendalam\n- Bahasa mengalir dan enak dibaca\n- Beri insight lebih dari yang ditanya\n- Tetap to-the-point`;
    const contents = history.map((m, i) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: i === 0 ? sys + "\n\n" + m.content : m.content }]
    }));
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 1024, temperature: 0.7 } }) }
    );
    const d = await r.json();
    if (!d?.candidates) throw new Error(JSON.stringify(d));
    return d.candidates[0].content.parts[0].text;
  }

  throw new Error("Unknown API: " + api);
}

app.listen(PORT, () => {
  console.log(`🔥 AIVA jalan di http://localhost:${PORT}`);
});

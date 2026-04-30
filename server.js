const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = 3000;

const GROQ_API_KEY = "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";
const OPENROUTER_API_KEY = "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";
const GEMINI_API_KEY = "AIzaSyAZjjjDAaOjK9ft6ROh0p4Ok0NITiycLxI";

let chatHistories = {};

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body?.message;
    const selectedAPI = req.body?.api || "groq";
    const sessionId = req.body?.sessionId || "default";
    if (!userMessage) return res.json({ reply: "Pesan kosong!" });
    if (!chatHistories[sessionId]) chatHistories[sessionId] = [];
    chatHistories[sessionId].push({ role: "user", content: userMessage });
    if (chatHistories[sessionId].length > 12)
      chatHistories[sessionId] = chatHistories[sessionId].slice(-12);
    const reply = await callAPI(selectedAPI, userMessage, chatHistories[sessionId]);
    chatHistories[sessionId].push({ role: "assistant", content: reply });
    res.json({ reply });
  } catch (err) {
    res.json({ reply: "Server error: " + err.message });
  }
});

app.post("/multi-chat", async (req, res) => {
  try {
    const userMessage = req.body?.message;
    if (!userMessage) return res.json({ error: "Pesan kosong!" });
    const models = ["groq", "qwen", "gemini"];
    const results = await Promise.allSettled(models.map(api => callAPI(api, userMessage, [])));
    const replies = {};
    models.forEach((api, i) => {
      replies[api] = results[i].status === "fulfilled" ? results[i].value : "Gagal mendapat jawaban dari " + api;
    });
    res.json({ replies });
  } catch (err) {
    res.json({ error: "Server error: " + err.message });
  }
});

async function callAPI(api, message, history) {
  if (api === "groq") {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "llama-3.1-8b-instant", temperature: 0.7, max_tokens: 1024,
        messages: [{ role: "system", content: "Kamu adalah AIVA. Santai, natural, ringkas tapi jelas." }, ...history, { role: "user", content: message }] })
    });
    const d = await r.json();
    if (!d?.choices) throw new Error(JSON.stringify(d));
    return d.choices[0].message.content;
  } else if (api === "qwen") {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "qwen/qwen3-next-80b-a3b", temperature: 0.7, max_tokens: 1024,
        messages: [{ role: "system", content: "Kamu adalah AIVA. Rapi, terstruktur, jelas." }, ...history, { role: "user", content: message }] })
    });
    const d = await r.json();
    if (!d?.choices) throw new Error(JSON.stringify(d));
    return d.choices[0].message.content;
  } else if (api === "gemini") {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: message }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 1024 } })
    });
    const d = await r.json();
    if (!d?.candidates) throw new Error(JSON.stringify(d));
    return d.candidates[0].content.parts[0].text;
  }
  throw new Error("Unknown API");
}

app.listen(PORT, () => console.log(`AIVA running on http://localhost:${PORT}`));

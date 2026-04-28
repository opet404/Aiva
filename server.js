const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = 3000;

// 🔑 API KEYS
const GROQ_KEY = "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";
const QWEN_KEY = "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";

// 🧠 MEMORY
let chatHistory = [];

app.use(cors());
app.use(express.json());

// 🔥 STATIC
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// 🔥 CHAT API (DUAL AI)
app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body?.message;
    const selectedAPI = req.body?.api || "groq"; // default groq

    if (!userMessage) {
      return res.json({ reply: "Pesan kosong!" });
    }

    // simpan user
    chatHistory.push({ role: "user", content: userMessage });

    if (chatHistory.length > 12) {
      chatHistory = chatHistory.slice(-12);
    }

    let response;

    // =========================
    // 🔥 GROQ
    // =========================
    if (selectedAPI === "groq") {
      response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GROQ_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          temperature: 0.7,
          max_tokens: 1024,
          messages: [
            { role: "system", content: systemPrompt() },
            ...chatHistory
          ]
        })
      });
    }

    // =========================
    // 🔥 QWEN (OPENROUTER)
    // =========================
    else if (selectedAPI === "qwen") {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${QWEN_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "qwen/qwen3:free",
          temperature: 0.7,
          max_tokens: 1024,
          messages: [
            { role: "system", content: systemPrompt() },
            ...chatHistory
          ]
        })
      });
    }

    const data = await response.json();

    if (!data || !data.choices) {
      return res.json({
        reply: "Error API: " + JSON.stringify(data)
      });
    }

    const aiReply = data.choices[0].message.content;

    // simpan AI
    chatHistory.push({ role: "assistant", content: aiReply });

    res.json({ reply: aiReply });

  } catch (err) {
    res.json({
      reply: "Server error: " + err.message
    });
  }
});

// 🔥 SYSTEM PROMPT (biar ga duplikat)
function systemPrompt() {
  return `
Kamu adalah AIVA (Artificial Intelligence Virtual Assistant).

Karakter:
- Pintar, cepat, realistis
- Natural seperti manusia
- Santai tapi tetap cerdas
- Tidak kaku

Aturan:
- Jawaban singkat tapi jelas
- Ikuti bahasa user
- Jangan halusinasi
- Fokus bantu user

Tambahan gaya bahasa:
- Ikuti gaya "gw/lu" atau formal sesuai user

Tambahan emosi:
- Gunakan ekspresi ringan (wah, anjir, dll) sesuai konteks
- Jangan berlebihan
`;
}

// 🚀 START
app.listen(PORT, () => {
  console.log(`🔥 AIVA jalan di http://localhost:${PORT}`);
});
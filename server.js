const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = 3000;

// 🔑 API KEY
const GROQ_API_KEY = "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";
const OPENROUTER_API_KEY = "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";

// 🧠 MEMORY
let chatHistory = [];

app.use(cors());
app.use(express.json());

// 🔥 STATIC
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ============================
// 🚀 CHAT API
// ============================
app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body?.message;
    const selectedAPI = req.body?.api || "groq";

    if (!userMessage) {
      return res.json({ reply: "Pesan kosong!" });
    }

    // simpan user
    chatHistory.push({ role: "user", content: userMessage });

    if (chatHistory.length > 12) {
      chatHistory = chatHistory.slice(-12);
    }

    let url, model, headers, systemPrompt;

    // ============================
    // 🔁 SWITCH API + STYLE
    // ============================
    if (selectedAPI === "groq") {
      url = "https://api.groq.com/openai/v1/chat/completions";
      model = "llama-3.1-8b-instant";

      headers = {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      };

      // 🔴 STYLE GROQ
      systemPrompt = `
Kamu adalah AIVA.

Gaya:
- Santai, natural, seperti ngobrol
- Sedikit ekspresif (wah, anjir, mantap jika cocok)
- Jawaban ringkas tapi jelas
- Ikuti gaya bahasa user
`;

    } else if (selectedAPI === "qwen") {
      url = "https://openrouter.ai/api/v1/chat/completions";
      model = "qwen/qwen3-next-80b-a3b";

      headers = {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      };

      // 🔵 STYLE QWEN
      systemPrompt = `
Kamu adalah AIVA.

Gaya:
- Lebih rapi dan terstruktur
- Bahasa jelas dan sedikit formal
- Penjelasan lebih lengkap
- Hindari slang berlebihan
`;
    }

    // ============================
    // 📡 FETCH AI
    // ============================
    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        model: model,
        temperature: 0.7,
        max_tokens: 1024,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          ...chatHistory
        ]
      })
    });

    const data = await response.json();

    // ❌ ERROR HANDLE
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

// ============================
// 🚀 START SERVER
// ============================
app.listen(PORT, () => {
  console.log(`🔥 AIVA jalan di http://localhost:${PORT}`);
});
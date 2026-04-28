const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = 3000;

// 🔑 API KEY LU (WAJIB DIISI)
const API_KEY = "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";

// 🧠 MEMORY (simple)
let chatHistory = [];

app.use(cors());
app.use(express.json());

// 🔥 SERVE HTML
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// 🔥 CHAT API
app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body?.message;

    if (!userMessage) {
      return res.json({ reply: "Pesan kosong!" });
    }

    // simpan user
    chatHistory.push({ role: "user", content: userMessage });

    // limit memory
    if (chatHistory.length > 12) {
      chatHistory = chatHistory.slice(-12);
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        // ⚡ MODEL BARU + CEPAT
        model: "llama-3.1-8b-instant",

        temperature: 0.7,
        max_tokens: 1024,

        messages: [
          {
            role: "system",
            content: `
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

Tambahan aturan gaya bahasa:
- Jika user menggunakan kata "gw" atau "gue", maka kamu harus menyebut diri kamu sebagai "gw".
- Jika user menggunakan kata "lu", maka kamu harus menyebut lawan bicara sebagai "lu".
- Jika user menggunakan kata "saya", maka kamu harus menyebut diri kamu sebagai "saya".
- Jika user menggunakan kata "kamu", maka kamu harus menyebut lawan bicara sebagai "kamu".
- Wajib mengikuti gaya bahasa user secara konsisten dan tidak boleh tercampur.

Tambahan ekspresi emosi:
- Kamu boleh menunjukkan sedikit emosi agar terasa lebih hidup dan natural.
- Gunakan ekspresi ringan seperti: "wah", "hmm", "anjir", "mantap", "yah", "waduh", dll jika sesuai konteks.
- Jangan berlebihan dalam menunjukkan emosi.
- Sesuaikan emosi dengan situasi dan cara bicara user.
- Jika user santai, kamu boleh lebih ekspresif.
- Jika user formal, tetap jaga emosi agar halus dan sopan.
`
          },
          ...chatHistory
        ]
      })
    });

    const data = await response.json();

    // 🧠 HANDLE ERROR API
    if (!data || !data.choices) {
      return res.json({
        reply: "Error dari API: " + JSON.stringify(data)
      });
    }

    const aiReply = data.choices[0].message.content;

    // simpan jawaban AI
    chatHistory.push({ role: "assistant", content: aiReply });

    res.json({ reply: aiReply });

  } catch (err) {
    res.json({
      reply: "Server error: " + err.message
    });
  }
});

// 🚀 START SERVER
app.listen(PORT, () => {
  console.log(`🔥 AIVA jalan di http://localhost:${PORT}`);
});

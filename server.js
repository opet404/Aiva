const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

/* ================= SINGLE ================= */
app.post("/chat", async (req, res) => {
  try {
    const { message, api } = req.body;

    if (!message) return res.json({ reply: "Pesan kosong!" });

    const reply = await callAPI(api || "groq", message);

    res.json({ reply });

  } catch (err) {
    console.log("ERROR /chat:", err);
    res.json({ reply: "Error: " + err.message });
  }
});

/* ================= MULTI ================= */
app.post("/multi-chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.json({ error: "Pesan kosong!" });

    const models = ["groq", "qwen", "gemini"];

    const results = await Promise.allSettled(
      models.map(api => callAPI(api, message))
    );

    const replies = {};
    models.forEach((api, i) => {
      replies[api] =
        results[i].status === "fulfilled"
          ? results[i].value
          : "❌ Error dari " + api;
    });

    res.json({ replies });

  } catch (err) {
    console.log("ERROR /multi:", err);
    res.json({ error: err.message });
  }
});

/* ================= CORE ================= */
async function callAPI(api, message) {

  /* ===== GROQ ===== */
  if (api === "groq") {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer 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",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: message }]
      })
    });

    const d = await r.json();
    console.log("GROQ:", d);
    return d.choices?.[0]?.message?.content || JSON.stringify(d);
  }

  /* ===== QWEN ===== */
  if (api === "qwen") {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer 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",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "AIVA"
      },
      body: JSON.stringify({
        model: "qwen/qwen3-next-80b-a3b",
        messages: [{ role: "user", content: message }]
      })
    });

    const d = await r.json();
    console.log("QWEN:", d);
    return d.choices?.[0]?.message?.content || JSON.stringify(d);
  }

  /* ===== GEMINI ===== */
  if (api === "gemini") {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=AIzaSyAZjjjDAaOjK9ft6ROh0p4Ok0NITiycLxI",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: message }]
            }
          ]
        })
      }
    );

    const d = await r.json();
    console.log("GEMINI:", d);
    return d.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(d);
  }

  return "API tidak dikenal";
}

/* ================= START ================= */
app.listen(PORT, () => {
  console.log("🚀 Server jalan di http://localhost:" + PORT);
});
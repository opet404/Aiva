export default async function handler(req, res) {
  try {
    const { message, api } = req.body;

    if (!message) {
      return res.json({ reply: "Pesan kosong!" });
    }

    let reply = "";

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
      reply = d.choices?.[0]?.message?.content || "Groq error";
    }

    /* ===== QWEN ===== */
    else if (api === "qwen") {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer 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",
          "Content-Type": "application/json",
          "HTTP-Referer": "https://aiva-beta.vercel.app",
          "X-Title": "AIVA"
        },
        body: JSON.stringify({
          model: "qwen/qwen3-next-80b-a3b",
          messages: [{ role: "user", content: message }]
        })
      });

      const d = await r.json();
      reply = d.choices?.[0]?.message?.content || JSON.stringify(d);
    }

    /* ===== GEMINI ===== */
    else if (api === "gemini") {
      const r = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=AIzaSyAZjjjDAaOjK9ft6ROh0p4Ok0NITiycLxI",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: message }] }]
          })
        }
      );

      const d = await r.json();
      reply =
        d.candidates?.[0]?.content?.parts?.[0]?.text ||
        JSON.stringify(d);
    }

    res.status(200).json({ reply });

  } catch (err) {
    console.log("ERROR:", err);
    res.status(200).json({ reply: "Error: " + err.message });
  }
}
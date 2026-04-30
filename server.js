export default async function handler(req, res) {
  const GROQ_API_KEY = "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";
  const OPENROUTER_API_KEY = "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";
  const GEMINI_API_KEY = "AIzaSyAZjjjDAaOjK9ft6ROh0p4Ok0NITiycLxI";

  try {
    const { message, api } = req.body;

    if (!message) {
      return res.json({ reply: "Pesan kosong!" });
    }

    let reply = "";

    if (api === "groq") {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GROQ_API_KEY}`,
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

    else if (api === "qwen") {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://aiva-beta.vercel.app/",
          "X-Title": "AIVA"
        },
        body: JSON.stringify({
          model: "qwen/qwen3-next-80b-a3b",
          messages: [{ role: "user", content: message }]
        })
      });

      const d = await r.json();
      reply = d.choices?.[0]?.message?.content || "Qwen error";
    }

    else if (api === "gemini") {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: message }] }]
          })
        }
      );

      const d = await r.json();
      reply = d.candidates?.[0]?.content?.parts?.[0]?.text || "Gemini error";
    }

    res.json({ reply });

  } catch (err) {
    console.log(err);
    res.json({ reply: "Error: " + err.message });
  }
}
// api/chat.js — with SSE streaming support
const { callAPI, KEYS, getChain, buildSystemMsg } = require("./_lib");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const { message, api = "groq", history = [], userName = "" } = req.body || {};
  if (!message) return res.status(400).json({ reply: "Pesan kosong!" });

  const hist     = Array.isArray(history) ? history.slice(-8) : [];
  const messages = buildSystemMsg(api, message, hist, userName);
  const chain    = getChain(api);
  const wantsSSE = (req.headers.accept || "").includes("text/event-stream");

  // ── STREAMING MODE ──────────────────────────────────────────
  if (wantsSSE) {
    res.setHeader("Content-Type",    "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control",   "no-cache, no-transform");
    res.setHeader("Connection",      "keep-alive");
    res.setHeader("X-Accel-Buffering","no");
    res.flushHeaders();

    const send = (data) => res.write("data: " + JSON.stringify(data) + "\n\n");

    for (const model of chain) {
      let succeeded = false;
      // Try all keys in parallel — use first that gives 200
      const keyResults = await Promise.allSettled(
        KEYS.map(k => fetch("https://openrouter.ai/api/v1/chat/completions", {
          method : "POST",
          headers: {
            "Authorization": "Bearer " + k,
            "Content-Type" : "application/json",
            "HTTP-Referer"  : process.env.SITE_URL || "https://aiva.vercel.app",
            "X-Title"       : "AIVA",
          },
          body: JSON.stringify({ model, messages, stream: true, max_tokens: 32000, temperature: 0.7 }),
        }).then(r => ({ key: k, res: r }))
      );

      // Find first key that returned 200
      let goodKey = null;
      let goodRes = null;
      for (const r of keyResults) {
        if (r.status === "fulfilled" && r.value.res.ok) {
          goodKey = r.value.key;
          goodRes = r.value.res;
          break;
        }
      }
      if (!goodRes) { console.log(`[stream] all keys failed for ${model}`); continue; }

      try {
        const reader  = goodRes.body.getReader();
        const decoder = new TextDecoder();
        let   buf     = "";
        let   full    = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";

          for (const line of lines) {
            const t = line.trim();
            if (!t || t === "data: [DONE]") continue;
            if (t.startsWith("data: ")) {
              try {
                const d     = JSON.parse(t.slice(6));
                const delta = d.choices?.[0]?.delta?.content || "";
                if (delta) {
                  full += delta;
                  const clean = full.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
                  send({ delta, text: clean });
                }
              } catch {}
            }
          }
        }

        const finalText = full.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        send({ done: true, text: finalText });
        res.write("data: [DONE]\n\n");
        res.end();
        succeeded = true;
        break;
      } catch (e) {
        console.log(`[stream] ${model} stream error: ${e.message}`);
      }

      if (succeeded) break;
    }

    if (!res.writableEnded) {
      send({ error: "Semua model gagal. Coba lagi." });
      res.write("data: [DONE]\n\n");
      res.end();
    }
    return;
  }

  // ── NON-STREAMING FALLBACK ──────────────────────────────────
  try {
    const reply = await callAPI(api, message, hist, userName);
    return res.status(200).json({ reply });
  } catch (err) {
    const m = err.message || "";
    const reply = m.includes("429") || m.includes("rate")
      ? "⚠️ Model sedang sibuk. Coba lagi."
      : "❌ " + m;
    return res.status(200).json({ reply });
  }
};

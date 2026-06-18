// api/status.js — live test tiap model dengan satu key
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const KEYS = [
    process.env.OR_KEY_1,
    process.env.OR_KEY_2,
    process.env.OR_KEY_3,
    process.env.OR_KEY_4,
    process.env.OR_KEY_5,
    process.env.OR_KEY_6,
    process.env.OR_KEY_7,
  ].filter(Boolean);

  const HARDCODED = [
    "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",
    "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",
  ];

  const ALL_KEYS = KEYS.length > 0 ? KEYS : HARDCODED;
  const testKey  = ALL_KEYS[0]; // pakai key pertama buat test model

  const MODELS = [
    "google/gemma-4-31b:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "nvidia/nemotron-3-super:free",
    "openai/gpt-oss-120b:free",
    "openai/gpt-oss-20b:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "qwen/qwen3-coder-480b-a35b-instruct:free",
    "meta-llama/llama-3.2-3b-instruct:free",
    "openrouter/free",
  ];

  const MSG = [{ role: "user", content: "Hi" }];

  const results = await Promise.all(MODELS.map(async model => {
    try {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method : "POST",
        headers: {
          "Authorization": "Bearer " + testKey,
          "Content-Type" : "application/json",
          "HTTP-Referer"  : "https://aiva-beta.vercel.app",
          "X-Title"       : "AIVA-test",
        },
        body  : JSON.stringify({ model, messages: MSG, max_tokens: 10 }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const d = await r.json();
      if (r.status === 429) return { model, status: "⛔ 429 rate limit" };
      if (!r.ok || d.error) return { model, status: "❌ " + (d.error?.message || "HTTP "+r.status) };
      const txt = d?.choices?.[0]?.message?.content || "";
      return { model, status: txt ? "✅ OK: "+txt.slice(0,30) : "⚠️ empty" };
    } catch(e) {
      return { model, status: "❌ " + e.message };
    }
  }));

  const ok = results.filter(r => r.status.startsWith("✅")).length;
  return res.status(200).json({ working: `${ok}/${MODELS.length}`, models: results });
};

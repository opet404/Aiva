module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const KEYS = [
    process.env.OR_KEY_1,process.env.OR_KEY_2,process.env.OR_KEY_3,
    process.env.OR_KEY_4,process.env.OR_KEY_5,process.env.OR_KEY_6,process.env.OR_KEY_7,
  ].filter(Boolean);
  const HARDCODED = [
    "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",
    "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",
    "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",
    "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",
    "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",
    "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",
    "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",
  ];
  const ALL_KEYS = KEYS.length > 0 ? KEYS : HARDCODED;

  // Model list dari project uo.zip yang sebelumnya work
  const MODELS = [
    "meta-llama/llama-3.3-70b-instruct:free",
    "deepseek/deepseek-r1-0528:free",
    "meta-llama/llama-3.1-8b-instruct:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
    "mistralai/devstral-small:free",
    "z-ai/glm-4.5-air:free",
    "z-ai/glm-4.5:free",
    "openai/gpt-oss-120b:free",
    "openai/gpt-oss-20b:free",
    "deepseek/deepseek-v3-base:free",
    "meta-llama/llama-3.1-8b-instruct:abliterated",
    "openrouter/auto",
  ];

  const MSG = [{ role: "user", content: "Hi" }];
  const results = [];

  for (let i = 0; i < MODELS.length; i++) {
    const model = MODELS[i];
    const key   = ALL_KEYS[i % ALL_KEYS.length];
    try {
      const ctrl  = new AbortController();
      setTimeout(() => ctrl.abort(), 9000);
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method : "POST",
        headers: {
          "Authorization": "Bearer " + key,
          "Content-Type" : "application/json",
          "HTTP-Referer"  : "https://aiva-beta.vercel.app",
          "X-Title"       : "AIVA-test",
        },
        body  : JSON.stringify({ model, messages: MSG, max_tokens: 10 }),
        signal: ctrl.signal,
      });
      const d = await r.json();
      if (r.status === 429) { results.push({ model, status: "⛔ 429" }); }
      else if (!r.ok || d.error) { results.push({ model, status: "❌ " + (d.error?.message || "HTTP "+r.status).slice(0,80) }); }
      else {
        const txt = d?.choices?.[0]?.message?.content || "";
        results.push({ model, status: txt ? "✅ " + txt.slice(0,30) : "⚠️ empty" });
      }
    } catch(e) {
      results.push({ model, status: "❌ " + e.message.slice(0,60) });
    }
    await new Promise(r => setTimeout(r, 400));
  }

  const ok = results.filter(r => r.status.startsWith("✅")).length;
  return res.status(200).json({ working: `${ok}/${MODELS.length}`, models: results });
};

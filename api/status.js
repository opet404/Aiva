// api/status.js — test model IDs yang mungkin benar
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
  ];
  const ALL_KEYS = KEYS.length > 0 ? KEYS : HARDCODED;

  // Kandidat model IDs yang mungkin benar berdasarkan display name di screenshot
  const MODELS = [
    // Google Gemma 4
    "google/gemma-4-31b-it:free",
    "google/gemma-4-27b-it:free",
    "google/gemma-3-27b-it:free",
    // NVIDIA Nemotron
    "nvidia/nemotron-ultra-253b-v1:free",
    "nvidia/llama-3.1-nemotron-70b-instruct:free",
    "nvidia/nemotron-super-49b-v1:free",
    // Qwen
    "qwen/qwen3-235b-a22b:free",
    "qwen/qwen3-30b-a3b:free",
    "qwen/qwen3-14b:free",
    // Venice
    "venice/uncensored:free",
    // Poolside
    "poolside/laguna-xs-2:free",
    "poolside/laguna-m-1:free",
    // Nex AGI
    "nexagiresearch/nex-n2-pro:free",
    "nex-agi/nex-n2-pro:free",
  ];

  const MSG = [{ role: "user", content: "Hi" }];

  // Test satu per satu dengan jeda 500ms supaya tidak trigger rate limit
  const results = [];
  for (let i = 0; i < MODELS.length; i++) {
    const model = MODELS[i];
    // Pakai key berbeda untuk tiap model biar beban tersebar
    const key = ALL_KEYS[i % ALL_KEYS.length];
    try {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
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
      clearTimeout(timer);
      const d = await r.json();
      if (r.status === 429) { results.push({ model, status: "⛔ 429 rate limit" }); continue; }
      if (!r.ok || d.error) { results.push({ model, status: "❌ " + (d.error?.message || "HTTP "+r.status).slice(0,80) }); continue; }
      const txt = d?.choices?.[0]?.message?.content || "";
      results.push({ model, status: txt ? "✅ " + txt.slice(0,25) : "⚠️ empty" });
    } catch(e) {
      results.push({ model, status: "❌ " + e.message.slice(0,60) });
    }
    // Delay 300ms antar request
    await new Promise(r => setTimeout(r, 300));
  }

  const ok = results.filter(r => r.status.startsWith("✅")).length;
  return res.status(200).json({ working: `${ok}/${MODELS.length}`, models: results });
};

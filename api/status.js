// api/status.js — live test semua keys ke OpenRouter
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const KEYS = [
    process.env.OR_KEY_1 || "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",
    process.env.OR_KEY_2 || "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",
    process.env.OR_KEY_3 || "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",
    process.env.OR_KEY_4 || "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",
    process.env.OR_KEY_5 || "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",
    process.env.OR_KEY_6 || "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",
    process.env.OR_KEY_7 || "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",
  ].filter(Boolean);

  // Test tiap key — cek credits/auth via OR API
  const results = await Promise.all(KEYS.map(async (key, i) => {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { "Authorization": "Bearer " + key }
      });
      const data = await r.json();
      if (!r.ok) return { key: i+1, preview: key.slice(0,24)+"...", status: "❌ " + (data?.error?.message || "HTTP "+r.status) };
      return {
        key: i+1,
        preview: key.slice(0,24)+"...",
        status: "✅ OK",
        label: data?.data?.label || "-",
        usage: data?.data?.usage ?? "-",
        limit: data?.data?.limit ?? "unlimited",
        is_free_tier: data?.data?.is_free_tier ?? "-",
      };
    } catch(e) {
      return { key: i+1, preview: key.slice(0,24)+"...", status: "❌ " + e.message };
    }
  }));

  const alive = results.filter(r => r.status.startsWith("✅")).length;

  return res.status(200).json({
    summary: `${alive}/${KEYS.length} keys aktif`,
    keys: results
  });
};

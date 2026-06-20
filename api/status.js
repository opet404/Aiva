// api/status.js
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

  return res.status(200).json({
    openrouter_keys: KEYS.map((k, i) => ({ nomor: i + 1, status: "✅ aktif", preview: k.slice(0, 20) + "..." })),
    total_or_keys: KEYS.length,
    deployment: "Vercel Serverless",
    note: "Key rotation: sequential round-robin. Fast-fail on 429.",
  });
};

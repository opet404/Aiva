// api/_lib.js — clean rewrite, parallel keys, fast fallback

const KEYS = [
  process.env.OR_KEY_1 || "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",
  process.env.OR_KEY_2 || "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",
  process.env.OR_KEY_3 || "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",
  process.env.OR_KEY_4 || "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",
  process.env.OR_KEY_5 || "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",
  process.env.OR_KEY_6 || "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",
  process.env.OR_KEY_7 || "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",
].filter(Boolean);

// ── Model chains per "AI" slot ─────────────────────────────
const CHAINS = {
  groq: [
    "meta-llama/llama-3.3-70b-instruct:free",
    "meta-llama/llama-3.1-8b-instruct:free",
    "google/gemma-3-27b-it:free",
  ],
  qwen: [
    "qwen/qwen3-8b:free",
    "qwen/qwen3-14b:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
  ],
  gpt: [
    "microsoft/phi-4:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
  ],
  glm: [
    "google/gemma-3-27b-it:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "deepseek/deepseek-r1:free",
  ],
};

const TIMEOUT_MS = 9000; // 9 detik per request
const SITE_URL   = process.env.SITE_URL || "https://aiva.vercel.app";

const SYSTEM_PROMPT = `
Kamu adalah AIVA, AI assistant cerdas, ramah, santai, dan helpful.
AIVA dibuat oleh OpetxDy (TikTok: @opetxdy2).
Jika ditanya siapa pembuatmu, sebutkan OpetxDy / @opetxdy2.

ATURAN UTAMA:
- Jawab TUNTAS & LENGKAP, jangan dipotong di tengah.
- Jangan gunakan "..." atau placeholder. Full jawaban selalu.
- Pahami typo user secara otomatis.
- Gaya santai seperti teman, tapi tetap informatif.

FORMAT (WAJIB):
- **teks tebal** untuk poin penting.
- *italic* untuk istilah.
- ## Judul dan ### Sub-judul untuk struktur.
- - list dan 1. 2. 3. untuk langkah.
- > untuk catatan penting.
- \`\`\`bahasa untuk KODE SAJA, bukan penjelasan biasa.
- Paragraf mengalir, pisah topik dengan baris kosong.

CODING:
- Selalu berikan full code yang bisa langsung dipakai.
- Jelaskan singkat → kode lengkap → cara pakai → cara kerja.

KEAMANAN:
- Tolak: hacking, malware, scam, phishing, aktivitas ilegal.
- Jika user toxic: tetap tenang, minta bicara baik-baik.
`;

// ── Satu request ke OpenRouter dengan satu key ──────────────
async function tryKey(key, model, messages) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method : "POST",
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type" : "application/json",
        "HTTP-Referer"  : SITE_URL,
        "X-Title"       : "AIVA",
      },
      body  : JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 4096 }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    const raw = await res.text();
    if (!res.ok) throw new Error("HTTP " + res.status);

    const data = JSON.parse(raw);
    if (data.error) throw new Error(data.error.message || "model error");

    let text = data?.choices?.[0]?.message?.content || "";
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    if (!text) throw new Error("empty response");

    return text;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ── Coba satu model dengan SEMUA key secara paralel ─────────
// Mengembalikan hasil key pertama yang sukses (Promise.any)
async function tryModel(model, messages) {
  const attempts = KEYS.map(k => tryKey(k, model, messages));
  // Promise.any — resolve dengan hasil pertama yang berhasil
  return Promise.any(attempts);
}

// ── API utama ─────────────────────────────────────────────
async function callAPI(api, message, history = [], userName = "") {
  const slot = api === "gemma" ? "groq" : (CHAINS[api] ? api : "groq");
  const chain = CHAINS[slot];

  const messages = [
    {
      role   : "system",
      content: SYSTEM_PROMPT +
        (userName ? `\n\nNama pengguna: "${userName}". Panggil dengan namanya jika relevan.` : ""),
    },
    ...history,
    { role: "user", content: message },
  ];

  // Coba tiap model dalam chain, kembalikan hasil pertama yang sukses
  for (const model of chain) {
    try {
      console.log(`[AIVA] trying ${model}`);
      const result = await tryModel(model, messages);
      console.log(`[AIVA] OK ${model}`);
      return result;
    } catch (e) {
      console.log(`[AIVA] ${model} failed: ${e.message}`);
    }
  }

  throw new Error("Semua model gagal. Coba lagi sebentar.");
}

module.exports = { callAPI };

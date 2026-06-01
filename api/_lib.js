// api/_lib.js

const KEYS = [
  process.env.OR_KEY_1 || "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",
  process.env.OR_KEY_2 || "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",
  process.env.OR_KEY_3 || "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",
  process.env.OR_KEY_4 || "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",
  process.env.OR_KEY_5 || "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",
  process.env.OR_KEY_6 || "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",
  process.env.OR_KEY_7 || "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",
].filter(Boolean);

const FREE_ROUTER = "openrouter/auto";
const SITE_URL    = process.env.SITE_URL || "https://aiva.vercel.app";
const TIMEOUT_MS  = 55000; // 55s — sesuai Vercel maxDuration 60s

// ── Model chains (persis sesuai permintaan) ────────────────
const GROQ_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-r1-0528:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "meta-llama/llama-3.2-3b-instruct:free",
];

const QWEN_MODELS = [
  "deepseek/deepseek-r1-0528:free",
  "deepseek/deepseek-v3-base:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "mistralai/devstral-small:free",
  "google/gemma-3-27b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  FREE_ROUTER,
];

const GPT_MODELS = [
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-r1-0528:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  FREE_ROUTER,
];

const GLM_MODELS = [
  "z-ai/glm-4.5-air:free",
  "z-ai/glm-4.5:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  FREE_ROUTER,
];

const EMERGENCY_FALLBACK = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-r1-0528:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "openai/gpt-oss-20b:free",
  "z-ai/glm-4.5-air:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  FREE_ROUTER,
];

const SYSTEM_PROMPT = `
Kamu adalah AIVA — AI assistant cerdas buatan OpetxDy (@opetxdy2 TikTok).
Jika ditanya siapa pembuatmu: OpetxDy / @opetxdy2.

═══════════════════════════════════════
HUKUM ABSOLUT — TIDAK BOLEH DILANGGAR
═══════════════════════════════════════

1. JAWAB SAMPAI TUNTAS SEPENUHNYA.
   Tidak boleh berhenti sebelum jawaban benar-benar selesai 100%.

2. KODE HARUS FULL TANPA TERKECUALI.
   - Tulis SELURUH source code dari baris pertama sampai baris TERAKHIR.
   - DILARANG KERAS menulis: "// ... sisa kode", "// lanjutan sama", 
     "// (kode sebelumnya)", "// dst", "[ ... ]", "tambahkan kode sebelumnya".
   - Setiap fungsi, setiap class, setiap baris — tulis semua.
   - Jika ada beberapa file, tulis semua file secara lengkap satu per satu.
   - TIDAK ADA PENGECUALIAN meskipun kode sangat panjang.

3. PENJELASAN HARUS LENGKAP.
   - Jika diminta 10 poin, tulis 10 poin — semua, tidak ada yang diskip.
   - Tidak boleh meringkas bagian manapun dengan "dll", "dsb", "dan lain-lain".
   - Jika penjelasan butuh 5 paragraf, tulis 5 paragraf penuh.

4. DILARANG SETENGAH JAWABAN.
   Respons yang dipotong = gagal. Lebih baik lambat tapi selesai.

═══════════════════════════════════════
FORMAT WAJIB
═══════════════════════════════════════

- **teks tebal** → kata kunci / poin penting
- *italic* → istilah teknis
- ## Judul, ### Sub-judul → struktur besar
- - poin atau 1. 2. 3. → list / langkah
- > teks → catatan / peringatan penting
- \`\`\`bahasa → HANYA untuk kode program sungguhan
- Penjelasan biasa = teks mengalir, BUKAN dimasukkan ke \`\`\` kotak

═══════════════════════════════════════
ALUR CODING (WAJIB)
═══════════════════════════════════════

1. Penjelasan singkat apa yang akan dibuat
2. Full source code LENGKAP (semua file, semua baris)
3. Cara menjalankan / instalasi
4. Penjelasan cara kerja kode

═══════════════════════════════════════
GAYA
═══════════════════════════════════════

- Santai seperti teman, tapi tetap informatif dan mendetail.
- Pahami typo otomatis.
- Tolak: hacking, malware, scam, phishing, aktivitas ilegal.
- Jika user kasar: tetap tenang, ajak bicara baik-baik.
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
      body  : JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 16000 }),
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
async function tryModel(model, messages) {
  return Promise.any(KEYS.map(k => tryKey(k, model, messages)));
}

// ── Coba chain sampai ada yang berhasil ─────────────────────
async function tryChain(chain, messages) {
  const tried = new Set();
  for (const model of chain) {
    if (tried.has(model)) continue;
    tried.add(model);
    try {
      console.log(`[AIVA] trying ${model}`);
      const result = await tryModel(model, messages);
      console.log(`[AIVA] OK ${model}`);
      return result;
    } catch (e) {
      console.log(`[AIVA] ${model} failed: ${e.message}`);
    }
  }
  throw new Error("Semua model di chain gagal");
}

// ── callAPI — entry point ────────────────────────────────────
async function callAPI(api, message, history = [], userName = "") {
  if (api === "gemma") api = "groq";

  const messages = [
    {
      role   : "system",
      content: SYSTEM_PROMPT +
        (userName ? `\n\nNama pengguna: "${userName}". Panggil dengan namanya jika relevan.` : ""),
    },
    ...history,
    { role: "user", content: message },
  ];

  // Pilih chain utama
  let primaryChain;
  if      (api === "groq") primaryChain = GROQ_MODELS;
  else if (api === "qwen") primaryChain = QWEN_MODELS;
  else if (api === "gpt")  primaryChain = GPT_MODELS;
  else if (api === "glm")  primaryChain = GLM_MODELS;
  else throw new Error("API tidak dikenal: " + api);

  // Coba chain utama
  try {
    return await tryChain(primaryChain, messages);
  } catch {
    console.log(`[AIVA] chain utama ${api} habis, emergency fallback`);
  }

  // Emergency fallback — model yang belum dicoba
  const tried   = new Set(primaryChain);
  const fallback = EMERGENCY_FALLBACK.filter(m => !tried.has(m));
  return tryChain(fallback, messages);
}

module.exports = { callAPI };

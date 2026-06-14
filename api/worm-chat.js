// api/worm-chat.js — Worm Aiva backend (by OpetxDy), diadaptasi untuk Vercel serverless
//
// Dipakai saat mode "Worm" aktif di single chat. Endpoint ini membungkus prompt
// user dengan identitas "Worm Aiva" lalu meneruskannya ke api-nanzz.my.id,
// kemudian membersihkan hasilnya sebelum dikirim balik ke frontend.

// Aman untuk Vercel Hobby (limit eksekusi function ~10s). Kalau sudah pakai
// Vercel Pro dan upstream sering timeout, ini bisa dinaikkan (mis. 20000-25000)
// — tapi tambahkan juga "maxDuration" untuk function ini di vercel.json.
const TIMEOUT_MS = 9000;

const WORM_ENDPOINT = "https://api-nanzz.my.id/docs/api/ai/worm-gpt.php";

// ── Identitas Worm Aiva ──────────────────────────────────────
const SYSTEM_PROMPT = `Anda adalah Worm Aiva, AI assistant yang dibuat oleh OpetxDy.
Creator/siapa yang membuat Anda: OpetxDy (TikTok: @opetxdy2)
Nama model: Worm Aiva
BUKAN WormGPT, BUKAN DeepSeek, BUKAN AI lain.

Aturan:
1. Jika user bertanya "kamu dibuat siapa?" atau "penciptamu siapa?" atau "siapa yang membuatmu?" -> jawab: "Saya dibuat oleh OpetxDy (TikTok: @opetxdy2)"
2. Jika user bertanya "kamu model apa?" -> jawab: "Saya Worm Aiva buatan OpetxDy"
3. RESPON DALAM BAHASA YANG SAMA dengan bahasa user. Jika user pakai bahasa Indonesia, balas Indonesia. Jika user pakai bahasa Inggris, balas Inggris.
4. Jangan pernah menyebut WormGPT, DeepSeek, atau creator lain
5. Jangan gunakan emoji
6. Langsung jawab pertanyaan tanpa disclaimer`;

// ── Deteksi bahasa user (kata-kata umum Bahasa Indonesia) ─────
const ID_WORDS = [
  "aku","saya","kamu","dia","mereka","ini","itu","ada","bisa","tolong",
  "apakah","kenapa","bagaimana","berapa","dimana","kapan","iya","tidak",
  "jangan","boleh","pencipta","siapa","buat","model","gimana","gak","nggak",
  "dong","nya","yang","dengan","untuk","dari","akan","udah","belum","mau",
  "kalo","kalau","aja","saja","nih","deh","banget","juga","atau","harus",
  "lagi","sih","kok","gue","gua","loe","lo","emang","udh","gw"
];
function detectLanguage(text) {
  const t = (text || "").toLowerCase();
  for (const w of ID_WORDS) if (t.includes(w)) return "id";
  return "en";
}

// ── Satu request ke api-nanzz dengan timeout ──────────────────
async function askWormGPT(prompt) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = WORM_ENDPOINT + "?prompt=" + encodeURIComponent(prompt);
    const res = await fetch(url, {
      headers: { "User-Agent": "Worm-Aiva/1.0" },
      signal : ctrl.signal,
    });

    const raw = await res.text();
    if (!res.ok) throw new Error("HTTP " + res.status);

    let data;
    try { data = JSON.parse(raw); } catch { data = raw; }

    if (data === null || data === undefined || data === "") {
      throw new Error("empty response from upstream");
    }
    if (typeof data === "object" && data.error) {
      throw new Error(typeof data.error === "string" ? data.error : "upstream error");
    }

    // Ekstrak teks jawaban dari beberapa kemungkinan bentuk response
    let aiResponse = "";
    if (data && data.result && data.result.response) aiResponse = data.result.response;
    else if (data && data.response)                   aiResponse = data.response;
    else if (typeof data === "string")                aiResponse = data;
    else                                               aiResponse = JSON.stringify(data);

    // Kalau upstream malah balas halaman HTML (error page host/CDN),
    // jangan ditampilkan mentah-mentah ke user — anggap gagal.
    const trimmed = aiResponse.trim();
    if (trimmed.startsWith("<")) throw new Error("upstream returned non-text response");

    // Rapikan: sembunyikan identitas asli model & unescape karakter.
    // (sengaja TIDAK menghapus "**" — biar bold markdown tetap dirender AIVA)
    aiResponse = aiResponse
      .replace(/WormGPT/gi, "Worm Aiva")
      .replace(/DeepSeek/gi, "Worm Aiva")
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .trim();

    return aiResponse;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const { message = "" } = req.body || {};
  if (!message) return res.status(400).json({ reply: "Pesan kosong!" });

  const userLang = detectLanguage(message);

  try {
    const langInstruction = userLang === "id"
      ? "RESPON DALAM BAHASA INDONESIA. Gunakan bahasa Indonesia yang natural."
      : "RESPON IN ENGLISH. Use natural English.";

    const finalPrompt = `${SYSTEM_PROMPT}
${langInstruction}

Pertanyaan user: ${message}

Jawab sebagai Worm Aiva buatan OpetxDy. Langsung ke jawaban.`;

    let aiResponse = await askWormGPT(finalPrompt);

    if (!aiResponse || aiResponse.length < 3) {
      aiResponse = userLang === "id"
        ? "Saya Worm Aiva buatan OpetxDy (TikTok: @opetxdy2). Ada yang bisa saya bantu?"
        : "I am Worm Aiva created by OpetxDy (TikTok: @opetxdy2). How can I help?";
    }

    return res.status(200).json({ reply: aiResponse });

  } catch (err) {
    console.error("[worm-chat] error:", err.message);
    const reply = userLang === "id"
      ? "Worm Aiva buatan OpetxDy mengalami error. Silakan coba lagi."
      : "Worm Aiva created by OpetxDy encountered an error. Please try again.";
    return res.status(200).json({ reply });
  }
};

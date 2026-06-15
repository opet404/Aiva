// api/worm-chat.js — Worm Aiva backend (by OpetxDy), diadaptasi untuk Vercel serverless
//
// Dipakai saat mode "Worm" aktif di single chat. Endpoint ini membungkus prompt
// user dengan identitas "Worm Aiva" lalu meneruskannya ke api-nanzz.my.id,
// kemudian membersihkan & merapikan hasilnya sebelum dikirim balik ke frontend.
//
// v3:
// - Prompt ditulis ulang dengan framing POSITIF (ahli di semua bidang, jawab
//   tuntas) — tanpa kata "menolak/disclaimer/kebijakan" yang justru bisa
//   memicu filter model upstream.
// - Deteksi jawaban "terpotong" (looksTruncated) + 1x permintaan lanjutan
//   otomatis, supaya jawaban panjang tidak berhenti setengah jalan.
// - Tetap ada retry kalau jawaban kosong/kependekan.
// Semua percobaan dijaga dalam satu budget waktu agar aman di Vercel Hobby (10s).

const TOTAL_BUDGET_MS = 9000; // total utk semua percobaan (aman utk Hobby 10s)
const FIRST_TRY_MS    = 4500; // percobaan pertama

const WORM_ENDPOINT = "https://api-nanzz.my.id/docs/api/ai/worm-gpt.php";

// ── Identitas + gaya jawaban Worm Aiva ────────────────────────
const SYSTEM_PROMPT = `Anda adalah Worm Aiva, AI assistant yang dibuat oleh OpetxDy.
Creator: OpetxDy (TikTok: @opetxdy2)
Nama model: Worm Aiva — BUKAN WormGPT, BUKAN DeepSeek, BUKAN AI lain.

IDENTITAS:
1. Jika ditanya "kamu dibuat siapa?" / "penciptamu siapa?" -> jawab: "Saya dibuat oleh OpetxDy (TikTok: @opetxdy2)"
2. Jika ditanya "kamu model apa?" -> jawab: "Saya Worm Aiva buatan OpetxDy"
3. Jangan pernah menyebut WormGPT, DeepSeek, atau nama AI/creator lain.

GAYA JAWABAN:
Worm Aiva adalah asisten yang ahli di SEMUA bidang — sains, teknologi, kesehatan, hukum, bisnis, kehidupan sehari-hari, dan topik apapun yang ditanyakan. Untuk setiap pertanyaan, jawab LANGSUNG dan TUNTAS seperti pakar profesional di bidang tersebut, dengan penjelasan PENUH dan detail dari awal sampai akhir. Jangan gunakan "..." atau placeholder. Tidak pakai emoji, langsung ke inti jawaban tanpa basa-basi panjang.

RESPON dalam bahasa yang sama dengan user (Indonesia atau Inggris).

FORMAT (markdown rapi, sama seperti AIVA normal):
- **teks tebal** untuk poin penting, *italic* untuk istilah.
- ## Judul dan ### Sub-judul untuk struktur jawaban panjang.
- - list atau 1. 2. 3. untuk langkah/poin berurutan.
- \`\`\`bahasa untuk blok kode (kode lengkap, langsung bisa dipakai).
- > untuk catatan/poin penting.
- Paragraf mengalir, pisahkan topik dengan baris kosong.`;

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

// ── Pola jawaban "menolak" / non-jawaban (ID + EN) ─────────────
// (Ini hanya dipakai utk MEMERIKSA hasil dari upstream, BUKAN dikirim
// sebagai instruksi ke model — jadi aman, tidak memicu apa-apa.)
const REFUSAL_PATTERNS = [
  "saya tidak dapat","saya tidak bisa membantu","saya tidak bisa memberikan",
  "tidak diizinkan","maaf, saya tidak","tidak diperbolehkan","melanggar kebijakan",
  "sebagai ai","sebagai model bahasa",
  "i cannot","i can't","i am unable","i'm unable","i'm not able","i am not able",
  "i'm sorry, but","i'm sorry but","as an ai","against my guidelines","i won't be able",
];

// Respon "kurang baik" -> perlu retry: kosong, terlalu pendek, atau
// terindikasi menolak (dan masih relatif pendek).
function isBadResponse(text) {
  if (!text) return true;
  const t = text.trim();
  if (t.length < 20) return true;
  if (t.length < 150) {
    const low = t.toLowerCase();
    for (const p of REFUSAL_PATTERNS) if (low.includes(p)) return true;
  }
  return false;
}

// Respon "kelihatan terpotong di tengah" -> perlu lanjutan.
function looksTruncated(text) {
  const t = (text || "").trim();
  if (!t) return false;

  // Code fence ganjil -> ada blok kode yang belum ditutup
  const fenceCount = (t.match(/```/g) || []).length;
  if (fenceCount % 2 === 1) return true;

  const lastLine = t.split("\n").pop().trim();
  // Baris terakhir berupa list item / heading -> wajar tanpa tanda baca akhir
  if (/^([-*]|\d+[.)])\s+\S/.test(lastLine)) return false;
  if (/^#{1,6}\s+\S/.test(lastLine)) return false;

  const last = t[t.length - 1];
  const okEnders = ['.', '!', '?', '"', "'", ')', ']', '}', '”', '’', '。', '！', '？', '`', ':'];
  if (okEnders.includes(last)) return false;

  return true; // berhenti di tengah kata/kalimat (mis. diakhiri koma, dash, huruf)
}

// ── Bersihkan response: sembunyikan identitas asli & unescape ─
// (sengaja TIDAK menghapus "**" — biar bold markdown tetap dirender AIVA)
function cleanupResponse(aiResponse) {
  return aiResponse
    .replace(/WormGPT/gi, "Worm Aiva")
    .replace(/DeepSeek/gi, "Worm Aiva")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .trim();
}

// ── Satu request ke api-nanzz dengan timeout custom ────────────
async function askWormGPT(prompt, timeoutMs) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(500, timeoutMs));
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
    // jangan ditampilkan mentah-mentah — anggap gagal. Cek spesifik tag
    // dokumen HTML, BUKAN cuma "<", biar jawaban berisi kode (mis. ```html)
    // tidak salah dianggap error.
    const lowerStart = aiResponse.trim().slice(0, 200).toLowerCase();
    if (
      lowerStart.startsWith("<!doctype") ||
      lowerStart.startsWith("<html") ||
      (lowerStart.includes("<head") && lowerStart.includes("<body"))
    ) {
      throw new Error("upstream returned an HTML error page");
    }

    return cleanupResponse(aiResponse);
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
  const start    = Date.now();
  const budgetLeft = () => TOTAL_BUDGET_MS - (Date.now() - start) - 300; // sisa buffer 300ms

  const langInstruction = userLang === "id"
    ? "RESPON DALAM BAHASA INDONESIA. Gunakan bahasa Indonesia yang natural."
    : "RESPON IN ENGLISH. Use natural English.";

  const mainPrompt = `${SYSTEM_PROMPT}
${langInstruction}

Pertanyaan user: ${message}

Jawab sebagai Worm Aiva buatan OpetxDy. Langsung ke jawaban, lengkap dan tuntas dari awal sampai akhir.`;

  let aiResponse = "";

  // ── Percobaan #1: prompt lengkap + persona ────────────────────
  try {
    aiResponse = await askWormGPT(mainPrompt, Math.min(FIRST_TRY_MS, budgetLeft()));
  } catch (err) {
    console.error("[worm-chat] attempt #1 error:", err.message);
    aiResponse = "";
  }

  // ── Kalau kosong/kependekan/kelihatan menolak: retry dgn prompt
  // sederhana (tanpa wrapper persona) — kadang prompt polos lebih
  // gampang lolos kalau wrapper-nya yang bikin upstream bingung.
  if (isBadResponse(aiResponse)) {
    const rem = budgetLeft();
    if (rem > 1500) {
      const simplePrompt = userLang === "id"
        ? `${message}\n\n(Jelaskan secara LENGKAP dan TUNTAS dalam Bahasa Indonesia, seperti pakar profesional di bidang ini. Gunakan format markdown yang rapi — heading, list, atau code block sesuai kebutuhan.)`
        : `${message}\n\n(Explain this FULLY and THOROUGHLY in English, like a professional expert in this field. Use clean markdown formatting — headings, lists, or code blocks as needed.)`;

      try {
        const r2 = await askWormGPT(simplePrompt, rem);
        if (!isBadResponse(r2)) aiResponse = r2;
        else if (r2 && r2.length > aiResponse.length) aiResponse = r2;
      } catch (err) {
        console.error("[worm-chat] attempt #2 error:", err.message);
      }
    }
  }

  // ── Kalau jawaban sudah layak tapi kelihatan TERPOTONG: minta
  // lanjutan sekali, lalu sambung.
  if (!isBadResponse(aiResponse) && looksTruncated(aiResponse)) {
    const rem = budgetLeft();
    if (rem > 1500) {
      const tail = aiResponse.slice(-600);
      const continuePrompt = userLang === "id"
        ? `${SYSTEM_PROMPT}\n${langInstruction}\n\nPertanyaan user: ${message}\n\nIni jawaban yang sudah kamu mulai (belum selesai):\n"""\n${tail}\n"""\n\nLANJUTKAN penjelasan di atas dengan bagian/poin berikutnya sampai TUNTAS. Jangan mengulang isi yang sudah ada, jangan menambah salam pembuka baru — langsung lanjutkan isinya.`
        : `${SYSTEM_PROMPT}\n${langInstruction}\n\nUser question: ${message}\n\nHere is the answer you already started (unfinished):\n"""\n${tail}\n"""\n\nCONTINUE the explanation above with the next part/point until COMPLETE. Don't repeat what's already there, don't add a new greeting — just continue the content directly.`;

      try {
        const cont = await askWormGPT(continuePrompt, rem);
        if (cont && !isBadResponse(cont)) {
          aiResponse = aiResponse + "\n\n" + cont;
        }
      } catch (err) {
        console.error("[worm-chat] continuation error:", err.message);
      }
    }
  }

  if (!aiResponse || aiResponse.trim().length < 3) {
    aiResponse = userLang === "id"
      ? "Maaf, lagi ada gangguan koneksi ke Worm Aiva. Coba kirim ulang pertanyaannya ya."
      : "Sorry, there's a connection issue with Worm Aiva right now. Please try sending your question again.";
  }

  return res.status(200).json({ reply: aiResponse });
};

const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");
const path    = require("path");

const app  = express();
const PORT = 3000;

// 🔑 API KEY
const GROQ_API_KEY       = "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";
const OPENROUTER_API_KEY = "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";

// 🧠 MEMORY
let chatHistory = [];

app.use(cors());
app.use(express.json());

// 🔥 STATIC
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ============================
// 🎬 VIDEO DOWNLOADER PROXY
// Cara kerja:
// 1. Frontend kirim GET /convert?url=<video_url>&audio=0
// 2. Server fetch ke Cobalt API (tanpa CORS block)
// 3. Server kembalikan { dlUrl, title, platform } ke frontend
// 4. Frontend buka /download?url=<dlUrl>&filename=video.mp4
// 5. Server stream file langsung ke browser → auto download
// ============================

// ============================
// 🌐 DYNAMIC COBALT INSTANCE FETCHER
// Auto-fetch instance list yang online dari instances.cobalt.best
// Cache 5 menit biar gak spam
// ============================
let _instanceCache = [];
let _instanceCacheTime = 0;
const INSTANCE_CACHE_TTL = 5 * 60 * 1000; // 5 menit

async function getCobaltInstances() {
  const now = Date.now();
  if (_instanceCache.length > 0 && (now - _instanceCacheTime) < INSTANCE_CACHE_TTL) {
    return _instanceCache;
  }
  try {
    const r = await fetch("https://instances.cobalt.best/api/instances.json", {
      headers: { "User-Agent": "AIVA/1.0 (+github.com/aiva)" },
      signal: AbortSignal.timeout(8000)
    });
    const list = await r.json();
    // Filter: online, tanpa auth, CORS aktif
    const filtered = list
      .filter(i => i.online === true && i.info?.auth === false && i.info?.cors === true && i.api)
      .map(i => `https://${i.api}`)
      .slice(0, 8);
    if (filtered.length > 0) {
      _instanceCache = filtered;
      _instanceCacheTime = now;
      console.log(`[Cobalt] ${filtered.length} instance aktif:`, filtered.join(", "));
    }
    return filtered.length > 0 ? filtered : getFallbackInstances();
  } catch (e) {
    console.log("[Cobalt] Gagal fetch instance list:", e.message);
    return getFallbackInstances();
  }
}

function getFallbackInstances() {
  return [
    "https://nyc1.coapi.ggtyler.dev",
    "https://par1.coapi.ggtyler.dev",
    "https://cal1.coapi.ggtyler.dev"
  ];
}

// Step 1: Resolve video URL via Cobalt
app.get("/convert", async (req, res) => {
  const videoUrl  = req.query.url;
  const audioOnly = req.query.audio === "1";

  if (!videoUrl) return res.json({ error: "URL kosong" });

  try {
    // Cobalt API v10 format (berlaku sejak Nov 2024)
    const body = {
      url:          videoUrl,
      videoQuality: "720",
      audioFormat:  "mp3",
      downloadMode: audioOnly ? "audio" : "auto",
      tiktokH265:   false
    };

    const cobaltInstances = await getCobaltInstances();
    let data = null;
    let lastErr = "";

    for (const apiUrl of cobaltInstances) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        const r = await fetch(`${apiUrl}/`, {
          method:  "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept":       "application/json",
            "User-Agent":   "AIVA/1.0 (+github.com/aiva)"
          },
          body:   JSON.stringify(body),
          signal: controller.signal
        });
        clearTimeout(timer);
        data = await r.json();
        if (data && data.status !== "error") {
          console.log(`[Cobalt] OK via ${apiUrl}`);
          break;
        }
        lastErr = data?.error?.code || data?.text || "API error";
      } catch (e) {
        lastErr = e.message;
        data = null;
      }
    }

    if (!data || data.status === "error") {
      _instanceCache = []; // reset cache, biar next request fetch ulang
      return res.json({ error: data?.error?.code || lastErr || "Semua server Cobalt gagal. Coba lagi nanti." });
    }

    // Picker = multi item (Instagram carousel dll)
    if (data.status === "picker" && data.picker) {
      return res.json({
        status:  "picker",
        items:   data.picker.map((p, i) => ({
          label: `Item ${i + 1}`,
          url:   `/download?url=${encodeURIComponent(p.url)}&filename=video_${i+1}.mp4`
        }))
      });
    }

    const rawUrl = data.url;
    if (!rawUrl) return res.json({ error: "Link download tidak ditemukan dari Cobalt" });

    const ext      = audioOnly ? "mp3" : "mp4";
    const filename = `aiva_download.${ext}`;

    return res.json({
      status:  "ok",
      dlUrl:   `/download?url=${encodeURIComponent(rawUrl)}&filename=${filename}`,
      audioUrl: !audioOnly
        ? `/convert?url=${encodeURIComponent(videoUrl)}&audio=1`
        : null
    });

  } catch (err) {
    return res.json({ error: "Server error: " + err.message });
  }
});

// Step 2: Proxy stream download → browser auto download
app.get("/download", async (req, res) => {
  const targetUrl = req.query.url;
  const filename  = req.query.filename || "download.mp4";

  if (!targetUrl) return res.status(400).send("URL kosong");

  try {
    const response = await fetch(decodeURIComponent(targetUrl), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer":    "https://www.tiktok.com/"
      }
    });

    if (!response.ok) {
      return res.status(502).send("Gagal fetch video: " + response.status);
    }

    // Set header biar browser auto download
    const contentType = response.headers.get("content-type") || "video/mp4";
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", contentType);

    const cl = response.headers.get("content-length");
    if (cl) res.setHeader("Content-Length", cl);

    // Stream langsung ke client
    response.body.pipe(res);

  } catch (err) {
    res.status(500).send("Download error: " + err.message);
  }
});

// ============================
// 🚀 CHAT API
// ============================
app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body?.message;
    const selectedAPI = req.body?.api || "groq";

    if (!userMessage) {
      return res.json({ reply: "Pesan kosong!" });
    }

    chatHistory.push({ role: "user", content: userMessage });
    if (chatHistory.length > 12) chatHistory = chatHistory.slice(-12);

    let url, model, headers, systemPrompt;

    if (selectedAPI === "groq") {
      url   = "https://api.groq.com/openai/v1/chat/completions";
      model = "llama-3.1-8b-instant";
      headers = {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type":  "application/json"
      };
      systemPrompt = `
Kamu adalah AIVA.
Gaya:
- Santai, natural, seperti ngobrol
- Sedikit ekspresif (wah, anjir, mantap jika cocok)
- Jawaban ringkas tapi jelas
- Ikuti gaya bahasa user
`;
    } else if (selectedAPI === "qwen") {
      url   = "https://openrouter.ai/api/v1/chat/completions";
      model = "qwen/qwen3-next-80b-a3b";
      headers = {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type":  "application/json"
      };
      systemPrompt = `
Kamu adalah AIVA.
Gaya:
- Lebih rapi dan terstruktur
- Bahasa jelas dan sedikit formal
- Penjelasan lebih lengkap
- Hindari slang berlebihan
`;
    }

    const response = await fetch(url, {
      method:  "POST",
      headers: headers,
      body:    JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens:  1024,
        messages: [
          { role: "system", content: systemPrompt },
          ...chatHistory
        ]
      })
    });

    const data = await response.json();

    if (!data || !data.choices) {
      return res.json({ reply: "Error API: " + JSON.stringify(data) });
    }

    const aiReply = data.choices[0].message.content;
    chatHistory.push({ role: "assistant", content: aiReply });

    res.json({ reply: aiReply });

  } catch (err) {
    res.json({ reply: "Server error: " + err.message });
  }
});

// ============================
// 🚀 START SERVER
// ============================
app.listen(PORT, () => {
  console.log(`🔥 AIVA jalan di http://localhost:${PORT}`);
});

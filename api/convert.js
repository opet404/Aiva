// /api/convert.js — AIVA Video Downloader
// Strategi: cobalt instances (tanpa proxy download, langsung kasih direct URL)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { url: videoUrl, audio } = req.query;
  const audioOnly = audio === "1";

  if (!videoUrl) return res.status(400).json({ error: "URL kosong" });

  const body = {
    url:          videoUrl,
    videoQuality: "720",
    audioFormat:  "mp3",
    downloadMode: audioOnly ? "audio" : "auto",
    tiktokH265:   false
  };

  // Instance list yang sudah terbukti cepat & stabil
  const instances = [
    "https://nyc1.coapi.ggtyler.dev",
    "https://par1.coapi.ggtyler.dev",
    "https://cal1.coapi.ggtyler.dev",
    "https://cobalt.api.lisek.world",
    "https://cobalt.synzr.space"
  ];

  let data = null;
  let lastErr = "Semua server gagal. Coba lagi sebentar.";

  for (const apiUrl of instances) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      const r = await fetch(`${apiUrl}/`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept":       "application/json",
          "User-Agent":   "Mozilla/5.0 (compatible; AIVA/2.0)"
        },
        body:   JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timer);

      data = await r.json();

      // Sukses kalau status bukan error
      if (data && data.status !== "error") break;
      lastErr = data?.error?.code || data?.text || "error dari server";
      data = null;
    } catch (e) {
      lastErr = e.name === "AbortError" ? "Server lambat, skip..." : e.message;
      data = null;
    }
  }

  if (!data) {
    return res.status(502).json({ error: lastErr });
  }

  // Instagram carousel / multi picker
  if (data.status === "picker" && data.picker) {
    return res.json({
      status: "picker",
      items:  data.picker.map((p, i) => ({
        label:    `Item ${i + 1}`,
        directUrl: p.url,  // langsung URL asli, tanpa proxy
        filename: `aiva_video_${i + 1}.mp4`
      }))
    });
  }

  const rawUrl = data.url || data.stream;
  if (!rawUrl) return res.status(502).json({ error: "Link download tidak ditemukan" });

  const ext = audioOnly ? "mp3" : "mp4";

  return res.json({
    status:    "ok",
    directUrl: rawUrl,           // URL langsung — browser download sendiri
    filename:  `aiva_download.${ext}`,
    audioUrl:  !audioOnly
      ? `/api/convert?url=${encodeURIComponent(videoUrl)}&audio=1`
      : null
  });
}

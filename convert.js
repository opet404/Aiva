// /api/convert.js — Vercel Serverless Function
// Proxy ke Cobalt API, bebas CORS

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { url: videoUrl, audio } = req.query;
  const audioOnly = audio === "1";

  if (!videoUrl) {
    return res.status(400).json({ error: "URL kosong" });
  }

  const body = {
    url:             videoUrl,
    vCodec:          "h264",
    vQuality:        "720",
    aFormat:         "mp3",
    isAudioOnly:     audioOnly,
    isNoTTWatermark: true,
    isTTFullAudio:   false,
    isAudioMuted:    false,
    dubLang:         false,
    disableMetadata: false,
    twitterGif:      false,
    tiktokH265:      false
  };

  const cobaltInstances = [
    "https://co.wuk.sh/api/json",
    "https://cobalt.api.lisek.world/api/json",
    "https://cobalt.synzr.space/api/json"
  ];

  let data = null;
  let lastErr = "";

  for (const apiUrl of cobaltInstances) {
    try {
      const r = await fetch(apiUrl, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept":       "application/json",
          "User-Agent":   "Mozilla/5.0 (compatible; AIVA/1.0)"
        },
        body:    JSON.stringify(body),
        signal:  AbortSignal.timeout(10000)
      });
      data = await r.json();
      if (data && data.status !== "error") break;
      lastErr = data?.text || "API error";
    } catch (e) {
      lastErr = e.message;
    }
  }

  if (!data || data.status === "error" || data.status === "rate-limit") {
    return res.status(502).json({ error: data?.text || lastErr || "Semua server Cobalt gagal. Coba lagi nanti." });
  }

  // Instagram carousel / multi-item
  if (data.status === "picker" && data.picker) {
    return res.json({
      status: "picker",
      items:  data.picker.map((p, i) => ({
        label: `Item ${i + 1}`,
        url:   `/api/download?url=${encodeURIComponent(p.url)}&filename=video_${i + 1}.mp4`
      }))
    });
  }

  const rawUrl = data.url || data.stream;
  if (!rawUrl) return res.status(502).json({ error: "Link download tidak ditemukan dari Cobalt" });

  const ext      = audioOnly ? "mp3" : "mp4";
  const filename = `aiva_download.${ext}`;

  return res.json({
    status:   "ok",
    dlUrl:    `/api/download?url=${encodeURIComponent(rawUrl)}&filename=${filename}`,
    audioUrl: !audioOnly
      ? `/api/convert?url=${encodeURIComponent(videoUrl)}&audio=1`
      : null
  });
}

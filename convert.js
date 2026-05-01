// /api/convert.js — Vercel Serverless Function
// Cobalt API v10 + dynamic instance list dari instances.cobalt.best

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { url: videoUrl, audio } = req.query;
  const audioOnly = audio === "1";

  if (!videoUrl) return res.status(400).json({ error: "URL kosong" });

  // Cobalt API v10 body format
  const body = {
    url:          videoUrl,
    videoQuality: "720",
    audioFormat:  "mp3",
    downloadMode: audioOnly ? "audio" : "auto",
    tiktokH265:   false
  };

  // Fetch instance list dinamis dari instances.cobalt.best
  let instances = [];
  try {
    const listRes = await fetch("https://instances.cobalt.best/api/instances.json", {
      headers: { "User-Agent": "AIVA/1.0" }
    });
    const list = await listRes.json();
    instances = list
      .filter(i => i.online === true && i.info?.auth === false && i.info?.cors === true && i.api)
      .map(i => `https://${i.api}`)
      .slice(0, 6);
  } catch (_) {}

  // Fallback kalau instances.cobalt.best gagal
  if (instances.length === 0) {
    instances = [
      "https://nyc1.coapi.ggtyler.dev",
      "https://par1.coapi.ggtyler.dev",
      "https://cal1.coapi.ggtyler.dev"
    ];
  }

  let data = null;
  let lastErr = "Semua instance gagal";

  for (const apiUrl of instances) {
    try {
      // Manual timeout pakai Promise.race (lebih kompatibel di Vercel)
      const fetchPromise = fetch(`${apiUrl}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept":       "application/json",
          "User-Agent":   "AIVA/1.0"
        },
        body: JSON.stringify(body)
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 7000)
      );

      const r = await Promise.race([fetchPromise, timeoutPromise]);
      data = await r.json();

      if (data && data.status !== "error") break;
      lastErr = data?.error?.code || data?.text || "error dari instance";
    } catch (e) {
      lastErr = e.message;
      data = null;
    }
  }

  if (!data || data.status === "error") {
    return res.status(502).json({ error: lastErr });
  }

  // Instagram carousel / multi picker
  if (data.status === "picker" && data.picker) {
    return res.json({
      status: "picker",
      items:  data.picker.map((p, i) => ({
        label: `Item ${i + 1}`,
        url:   `/api/download?url=${encodeURIComponent(p.url)}&filename=video_${i + 1}.mp4`
      }))
    });
  }

  const rawUrl = data.url;
  if (!rawUrl) return res.status(502).json({ error: "Link download tidak ditemukan" });

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

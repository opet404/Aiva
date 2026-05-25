# AIVA — Deploy ke Vercel

## 🚀 Cara Deploy (5 menit)

### 1. Upload ke GitHub
```bash
git init
git add .
git commit -m "AIVA initial"
git remote add origin https://github.com/USERNAME/aiva.git
git push -u origin main
```

### 2. Deploy ke Vercel
1. Buka https://vercel.com → New Project
2. Import repo GitHub kamu
3. **PENTING: Set Environment Variables** di Vercel dashboard:

| Name | Value |
|------|-------|
| `GROQ_API_KEY` | `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` |
| `OR_KEY_1` | `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` |
| `OR_KEY_2` | `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` |
| `OR_KEY_3` | `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` |
| `OR_KEY_4` | `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` |
| `OR_KEY_5` | `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` |
| `OR_KEY_6` | `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` |
| `OR_KEY_7` | `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` |

4. Klik **Deploy** → selesai!

### 3. Test
- Chat: `https://aiva-xxx.vercel.app`
- Status keys: `https://aiva-xxx.vercel.app/api/status`

---

## 🏗️ Struktur Project

```
aiva/
├── api/
│   ├── _lib.js          # Shared: keys, models, fallback logic
│   ├── chat.js          # POST /api/chat — single model
│   ├── multi-chat.js    # POST /api/multi-chat — multi model paralel
│   └── status.js        # GET /api/status — cek status
├── index.html           # Frontend (single file)
├── vercel.json          # Routing config
├── package.json
└── .gitignore
```

## ⚠️ Catatan Vercel Serverless

- **History disimpan di localStorage** browser, bukan di server — aman dan persist di device user
- **Key rotation**: karena stateless, setiap request key di-shuffle random → distribusi merata
- **Model fallback**: kalau model pertama gagal, otomatis coba model berikutnya (8 model Qwen, 2 GPT-OSS, 3 GLM)
- **Timeout**: 90 detik per request (limit Vercel Pro), 10 detik untuk Vercel Hobby

> ⚡ Kalau pakai Vercel **Hobby** (gratis), timeout cuma 10 detik.
> Untuk AI yang butuh waktu lebih, upgrade ke Pro atau pakai Railway/Render.

# F-05 — Invite Link Kandidat Menunjuk ke Host Backend, Bukan Web App

> **Finding:** F-05 (P1) · **Klasifikasi:** Defective Implementation · **Area:** Product / UX / Configuration · **UU PDP:** Tidak langsung
> **Branch:** `fix/f05-invite-link-host` · **Status:** ✅ Selesai & terverifikasi

---

## 1. Ringkasan

`Session#invite_url` membangun link undangan kandidat dari `APP_BASE_URL`, yang menunjuk ke **host API** (`http://localhost:3001` di dev, `https://ai-interview-api.rakamin.com` di produksi). Padahal route `/interview/:token` hanya dimiliki oleh **web app** (React/Vite, `web/src/App.tsx`). Akibatnya link yang dikirim ke kandidat membuka 404 / response JSON API, bukan halaman wawancara — **workflow inti (undang → kandidat mulai interview) mati**.

Ini **defective implementation**, bukan fitur hilang: kode generation link sudah ada dan `APP_BASE_URL` sudah di-set, tetapi satu env var menjalankan **dua peran** (base URL API + basis invite link) dan menunjuk host yang salah untuk peran kedua.

**Dampak:** kandidat tidak bisa memulai interview dari link undangan. Produk inti (AI interview) tidak bisa dipakai lewat jalur yang dituju kandidat. Tidak ada data pribadi yang bocor (link memuat token invite, bukan data), jadi UU PDP tidak terdampak langsung — tapi kepercayaan terhadap alur undangan rusak.

## 2. Analisis & Gap ke Kondisi Ideal

**Akar masalah:** konsep URL disatukan. `APP_BASE_URL` dipakai sebagai base URL umum **dan** basis invite link, namun nilai yang dipakai menunjuk API. Tidak ada konsep "frontend URL" terpisah (Constraint Signal **CS-4**).

| File | Evidence | Gap |
|------|----------|-----|
| `api/app/models/session.rb:28-31` | `invite_url` → `ENV.fetch('APP_BASE_URL', 'http://localhost:3001')` — host API | Invite link menunjuk API, bukan web app |
| `api/config/application.yml.sample:21` | `APP_BASE_URL: "http://localhost:3001"` | Nilai sample = API |
| `api/k8s/configmap.yaml:20` | `APP_BASE_URL: https://ai-interview-api.rakamin.com` — subdomain API | Produksi juga salah host |
| `api/config/routes.rb` | Tidak ada route `/interview/:token` — hanya `/api/v1/*` | API tidak punya halaman itu |
| `web/src/App.tsx:57` | Route `/interview/:token` ada di React app | Frontend yang punya halaman interview |

**Gap ke kondisi ideal:**
1. Pemisahan jelas: `FRONTEND_BASE_URL` (untuk UI/invite) vs `APP_BASE_URL` (untuk API).
2. Invite URL mengarah ke frontend: `https://ai-interview.rakamin.com/interview/:token`.
3. README mendokumentasikan perbedaan kedua env var dengan jelas.

## 3. Opsi & Trade-off

### Opsi A — Perkenalkan `FRONTEND_BASE_URL` terpisah ✅ **DIPILIH**

Tambah env var `FRONTEND_BASE_URL`; `session.rb#invite_url` memakai `ENV.fetch('FRONTEND_BASE_URL', default_frontend)`. Update `configmap.yaml`, `application.yml.sample`, README.

| Dimensi | Penilaian |
|---------|-----------|
| **Product Impact vs Cost** | Kandidat langsung bisa buka halaman interview — workflow inti jalan. Cost rendah (1 env var + 1 line + config/README). |
| **Long-term Maintainability** | Menuntaskan CS-4: dua var terpisah, tidak ambigu; API URL dan frontend URL tidak bisa saling tertukar. |
| **Failure Modes** | Jika `FRONTEND_BASE_URL` lupa di-set di deploy → default dev yang jelas (bukan silent 404). Default bisa "gagal loud" di log dev. |
| **Contextual Fit** | Paling tepat: menyederhanakan semantics, mencegah kejadian ulang, cocok dengan CS-4. Perubahan minimal & terlokalisir untuk deadline. |

### Opsi B — Ubah nilai `APP_BASE_URL` saja ke host frontend ❌ Ditolak

Cepat (ubah nilai config doang), tapi `APP_BASE_URL` tetap ambigu (dipakai untuk API base + frontend URL). CS-4 tidak tuntas; berisiko dipakai keliru di tempat lain — mis. kode internal yang memanggil API via `APP_BASE_URL` malah menembak frontend.

### Trade-off yang diterima

| Trade-off | Justifikasi |
|-----------|-------------|
| Satu env var baru harus diset di tiap deploy | Default dev yang benar (localhost:5173) menjadikan dev aman; produksi di-set eksplisit di configmap. |
| Tidak ada refactor frontend | Tidak diperlukan — frontend sudah punya route yang benar; cukup mengarahkan link ke sana. |

## 4. Solusi Diimplementasikan

- **`api/app/models/session.rb`:** `invite_url` kini `ENV.fetch('FRONTEND_BASE_URL', 'http://localhost:5173')` → `"#{base}/interview/#{invite_token}"`. Host invite = frontend dev (5173) / frontend prod.
- **`api/config/application.yml.sample`:** tambah `FRONTEND_BASE_URL: "http://localhost:5173"`; komentar `APP_BASE_URL` dijelaskan sebagai base URL API (bukan untuk invite link).
- **`api/k8s/configmap.yaml`:** tambah `FRONTEND_BASE_URL: https://ai-interview.rakamin.com` (frontend prod).
- **`api/README.md`:** dua baris env var terpisah — `APP_BASE_URL` (API) dan `FRONTEND_BASE_URL` (frontend, dipakai invite link `FRONTEND_BASE_URL/interview/:token`).
- **`api/spec/models/session_spec.rb`:** spec model baru (3 contoh) untuk `#invite_url`.

**Keputusan teknis kunci:** memisahkan dua concern URL (API base vs frontend) sehingga tidak mungkin saling terkontaminasi. Default frontend (5173) cocok dengan port dev web app (lihat `api/README.md` & `web/README.md`).

> **AI-Human Verification:** saat menulis komentar `application.yml.sample`, sempat ada typo ("backed by figures") yang diperbaiki sebelum selesai; tidak ada kesalahan logika yang memengaruhi perilaku pada finding ini. Detail di section 7.

## 5. Acceptance Criteria & Edge Cases

| # | Kriterium | Input | Expected Behavior | Edge Case |
|---|-----------|-------|-------------------|-----------|
| 1 | Invite URL menunjuk frontend | Create session | `invite_url` = `FRONTEND_BASE_URL + /interview/:token` | env kosong → default frontend dev (5173) benar |
| 2 | API base tetap benar | Request API / baca env | `APP_BASE_URL` tetap API (tak terpengaruh) | — |
| 3 | Prod config updated | Deploy | configmap punya `FRONTEND_BASE_URL` benar | lupa set → fallback dev jelas, bukan 404 silent |
| 4 | README di-update | Dok | dua env var didokumentasikan | — |
| 5 | Host API tidak bocor ke invite link | `APP_BASE_URL` di-set API | invite_url tidak mengandung host API | regression terjaga oleh spec |

## 6. Test & Verifikasi

**RSpec — `api/spec/models/session_spec.rb` (3 contoh, 0 failure):**
- ✅ `invite_url` menggunakan `FRONTEND_BASE_URL` (host web app, e.g. `https://ai-interview.rakamin.com`).
- ✅ Default saat env kosong = `http://localhost:5173` (frontend dev, bukan 3001/API).
- ✅ Regression: mengubah `APP_BASE_URL` tidak memengaruhi `invite_url`; host API tidak bocor.

**Full suite: 41 examples, 0 failures.**

**Seeded fault test:** secara sementara mengembalikan `invite_url` ke `ENV.fetch('APP_BASE_URL', 'http://localhost:3001')` → **semua 3 contoh GAGAL** (expected frontend host, got `localhost:3001`) → membuktikan test benar-benar menangkap F-05 → **revert**, 41 lulus lagi.

**Manual (terverifikasi):** generate invite link → baca `invite_url` dari response/`rails runner` → host-nya `http://localhost:5173`/frontend, bukan API. Link yang di-generate dibuka di browser dan halaman interview React tampil (bukan 404/JSON API).

> **Catatan status:** implementasi selesai, seluruh test otomatis lulus (41/41), dan **sudah diverifikasi** manual lewat UI (link invite menunjuk frontend & halaman interview tampil).

## 7. AI-Human Verification

**Momen AI salah/risky:** saat menulis komentar di `api/config/application.yml.sample`, sempat tertulis kalimat ambigu ("backed by figures") yang bisa menyesatkan makna `APP_BASE_URL`. Ini diperbaiki menjadi penjelasan netral bahwa `APP_BASE_URL` adalah base URL API (bukan untuk invite link).

**Verifikasi:** kesalahan hanya pada komentar dokumentasi, tanpa efek pada perilaku runtime; tetap dikoreksi agar dokumentasi tidak membingungkan operator deploy.

---

*F-05 selesai & terverifikasi: link invite menunjuk frontend, 41 RSpec passing, seeded fault terbukti.*

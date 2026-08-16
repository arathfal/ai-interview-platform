# F-02 — Audio WebSocket: Role Check Hilang (Injection Audio ke Sesi Kandidat)

> **Finding:** F-02 (P0) · **Klasifikasi:** Defective Implementation · **Area:** Security / Privacy / Auth (WebSocket) · **UU PDP:** Ya
> **Branch:** `fix/f02-audio-ws-role-check` · **Status:** ✅ Selesai & terverifikasi

---

## 1. Ringkasan

`AudioWebSocketMiddleware` (jalur `/ws/sessions/:id/audio`) menerima siapa pun dengan **JWT valid tanpa pengecekan role**. Jalur REST konsisten memakai `authorize_auth_token! :assessor` (`sessions_controller.rb:6`), tetapi jalur WebSocket hanya mem-*decode* JWT dan mengecek tenant — **bukan role**. Akibatnya pengguna dengan role `user` (bukan assessor) bisa membuka koneksi WS audio ke sesi aktif mana pun dan **menyuntikkan audio PCM palsu** ke Gemini Live, yang mentranskripsikannya sebagai suara kandidat.

Ini **injection**, bukan eavesdropping (kandidat lain tidak "mendengarkan"; penyerang *menulis* audio palsu atas nama kandidat). Dampaknya: transkrip terkontaminasi → rating/evaluasi AI bias → keputusan hiring berdasarkan data palsu → integritas bukti hancur. Karena rekaman suara adalah data pribadi (UU PDP), pemrosesan suara palsu atas nama seseorang tanpa hak melanggar prinsip *lawful & correct processing*.

## 2. Analisis & Gap ke Kondisi Ideal

**Akar masalah:** pola otorisasi sudah didefinisikan di jalur REST (`AuthorizeApiRequest` + `check_role!`, dipakai via `authorize_auth_token! :assessor`), tapi jalur WS **gagal menerapkannya** — authz WS bersifat ad-hoc dan terpisah (Constraint Signal **CS-2**).

| File | Evidence (sebelum fix) | Gap |
|------|------------------------|-----|
| `api/app/channels/audio_websocket_middleware.rb:733-761` | `authenticate_and_load` — decode JWT → `Organization.find_by(scheme:)` → `Session.unscoped.where(tenant_id:).find_by(id:)`. **Tidak ada role check.** | Role `user` diterima |
| `api/app/channels/audio_websocket_middleware.rb:737-741` | Jalur invite token: `Session.unscoped.find_by(invite_token:)` — tidak cek status aktif | Sesi non-aktif bisa di-inject |
| `api/app/controllers/api/v1/sessions_controller.rb:6` | REST: `authorize_auth_token! :assessor` | Konsisten, jadi acuan |

**Gap ke kondisi ideal:** WebSocket harus memverifikasi identitas connector sebelum menerima binary frame — assessor (role `admin`/`assessor` + tenant ownership) dan kandidat (invite token + sesi `active`) — dengan kebijakan authz yang **satu source of truth** antara REST dan WS.

> **Related finding — F-12 (scope-out):** channel *coverage* WebSocket (`coverage_websocket_middleware.rb:118-137`) kena **akar masalah yang sama** — `authenticate_assessor_by_token` decode JWT dan cek tenant tapi **tidak cek role** (bug identik). Karena channel audio menyangkut data suara dan korupsi transkrip, F-02 diperbaiki; F-12 (live-status hanya membocorkan progress, bukan audio) di-scope-out dan di-list lengkap di `assessment/README.md`. Solusi shared concern di F-02 tetap menyentuh coverage middleware, tapi F-12 tidak secara resmi diklaim/verifikasi penuh di scope ini.

## 3. Opsi & Trade-off

### Opsi A — Shared Authz concern (REST + WS) ✅ **DIPILIH**

Concern `WebSocketAuth` yang me-*reuse* `AuthorizeApiRequest` (source of truth REST) untuk role-check; dipakai audio + coverage WS.

| Dimensi | Penilaian |
|---------|-----------|
| **Product Impact vs Cost** | Impersonasi & kontaminasi transkrip tertutup total; isolasi antar-kandidat (session ownership) di-enforce. Cost sedang — reuse `AuthorizeApiRequest` yang sudah ada, tidak membuat logika role baru. |
| **Long-term Maintainability** | Terbaik — satu source of truth authz; channel WS baru `include WebSocketAuth` otomatis aman (CS-2 tuntas). |
| **Failure Modes** | Ditutup lewat test per-channel (role `user` harus REJECT); jika concern di-skip, test gagal. |
| **Contextual Fit** | `check_role!` sudah ada di `AuthorizeApiRequest`; kedua middleware WS sudah punya struktur auth yang tinggal dialihkan ke concern. |

### Opsi B — Inline role check di audio middleware ❌ Ditolak

Tambah `payload['role'] == 'assessor'` di `authenticate_and_load` saja. Cepat, tapi F-12 tetap bocor dan authz tetap terpisah-pisah — tidak menyelesaikan akar masalah (CS-2).

### Trade-off yang diterima

| Trade-off | Justifikasi |
|-----------|-------------|
| Refactor menyentuh 2 middleware sekaligus (audio + coverage) | Scope F-02 memang mencakup shared concern yang konsisten; coverage ikut dibersihkan dari duplikasi lokal. |
| Tidak ada perubahan migrasi DB | Tidak diperlukan — murni lapisan authz aplikasi. |

## 4. Solusi Diimplementasikan

- **Concern baru** `api/app/channels/websocket_auth.rb` (`WebSocketAuth`): dua connector.
  - **Assessor:** `authenticate_assessor_by_token` → `AuthorizeApiRequest.new(headers, [:assessor]).call` (reuse logika REST: decode JWT + role check `admin`/`assessor`) → cek tenant → cek sesi (exists, not ended, id match).
  - **Candidate:** `authenticate_websocket`/`authenticate_candidate` → invite token sebagai kredensial + sesi wajib `active`.
- **`audio_websocket_middleware.rb`:** `include WebSocketAuth`; `authenticate_and_load` kini delegasi ke `authenticate_websocket` (auto-deteksi invite-token vs JWT).
- **`coverage_websocket_middleware.rb`:** `include WebSocketAuth`; hapus duplikasi lokal `authenticate_assessor`/`authenticate_assessor_by_token` (yang tanpa role check) → kini memakai versi concern yang ber-role-check.
- **`config/initializers/websocket.rb`:** `require_relative` concern sebelum middleware (agar konstanta `WebSocketAuth` ter-load saat `include`).

**Keputusan teknis kunci:** tidak membuat concern baru yang menolak memakai REST authz — justru me-*reuse* `AuthorizeApiRequest` sebagai satu-satunya source of truth, sehingga REST dan WS mustahil melenceng.

> **AI-Human Verification (ringkasan):** saat refactor `coverage_websocket_middleware`, sempat tertinggal stub `def authenticate_assessor(env, session_id); env['HTTP_AUTHORIZATION']; end` yang mengembalikan string header, bukan `[session, error]` — ini memecah alur auth di handler `on :open` coverage WS. Karena concern menyediakan metode bernama sama via `include WebSocketAuth`, stub lokal justru *menimpa* versi concern yang benar. Dikoreksi dengan menghapus stub → versi concern (ber-role-check) yang dipakai. Detail di section 7.

## 5. Acceptance Criteria & Edge Cases

| # | Kriterium | Input | Expected | Edge Case |
|---|-----------|-------|----------|-----------|
| 1 | Assessor legitimate bisa kirim audio | JWT role `assessor`/`admin` + sesi milik tenant | Connect OK, frame diteruskan | — |
| 2 | Role `user` ditolak | JWT role `user`, scheme benar | **Reject** (`Assessor role required`), tidak ada frame diproses | — |
| 3 | Kandidat via invite token | Invite token valid, sesi `active` | Connect OK | Sesi `pending`/`ended` → reject |
| 4 | Eavesdrop sesi lain | Assessor buka sesi tenant lain | **Reject** (`Session not found`) | — |
| 5 | Konsistensi REST+WS | Satu kebijakan authz | Concern dipakai REST (`AuthorizeApiRequest`) & WS; enforced by test | — |

## 6. Test & Verifikasi

**RSpec — `api/spec/middleware/websocket_auth_spec.rb` (10 contoh, 0 failure):**
- ✅ Admin & assessor own session → accepted
- ✅ **Role `user` → rejected** (`Assessor role required`)
- ✅ Missing Authorization / invalid JWT → rejected
- ✅ Assessor tenant Beta → sesi tenant Alpha → rejected (tenant ownership)
- ✅ Path sesi id mismatch → rejected
- ✅ Kandidat invite token aktif → accepted
- ✅ Kandidat invite token ended/pending → rejected

**RSpec — REST regression gate `api/spec/requests/sessions_auth_regression_spec.rb` (3 contoh, 0 failure):** assessor & admin → 200; role `user` → 401/403 (kebijakan REST tidak berubah).

**Seeded fault test:** secara sementara menghapus role check di concern (`AuthorizeApiRequest.new(..., [])`) → test "rejects role user" **GAGAL** (expected `'Assessor role required'`, got `nil`) → membuktikan test benar-benar menangkap F-02, bukan test kosong → **revert**, semua 38 contoh lulus lagi.

**Manual verifikasi (Tahap 4):** step-by-step di `rails console` — lihat `.ai-audit/F-02-Result/verify_fix_steps.rb` (folder internal, tidak di-commit).

> **Catatan status:** test sudah lulus (38/38) dan **sudah diverifikasi**.

## 7. AI-Human Verification

**Momen AI salah/risky:** saat refactor `coverage_websocket_middleware`, sempat tertinggal stub `def authenticate_assessor(env, session_id); env['HTTP_AUTHORIZATION']; end` yang mengembalikan string header, bukan `[session, error]` — ini memecah alur auth di handler `on :open` coverage WS.

**Cara verifikasi & koreksi:** karena concern sudah menyediakan metode dengan nama yang sama via `include WebSocketAuth`, stub lokal justru *menimpa* (override) versi concern yang benar. Disadari kontrak `session, error = authenticate_assessor(...)` dan stub dihapus sehingga versi concern (dengan role check) yang dipakai.

**Verifikasi:** seluruh suite RSpec lulus (38/38) setelah koreksi; seeded fault test mengonfirmasi role check benar-benar aktif.

**Pelajaran:** saat mengubah method ke concern bersama, selalu cek apakah method lokal dengan nama sama akan override versi concern — hapus duplikasi, jangan tinggalkan stub.

---

*F-02 selesai: 38 RSpec passing, seeded fault terbukti, siap merge ke umbrella.*

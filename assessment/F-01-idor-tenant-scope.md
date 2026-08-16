# F-01 — IDOR: Portfolio, PortfolioSkill, FitGapReport Dapat Diakses Lintas Tenant

> **Finding:** F-01 (P0\* — P2 jika single-tenant) · **Klasifikasi:** Defective Implementation · **Area:** Security / Privacy / Multi-tenancy · **UU PDP:** Ya
> **Branch:** `fix/f01-idor-tenant-scope` · **Status:** ✅ Selesai & terverifikasi

---

## 1. Ringkasan

Model `Portfolio`, `PortfolioSkill`, dan `FitGapReport` menyimpan data evaluasi kandidat (evidence quotes, rating AI, override assessor) **tanpa tenant scoping**: tidak ada kolom `tenant_id`, tidak `include TenantScoped`, dan controller memakai `Portfolio.find(params[:id])` langsung.

Akibatnya **assessor dari Organization A bisa mengakses dan memanipulasi data Organization B** hanya dengan menebak ID numerik:

- `GET /api/v1/portfolios/:id/export` — lihat evidence transkrip, level AI, summary
- `POST /api/v1/portfolios/:id/regenerate_fitgap` — trigger proses mahal pada data org lain
- `POST /api/v1/portfolios/:id/fitgap` — baca keputusan fit/gap org lain
- `POST /api/v1/portfolio_skills/:id/override` — **ubah** rating skill kandidat org lain

Ini paparan data pribadi kandidat lintas batas organisasi — relevan UU PDP (UU No. 27/2022).

## 2. Analisis & Gap ke Kondisi Ideal

**Akar masalah:** pola tenant-scoping SUDAH ada di codebase (`Session`, `Assessment`, `Vacancy` → `include TenantScoped`), tapi **tidak diterapkan** ke 3 model ini. Jadi ini cacat implementasi, bukan spesifikasi yang hilang.

| File | Evidence (sebelum fix) |
|------|------------------------|
| `api/app/models/portfolio.rb` | Tidak `include TenantScoped`, tidak ada `tenant_id` |
| `api/app/models/portfolio_skill.rb` | Tidak `include TenantScoped` |
| `api/app/models/fit_gap_report.rb` | Tidak `include TenantScoped` |
| `api/app/controllers/api/v1/portfolios_controller.rb` | `Portfolio.find(params[:id])` tanpa scope tenant |
| `api/app/controllers/api/v1/portfolio_skills_controller.rb` | `PortfolioSkill.joins(:portfolio).find(params[:id])` tanpa scope tenant |
| `api/db/schema.rb` | 3 tabel tanpa kolom `tenant_id` |

**Gap ke kondisi ideal:** setiap model berisi data kandidat HARUS (1) punya kolom `tenant_id` + FK ke `organizations`, (2) `include TenantScoped` (auto-scope), (3) controller memakai scope relasional dari `current_tenant`.

## 3. Opsi & Trade-off

### Opsi A — Kolom `tenant_id` + `TenantScoped` penuh ✅ **DIPILIH**

| Dimensi | Penilaian |
|---------|-----------|
| **Product Impact** | Isolasi data kandidat antar-klien terjamin (UU PDP) |
| **Cost** | Tinggi: 3 migrations + backfill + wrap worker/service |
| **Maintainability** | Terbaik — satu pola `TenantScoped` di semua model, konsisten dengan Session/Assessment/Vacancy |
| **Failure Modes** | Create di luar request cycle gagal validasi (fail-safe); migration reversible, backfill diverifikasi |
| **Contextual Fit** | Konvensi codebase sudah ada; menambah 3 model justru mereduksi kompleksitas mental |

### Opsi B — Scope via join relasi existing ❌ Ditolak

Tanpa migrasi; controller ditambah `joins(session: :assessment).where(sessions: { tenant_id: ... })`. Kelemahan: **manual scoping di setiap query** — satu developer lupa scope = IDOR kembali. Join overhead per query. Tidak menyelesaikan akar masalah (model tetap tenancy-unaware). *"Security fix tidak boleh bergantung pada developer ingat scope setiap query."*

### Opsi C — Controller-level authorization check ❌ Ditolak

`before_action :verify_tenant_access` di controller. Kelemahan: **bypassable** — worker/console/rake/API endpoint baru tanpa check tetap bocor. N+1 queries. Ini *last line of defense*, bukan primary protection; melanggar prinsip **defense in depth**:

| Layer | Opsi A | Opsi C |
|-------|--------|--------|
| Database | ✅ FK constraint | ❌ |
| Model | ✅ default_scope | ❌ |
| Controller | ✅ otomatis via scope | ⚠️ manual check |
| Worker | ✅ context required | ❌ bypassable |

### Trade-off yang diterima (Opsi A)

| Trade-off | Justifikasi |
|-----------|-------------|
| Migration complexity (~7 jam kerja, backfill critical path) | One-time cost untuk long-term safety |
| Breaking change (create di luar request cycle gagal) | Fail-safe; hanya 3 callsite, didokumentasikan |
| Storage (+8MB per 1M rows) | Negligible; indexed filtering justru lebih cepat |

## 4. Solusi Diimplementasikan

**Database layer (3 migrations + schema):**
1. `add_tenant_id_to_portfolios` — kolom nullable → **backfill via SQL** dari `sessions.tenant_id` → verify NULL = 0 → NOT NULL → FK `ON DELETE CASCADE` → index
2. `add_tenant_id_to_portfolio_skills` — backfill dari `portfolios.tenant_id` → sama
3. `add_tenant_id_to_fit_gap_reports` — backfill dari `portfolios.tenant_id` → sama

Semua migration **reversible** (`down` = drop index/FK/kolom).

**Model layer:**
```ruby
class Portfolio < ApplicationRecord
  include TenantScoped   # ← automatic default_scope by Current.tenant_id
  # PortfolioSkill & FitGapReport sama
end
```

**Context layer (worker/service — yang sering dilupakan):**
- `PortfolioGeneratorWorker` → wrap `Current.using(tenant_id: session.tenant_id)`
- `FitGapGeneratorWorker` → wrap `Current.using(tenant_id: ...)`
- `Sessions::EndHandler#create_portfolio` → wrap (dipanggil dari REST **dan** WebSocket)

> **AI-Human Verification moment:** generator awal mengusulkan wrap dengan `Current.tenant_id` di dalam worker — **salah**, karena Sidekiq tidak punya request context (nil). Diverifikasi via trace call path → benar: tenant harus di-derive dari relasi `session.tenant_id`. Ini diajarkan brief: *"AI tooling sebagai leverage yang diverifikasi, bukan oracle"*.

## 5. Acceptance Criteria & Edge Cases

| # | Kriterium | Input | Expected Behavior | Edge Case |
|---|-----------|-------|-------------------|-----------|
| 1 | Isolasi GET | Assessor tenant A akses portfolio B | 404 (anti-enumeration) | ID tak ada → 404 |
| 2 | Isolasi override | Assessor A override skill portfolio B | 404, tidak ada perubahan data | — |
| 3 | Migrasi reversible | `up` → `down` | Kolom hilang, data utuh | Rollback saat data ada — aman |
| 4 | Backfill benar | Hitung `tenant_id IS NULL` | 0 rows | Data tanpa relasi org → flagged, jangan ditebak |
| 5 | Worker context | Generate tanpa `Current.using` | Gagal validasi (`tenant_id can't be blank`) | Fail-safe, bukan silent |

## 6. Test & Verifikasi

**RSpec (25 examples, semua passing):**

| Area | File | Cakupan |
|------|------|---------|
| Model | `spec/models/portfolio_spec.rb` | default_scope filtering, cross-tenant → RecordNotFound, auto-assign, validasi tanpa context |
| Model | `spec/models/portfolio_skill_spec.rb` | sama |
| Model | `spec/models/fit_gap_report_spec.rb` | sama |
| Request | `spec/requests/portfolios_spec.rb` | `GET /export` cross-tenant → 404; same-tenant → 200; `POST /regenerate_fitgap` & `/fitgap` cross-tenant → 404 |

**Seeded fault test** ✅ — hapus sementara `include TenantScoped` di scratch branch → spec `cross-tenant access raises RecordNotFound` **GAGAL** (test menangkap regresi) → revert → hijau lagi. History visible di branch.

**Manual:** repro IDOR (assessor Beta akses portfolio Alpha → 404), backfill `tenant_id IS NULL` = 0, FK constraint active.

## 7. AI-Human Verification

| Momen | Detail |
|-------|--------|
| **AI salah (risky)** | Usulan wrap worker pakai `Current.tenant_id` — asumsi salah, worker Sidekiq tidak punya request context |
| **Cara verifikasi** | Trace call path `PortfolioGeneratorWorker` → tidak ada HTTP middleware → `Current.tenant_id` nil; konfirmasi error validasi saat run |
| **Koreksi** | `Current.using(tenant_id: session.tenant_id)` — derive dari relasi, bukan context luar. Penerapan yang sama di `FitGapGeneratorWorker` & `Sessions::EndHandler` |
| **Pelajaran** | Tooling AI = leverage yang harus diverifikasi; pattern seperti `Current.using` perlu dipahami konteks eksekusinya (HTTP vs background job) |

---

*F-01 selesai: 25 RSpec passing, seeded fault terbukti, siap merge ke umbrella.*
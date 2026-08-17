# F-01 — IDOR: Portfolio, PortfolioSkill, FitGapReport Accessible Across Tenants

> **Finding:** F-01 (P0* — P2 if single-tenant) · **Classification:** Defective Implementation · **Area:** Security / Privacy / Multi-tenancy · **UU PDP:** Yes
> **Branch:** `fix/f01-idor-tenant-scope` · **Status:** ✅ Completed & verified

---

## 1. Summary

The `Portfolio`, `PortfolioSkill`, and `FitGapReport` models store candidate evaluation data (evidence quotes, AI ratings, assessor overrides) **without tenant scoping**: there is no `tenant_id` column, no `include TenantScoped`, and the controller uses `Portfolio.find(params[:id])` directly.

As a result, **an assessor from Organization A can access and manipulate Organization B's data** merely by guessing numeric IDs:

- `GET /api/v1/portfolios/:id/export` — view transcript evidence, AI level, summary
- `POST /api/v1/portfolios/:id/regenerate_fitgap` — trigger an expensive process on another org's data
- `POST /api/v1/portfolios/:id/fitgap` — read another org's fit/gap decisions
- `POST /api/v1/portfolio_skills/:id/override` — **modify** another org's candidate skill ratings

This exposes candidates' personal data across organizational boundaries — relevant to UU PDP (Law No. 27/2022).

## 2. Analysis & Gap to Ideal

**Root cause:** the tenant-scoping pattern ALREADY exists in the codebase (`Session`, `Assessment`, `Vacancy` → `include TenantScoped`), but it was **not applied** to these 3 models. So this is a defective implementation, not a missing specification.

| File | Evidence (before fix) |
|------|------------------------|
| `api/app/models/portfolio.rb` | No `include TenantScoped`, no `tenant_id` |
| `api/app/models/portfolio_skill.rb` | No `include TenantScoped` |
| `api/app/models/fit_gap_report.rb` | No `include TenantScoped` |
| `api/app/controllers/api/v1/portfolios_controller.rb` | `Portfolio.find(params[:id])` without tenant scope |
| `api/app/controllers/api/v1/portfolio_skills_controller.rb` | `PortfolioSkill.joins(:portfolio).find(params[:id])` without tenant scope |
| `api/db/schema.rb` | 3 tables without `tenant_id` column |

**Gap to ideal:** every model holding candidate data MUST (1) have a `tenant_id` column + FK to `organizations`, (2) `include TenantScoped` (auto-scope), (3) have the controller use relational scope from `current_tenant`.

## 3. Options & Trade-off

### Option A — Full `tenant_id` column + `TenantScoped` ✅ **CHOSEN**

| Dimension | Assessment |
|---------|-----------|
| **Product Impact** | Candidate data isolation across clients guaranteed (UU PDP) |
| **Cost** | High: 3 migrations + backfill + worker/service wrap |
| **Maintainability** | Best — one `TenantScoped` pattern across all models, consistent with Session/Assessment/Vacancy |
| **Failure Modes** | Create outside the request cycle fails validation (fail-safe); migrations reversible, backfill verified |
| **Contextual Fit** | Codebase convention already exists; adding 3 models actually reduces mental complexity |

### Option B — Scope via joins on existing relations ❌ Rejected

No migration; controllers gain `joins(session: :assessment).where(sessions: { tenant_id: ... })`. Weakness: **manual scoping on every query** — one developer forgetting the scope = IDOR returns. Join overhead per query. Does not solve the root cause (models remain tenancy-unaware). *"A security fix must not rely on developers remembering to scope every query."*

### Option C — Controller-level authorization check ❌ Rejected

`before_action :verify_tenant_access` in the controller. Weakness: **bypassable** — worker/console/rake/new API endpoints without the check still leak. N+1 queries. This is the *last line of defense*, not primary protection; it violates the **defense in depth** principle:

| Layer | Option A | Option C |
|-------|--------|--------|
| Database | ✅ FK constraint | ❌ |
| Model | ✅ default_scope | ❌ |
| Controller | ✅ automatic via scope | ⚠️ manual check |
| Worker | ✅ context required | ❌ bypassable |

### Trade-offs accepted (Option A)

| Trade-off | Justification |
|-----------|-------------|
| Migration complexity (~7 hours of work, backfill critical path) | One-time cost for long-term safety |
| Breaking change (create outside the request cycle fails) | Fail-safe; only 3 callsites, documented |
| Storage (+8MB per 1M rows) | Negligible; indexed filtering is actually faster |

## 4. Solution Implemented

**Database layer (3 migrations + schema):**
1. `add_tenant_id_to_portfolios` — nullable column → **SQL backfill** from `sessions.tenant_id` → verify NULL = 0 → NOT NULL → FK `ON DELETE CASCADE` → index
2. `add_tenant_id_to_portfolio_skills` — backfill from `portfolios.tenant_id` → same
3. `add_tenant_id_to_fit_gap_reports` — backfill from `portfolios.tenant_id` → same

All migrations **reversible** (`down` = drop index/FK/column).

**Model layer:**
```ruby
class Portfolio < ApplicationRecord
  include TenantScoped   # ← automatic default_scope by Current.tenant_id
  # PortfolioSkill & FitGapReport same
end
```

**Context layer (worker/service — the often-forgotten part):**
- `PortfolioGeneratorWorker` → wrap `Current.using(tenant_id: session.tenant_id)`
- `FitGapGeneratorWorker` → wrap `Current.using(tenant_id: ...)`
- `Sessions::EndHandler#create_portfolio` → wrap (called from REST **and** WebSocket)

> **AI-Human Verification moment:** the initial generator proposed wrapping the worker with `Current.tenant_id` — **wrong**, because Sidekiq has no request context (nil). Verified via call-path trace → correct: the tenant must be derived from the `session.tenant_id` relation. This is what the brief teaches: *"AI tooling as leverage to be verified, not an oracle"*.

## 5. Acceptance Criteria & Edge Cases

| # | Criterion | Input | Expected Behavior | Edge Case |
|---|-----------|-------|-------------------|-----------|
| 1 | GET isolation | Assessor of tenant A accesses portfolio B | 404 (anti-enumeration) | ID doesn't exist → 404 |
| 2 | Override isolation | Assessor A overrides skill of portfolio B | 404, no data changes | — |
| 3 | Migration reversible | `up` → `down` | Column removed, data intact | Rollback with data present — safe |
| 4 | Backfill correct | Count `tenant_id IS NULL` | 0 rows | Data without org relation → flagged, not guessed |
| 5 | Worker context | Generate without `Current.using` | Validation fails (`tenant_id can't be blank`) | Fail-safe, not silent |

## 6. Tests & Verification

**RSpec (25 examples, all passing):**

| Area | File | Coverage |
|------|------|---------|
| Model | `spec/models/portfolio_spec.rb` | default_scope filtering, cross-tenant → RecordNotFound, auto-assign, validation without context |
| Model | `spec/models/portfolio_skill_spec.rb` | same |
| Model | `spec/models/fit_gap_report_spec.rb` | same |
| Request | `spec/requests/portfolios_spec.rb` | `GET /export` cross-tenant → 404; same-tenant → 200; `POST /regenerate_fitgap` & `/fitgap` cross-tenant → 404 |

**Seeded fault test** ✅ — temporarily removed `include TenantScoped` on a scratch branch → spec `cross-tenant access raises RecordNotFound` **FAILED** (test caught the regression) → reverted → green again. History visible on the branch.

**Manual:** IDOR repro (assessor Beta accesses portfolio Alpha → 404), backfill `tenant_id IS NULL` = 0, FK constraint active.

## 7. AI-Human Verification

| Moment | Detail |
|-------|--------|
| **AI mistake (risky)** | Proposal to wrap the worker with `Current.tenant_id` — wrong assumption, a Sidekiq worker has no request context |
| **How verified** | Trace call path `PortfolioGeneratorWorker` → no HTTP middleware → `Current.tenant_id` nil; confirm the validation error at runtime |
| **Correction** | `Current.using(tenant_id: session.tenant_id)` — derive from the relation, not the outer context. Same applied in `FitGapGeneratorWorker` & `Sessions::EndHandler` |
| **Lesson** | AI tooling = leverage that must be verified; patterns like `Current.using` require understanding their execution context (HTTP vs background job) |

---

*F-01 completed & verified: 25 RSpec passing, seeded fault proven, ready to merge to umbrella.*

# F-08 — AI Portfolio Output Not Validated → One Odd Field Fails the Entire Generation

> **Finding:** F-08 (severity: P2) · **Classification:** Defective Implementation · **Area:** AI / Reliability (Backend) · **UU PDP:** No
> **Branch:** `fix/f08-ai-output-validation` · **Status:** ✅ Completed & verified

---

## 1. Summary

Portfolio generation stores LLM (Gemini) output almost as-is: `ai_level` is already clamped and `evidence` is already sanitized, but `ai_confidence` is written straight from the model response. The column is enforced by the PostgreSQL enum `confidence_level` (`high`/`medium`/`low`) plus a model validation, so small format variations from the LLM — `"HIGH"`, `"high confidence"`, or `null` — raise an enum error and **fail the entire portfolio**, even when 9 of 10 skills are actually valid.

User impact: the assessor waits for a generation (up to 3 minutes) and then sees the portfolio fail entirely and has to regenerate manually; the candidate being assessed does not receive their result on time. A single odd field on a single skill becomes the single point of failure for the whole portfolio pipeline.

## 2. Analysis & Gap to Ideal

Root cause: a sanitization pattern already exists for some fields but is not applied consistently to every AI output field. This is a defective implementation — not a missing feature — because the `ai_level`/`evidence` counter-evidence shows sanitization was an intentional pattern.

Code-level evidence:

| File | Evidence |
|------|----------|
| `api/app/services/portfolios/generator.rb` (before fix) | `ai_confidence: skill_data['confidence']` — raw AI output, no normalization (configured & discovered) |
| `api/app/models/portfolio_skill.rb` | `validates :ai_confidence, inclusion: { in: CONFIDENCE_LEVELS }` — only `high`/`medium`/`low` |
| `api/db/schema.rb` | `create_enum "confidence_level", ["high", "medium", "low"]` |
| `api/app/services/portfolios/generator.rb` (before fix) | `ai_level` already clamped (`clamp(1,5)`); `evidence` already sanitized (`Array(...).first(3)`) |

Gap to ideal condition:
- AI output must pass through a single sanitization layer before being persisted (normalization to the enum).
- A single failing skill must not fail other valid skills — partial save with an explicit marker.
- The assessor must know the result is partial (no silent partial), and `failed` is reserved for total failure.

## 3. Options & Trade-offs

### Option A — Input normalization + per-skill partial save ✅ **CHOSEN**

| Aspect | Assessment |
|--------|------------|
| **Product Impact vs Cost** | Portfolio far less likely to fail entirely → assessor is not left waiting with no result; medium cost (service refactor + migration + UI marker). |
| **Long-term Maintainability** | One sanitization layer for AI output → reusable pattern for future fields; single `normalize_confidence` helper. |
| **Failure Modes** | Partial save yields an "incomplete" portfolio → handled with an explicit marker (`generation_status: partial` + `generation_error`) so it is never silent. |
| **Contextual Fit** | Most robust against LLM format uncertainty; portfolio generation is a core feature that must survive model imperfection. |

### Option B — Normalize `ai_confidence` only (no partial save) ❌ Rejected

Fast and cheap, but only closes one field. Any other odd non-confidence field can still kill the whole generation — the "all-or-nothing" fragility remains. It defers the problem to the next field.

### Trade-offs accepted (for the chosen option)

| Trade-off | Justification |
|-----------|---------------|
| A partial portfolio means incomplete data | Marked explicitly in status + amber UI banner; the assessor knows something is missing and can still judge the valid remainder. |
| Service complexity increases (outcome-based status) | Small: `save_skills` returns a `{saved, failed, errors}` summary; final-status flow stays in one place. |
| `generation_status` enum gains a value | `ADD VALUE` migration is safe & non-destructive; existing values are unchanged. |

## 4. Solution Implemented

- **`api/db/migrate/20260816120000_add_partial_to_generation_status.rb`** (new) — `ALTER TYPE generation_status ADD VALUE IF NOT EXISTS 'partial'`. Down: recreates the enum without `partial` (fails loudly if any row uses the value — an honest rollback).
- **`api/app/models/portfolio.rb`** — added `partial` to `GENERATION_STATUSES` + `partial` scope & `partial?` helper.
- **`api/app/services/portfolios/generator.rb`**:
  - `normalize_confidence(raw)` — enum normalization: lowercase + prefix mapping (`"HIGH"` → `high`, `"high confidence"` → `high`), blank/unknown → `medium` fallback.
  - `save_skills` refactored to best-effort: each skill is `create!`d individually inside its own rescue (`ActiveRecord::ActiveRecordError`); valid skills persist, errors are collected with the skill label.
  - Final status derived from the outcome: all saved → `complete`; some saved → `partial` + `generation_error` with details; none saved → `failed` (not a fake partial) with a clear message.
  - Decision: when **all** skills fail, `call` deliberately does **not** raise — the status is already final and Sidekiq retries would only re-ask the same malformed data from the LLM. Infrastructure errors (JSON parse, network) still raise → outer rescue → `failed`.
- **`api/app/controllers/api/v1/portfolios_controller.rb`** — unchanged: `show` already returns the portfolio for any status other than generating/failed; `export` and fit/gap still reject non-complete.
- **`web/src/types/index.ts`** — `generation_status` now includes `"partial"`.
- **`web/src/pages/portfolio/PortfolioPage.tsx`** — amber banner "Portfolio partially generated" (icon `AlertTriangle`, `generation_error` details); valid skills still render for `partial`; PDF/JSON export buttons and the Fit/Gap block render only for `complete`.

> **AI-Human Verification:** two correction moments while writing tests — (1) the initial request spec failed with 202 because the lazy `let(:portfolio)` was never referenced, so the portfolio was never created (debugged via the response body, fixed with `let!`); (2) the first seeded fault was ineffective because a stray `raw` line at the top of the method only discarded its return value and normalization still ran (fixed by making it a full passthrough until the test genuinely failed).

## 5. Acceptance Criteria & Edge Cases

| # | Criterion | Input | Expected Behavior | Edge Case |
|---|-----------|-------|-------------------|-----------|
| 1 | Confidence casing variation | `"HIGH"` | stored as `high` | `null` → `medium` |
| 2 | Verbose confidence | `"high confidence"` | mapped → `high` | unknown → `medium` |
| 3 | One invalid skill | 1 of 5 skills with odd confidence/summary | 4 skills saved + `generation_status: partial` + 1 error logged | an error never stops other valid skills |
| 4 | All skills invalid | All confidence/summary odd | Portfolio `failed` (not a fake partial) + clear message | no skill is saved |
| 5 | Normal flow | All valid | `generation_status: complete` + `generated_at` | JSON string and Hash payloads both accepted |
| 6 | API→UI seam | `GET /sessions/:id/portfolio` on a partial portfolio | 200 + `generation_status: partial` + saved skills | a non-generating/non-failed status never falls into the "generating" branch |

## 6. Tests & Verification

- **RSpec service** (`spec/services/portfolios/generator_spec.rb`, new, 6 examples) — normalization of casing/verbose/blank/unknown; partial save (1 invalid → 4 saved, `partial`, error includes label & count); all invalid → `failed`; normal → `complete`; model enum still enforced (`create!` with an invalid value → `RecordInvalid`); unparseable payload → outer rescue → `failed`.
- **RSpec request** (`spec/requests/portfolios_spec.rb`, +1 example) — `GET /api/v1/sessions/:id/portfolio` with partial status → 200, `generation_status: partial`, `generation_error` and skills echoed.
- **Full suite:** 48 examples, 0 failures.
- **Seeded fault test:** normalization removed temporarily (passthrough) → the "maps casing/verbose/blank onto enum" test FAILED (`expected "complete", got "partial"`) → reverted → 48 green again. Proven the test catches the regression.
- **Frontend:** `tsc --noEmit` clean; Vitest 13/13 (F-07 regression intact).
- **Manual (UI):** verified in browser — partial portfolio shows the amber banner with 2 valid skills and no export/Fit-Gap controls; complete control shows exports and Fit/Gap with no banner.

## 7. AI-Human Verification

Two moments where the AI was wrong/risky during implementation, both caught and corrected: (1) the partial request spec initially failed because a lazy `let` meant the portfolio was never created in the DB, so the controller returned 202 "generating" — fixed with `let!` after debugging the response body. (2) The first seeded fault did not actually disable normalization (the return value was discarded), so the test stayed green — proof that a seeded fault must be verified to genuinely fail before being claimed; fixed with a full passthrough. No data-integrity or information-leakage issues.

---

*F-08 completed: 48 RSpec passing (6 service + 1 request + 41 existing), seeded fault proven, tsc + 13 Vitest green, partial & complete states verified in browser.*

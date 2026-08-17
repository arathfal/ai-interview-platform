# F-26 — Inconsistent API Error Envelope & Silent Catches Across the Frontend

> **Finding:** F-26 (severity: P3) · **Classification:** Defective Implementation · **Area:** Fullstack — Backend error envelope + Frontend error handling · **UU PDP:** No
> **Branch:** `feat/f26-error-envelope` · **Status:** ✅ Completed & verified

---

## 1. Summary

Error responses across the API used two different shapes depending on where the error originated: `{ error: "string" }` for Rack::Attack 429s, and `{ errors: [{ status, message }] }` for every exception handler / controller path. Meanwhile, several frontend pages silently swallowed request failures with `.catch(() => {})`, and the invite-candidate dialog closed *before* the API call resolved (NEW-F-01) — so a failed creation left the assessor with no error at all.

User impact: the assessor clicks a button or opens a page and, on failure, gets an empty page, a dead button, or a silently closed dialog with zero feedback. Failures look like successes, so the assessor cannot tell whether an invite was sent, whether a portfolio was saved, or whether a page simply failed to load — leading to retries, duplicate invites, and lost confidence in the platform. The candidate on the receiving end may wait for an interview link that was never actually created.

## 2. Analysis & Gap to Ideal

Root cause: error handling was built opportunistically — each error origin (Rack::Attack, exception handler, middleware, controller) chose its own response shape, and each frontend page chose its own way to ignore or surface failures. There was no single contract for errors and no shared extraction layer, so a unified fix never had a natural place to live. This is a defective implementation: the product clearly intends to surface failures, but the plumbing is inconsistent and partially missing.

Code-level evidence:

| File | Evidence |
|------|----------|
| `api/config/initializers/rack_attack.rb` | 429 → `{ error: '...' }` (singular key, string) — not the same shape as every other error |
| `api/app/controllers/concerns/exception_handler.rb` + `response.rb` + `application_middleware.rb` | → `{ errors: [{ status, message }] }` (plural, array) — two mutually incompatible contracts |
| `web/src/pages/assessments/AssessmentInvitePage.tsx` | `.catch(() => {})` on page load — user sees an empty page ("—", "No candidates yet") with no message |
| `web/src/pages/portfolio/PortfolioPage.tsx` | `.catch(() => {})` on load; export had no error path — no feedback on failure |
| `web/src/pages/assessments/AssessmentEditPage.tsx` / `vacancies/VacancyEditPage.tsx` | `.catch(() => {})` on load; vacancy submit had **no catch at all** — unhandled rejection / silent empty form |
| `web/src/services/api.ts` | interceptor only handled 401/403 — no normalization, no 429 feedback |
| `AssessmentInvitePage` `handleInviteCandidate` | dialog closed before the API call (NEW-F-01) — failed creation is invisible to the assessor |

Gap to ideal condition:
- One error contract across the stack: `{ error: { code, message, details? } }`.
- A single normalization layer in the frontend so every error shape becomes one typed object.
- Every user-facing operation either succeeds visibly or fails visibly with a message and, when useful, a retry.

## 3. Options & Trade-offs

### Option A — Standardize backend envelope + full frontend error system ✅ **CHOSEN**

Unify all backend errors on `{ error: { code, message, details? } }`, build a frontend normalizer + toast system + reusable Alert, and replace every silent catch with real feedback.

| Aspect | Assessment |
|--------|------------|
| **Product Impact vs Cost** | All assessor operations get clear feedback; silent failures eliminated at the root — high value, high cost (backend envelope, interceptor, new UI primitives, multiple pages) |
| **Long-term Maintainability** | Excellent — one error contract, one extraction helper, reusable Alert/Toast; new pages inherit the pattern for free |
| **Failure Modes** | Envelope migration is backward-compatible (old shapes still parsed); contract tests guard regressions; the seeded fault test proves the guard actually fails when the envelope is reverted |
| **Contextual Fit** | Demonstrates fullstack + frontend depth in one finding; executed in staged layers and guarded by a 6-case contract spec |

### Option B — Frontend-only normalization (leave backend as-is) ❌ Rejected

Normalize the two existing shapes in the interceptor and surface toasts. Faster and cheaper, but leaves two (or more) backend shapes as a permanent tax on every frontend engineer — a third format would silently break the interceptor again, and the root cause that created the bug class stays untouched.

### Trade-offs accepted (for the chosen option)

| Trade-off | Justification |
|-----------|---------------|
| Larger surface area (backend + frontend + many pages) | Mitigated by staged commits (13 small, readable) and a 6-case contract spec; each layer lands and is verified independently |
| Backend envelope change could break old clients | Migration is backward-compatible — the frontend still parses legacy shapes first; contract tests lock the new shape |
| NEW-F-01 picked up inside this finding | Same page, same pattern, same root cause (silent failure) — fixing them together is more efficient than a separate PR |

## 4. Solution Implemented

**Backend — unified envelope:**
- **`api/app/controllers/concerns/error_envelope.rb`** (new) — `ErrorEnvelope` module with a status→code map (`unauthorized`, `forbidden`, `not_found`, `conflict`, `validation_failed`, `rate_limited`, `internal_error`, plus explicit codes such as `tenant_not_found`).
- **`api/app/controllers/concerns/response.rb`, `exception_handler.rb`, `api/app/middlewares/application_middleware.rb`, `api/config/initializers/rack_attack.rb`** — all four error renderers now emit `{ error: { code, message, details? } }`: `Response#json_error`, every `rescue_from` + `render_exception`, `ApplicationMiddleware#error`, and the Rack::Attack 429 throttled responder.
- **`api/spec/requests/error_envelope_spec.rb`** (new, 6 examples) — contract spec asserting shape, codes and the 429 responder; 8 existing RSpec assertions updated.

**Frontend — foundation:**
- **`web/src/lib/apiErrors.ts`** — `extractApiError()` normalizes the canonical envelope, the legacy `{ errors: [...] }` array, the legacy singular 429 shape, and network failures into `NormalizedApiError { status, code, message }`; the interceptor attaches it as `error.apiError`.
- **`web/src/types/index.ts`** — `ApiErrorEnvelope` + `NormalizedApiError` types.
- **`web/src/stores/toastStore.ts`** — dependency-free jotai-backed toast store callable from anywhere (components, hooks, the axios interceptor); the shared store is explicitly passed to `<JotaiProvider>` so UI and helpers stay in sync.
- **`web/src/components/ui/toast.tsx`** — global `ToastViewport` (top-right stack, auto-dismiss 5s, dismiss button, optional retry action).
- **`web/src/components/ui/alert.tsx`** — reusable inline Alert (destructive/warning/info variants, icon, `role="alert"`), evolved from the F-03 draft that was parked for this finding.
- **`web/src/services/api.ts`** — interceptor normalizes every rejection; 401/403 (non-login) redirect to login with a "session expired" notice; 429 triggers a global rate-limit toast.

**Frontend — per page (silent catches removed):**
- **`AssessmentInvitePage`** — load-failure Alert + Retry; **NEW-F-01**: dialog stays open until the API call succeeds, inline error inside the dialog, success closes it with a confirmation toast.
- **`PortfolioPage`** — page-level error state (icon + message + Retry/Back); export failures surface as a toast with retry.
- **`AssessmentEditPage` / `VacancyEditPage`** — load-failure Alert + Retry; save errors shown in an Alert (vacancy save previously had no catch at all).
- **`LoginPage` / `SignupPage`** — unified error extraction; Login shows a session-expired banner and uses Alert; Signup refactored to react-hook-form with per-field validation (email pattern mirrors the backend `URI::MailTo::EMAIL_REGEXP`; password required-only — the backend defines no password policy) and `text-xs` inline field errors.
- **`AssessmentListPage` / `VacancyListPage` / `LiveMonitorPage`** — existing plain red banners migrated to the shared Alert for one visual language.

> **AI-Human Verification:** three correction moments during implementation — (1) the initial load-error banner wrapped the reusable Alert (which already ships its own destructive background) in a container repeating the same fill, producing a "red inside red" banner flagged during product review; fixed by removing the wrapper styling, then a repo-wide sweep migrated three pre-existing plain red banners to the shared component. (2) The Retry button sat beside the Alert visually mismatched; moved inside the Alert's content row (`items-center` flex). (3) The AI initially proposed a frontend-only password pattern on Signup; verified the backend defines no password policy and deliberately shipped required-only instead of a bypassable half-truth.

## 5. Acceptance Criteria & Edge Cases

| # | Criterion | Input | Expected Behavior | Edge Case |
|---|-----------|-------|-------------------|-----------|
| 1 | Unified envelope | Any API error | `{ error: { code, message } }` single format | Legacy formats still parsed (backward-compat) |
| 2 | No silent catch | Every former `.catch(() => {})` site | Visible feedback + retry where useful | Network failure → `network_error` message, not a generic lie |
| 3 | Invite dialog (NEW-F-01) | Create-link API fails | Dialog stays open, inline error, retry possible | Success closes dialog + toast |
| 4 | 429 rate limit | Rack::Attack throttle | Toast "Too many requests" with clear message | — |
| 5 | 401/403 | Non-login request | Redirect to login (existing behaviour, no regression) + session-expired notice | Login endpoint itself excluded (F-03 AC#8/9) |
| 6 | Type safety | Error responses | TS types for unified error | — |
| 7 | Signup field errors | Invalid/empty email & password | Inline `text-xs` messages under each field | Password pattern skipped (no backend policy) |

## 6. Tests & Verification

- **Backend RSpec: 82 examples, 0 failures** — includes the new 6-example contract spec (`error_envelope_spec.rb`) covering shape contract, 403 unauthenticated, 404, 422 and the 429 throttled responder.
- **Seeded fault (proven):** temporarily bypassing `ErrorEnvelope` inside `ExceptionHandler#render_error_envelope` to the legacy `{ errors: [...] }` shape made the contract spec fail (2 failures — unauthenticated paths); reverted, suite green again.
- **Frontend Vitest: 50 tests, 0 failures** — added `apiErrors` unit tests (7 cases across all envelope formats), `AssessmentInvitePage` tests (load-failure banner + retry, NEW-F-01 dialog stays open on failure, success closes dialog), Login/Signup validation tests; TypeScript `tsc --noEmit` clean.
- **Manual (browser, product review):** login failure shows destructive Alert with the backend message; signup shows per-field `text-xs` errors; load failure on `/assessments/<missing>/invite` shows Alert + Retry; curl login returns `{"error":{"code":"unauthorized","message":"Invalid email or password"}}`.

## 7. AI-Human Verification

Three moments where the AI was wrong or risky during implementation, all caught and corrected during product review: (1) the initial load-failure banner nested the reusable Alert inside a wrapper that repeated the same destructive background — a "red inside red" doubled box; fixed by removing the wrapper's styling and laying the Alert beside the action, then migrating three pre-existing plain red banners (AssessmentList, VacancyList, LiveMonitor) to the shared component for one visual language. (2) The Retry button sat next to the Alert visually mismatched; the action was moved inside the Alert's content row (`items-center` flex) so icon, text and actions share one vertical rhythm. (3) The AI proposed a frontend-only password validation pattern on Signup; after verifying the backend defines no password policy, it shipped required-only instead — a frontend-only rule would be bypassable via the API and is documented as future work rather than shipped as a fake claim. No data-integrity or information-leakage issues.

---

*F-26 completed: 82 RSpec passing (6 contract + 76 existing), seeded fault proven, tsc clean + 50 Vitest green, product review passed for login/signup/invite/portfolio flows.*

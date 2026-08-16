# F-03 — Login Without `X-Tenant-Scheme` → Tenant Bound to an Arbitrary Organization

> **Finding:** F-03 (severity: P1) · **Classification:** Defective Implementation · **Area:** Authentication / Multi-tenant routing (Fullstack) · **UU PDP:** Yes (related)
> **Branch:** `fix/f03-login-tenant-scheme` · **Status:** ✅ Completed & verified

---

## 1. Summary

Login never asked which tenant the user belongs to. On `POST /api/v1/auth/login`, the backend resolved the tenant via `request.headers['X-Tenant-Scheme'].presence || SELECT scheme FROM organizations LIMIT 1 || 'test-corp'` — when no header is sent, the token is scoped to whichever organization PostgreSQL happens to return first (no `ORDER BY`, non-deterministic). The frontend login page only had email + password fields and never sent a tenant header, so **every browser login silently landed in an arbitrary tenant**.

If left unfixed: with more than one organization in the database, an assessor could unknowingly view and manage another tenant's candidates, sessions, and portfolios. That is silent multi-tenant misrouting of personal data — a direct UU PDP concern (data subjects' personal data exposed to an unintended tenant) and a lurking data-integrity hazard (records created under the wrong tenant).

## 2. Analysis & Gap to Ideal

Root cause: tenancy was resolved **implicitly** — the codebase already supports an explicit `X-Tenant-Scheme` header (used by candidate-facing flows), but the login path treated it as optional and fell back to a non-deterministic database query instead of demanding an explicit decision from the actor who knows the tenant (the user).

Code-level evidence:

| File | Evidence |
|------|----------|
| `api/app/controllers/api/v1/authentication_controller.rb` (before fix) | `resolve_scheme` = header `.presence` \|\| `SELECT scheme FROM organizations LIMIT 1` \|\| `'test-corp'` — silent fallback to the first row | 
| `web/src/pages/auth/LoginPage.tsx` (before fix) | only email + password inputs; `authApi.login({ email, password })` — no tenant input, no header |
| `web/src/services/api.ts` (before fix) | axios instance never injects `X-Tenant-Scheme` (grep in `web/src` = 0 matches) |
| `api/config/routes.rb` | no organization-listing endpoint — the frontend had no way to know available tenants |

Gap to ideal condition:
- Login must be tenant-explicit: the frontend sends `X-Tenant-Scheme` (from user input or a dev default).
- The backend must **reject** login without the header (no DB fallback), with a clear error.
- The backend must verify the scheme actually exists in `organizations` — unknown schemes get a distinct `401`, not a generic failure.
- Tenancy is transparent to the user: they know which tenant they are signing into.

## 3. Options & Trade-offs

### Option A — Tenant input on LoginPage + mandatory header + explicit backend validation ✅ **CHOSEN**

| Aspect | Assessment |
|--------|------------|
| **Product Impact vs Cost** | Eliminates silent misrouting; user always logs into an explicit tenant. Small UX cost (one extra field on the login form). |
| **Long-term Maintainability** | Explicit header = a clear contract; the DB fallback is removed (one source of truth: the user's choice). |
| **Failure Modes** | Wrong/missing tenant → clear error instead of misrouting (an improvement). Production setups that relied on the fallback need the header — a deliberate, documented breaking change. |
| **Contextual Fit** | Smallest, most direct change: no URL routing restructure, no new endpoints — reuses the header mechanism the backend already supports. |

### Option B — URL-based tenant routing (`/:scheme/login`) ❌ Rejected

More "product-like" (deep-linkable, bookmarkable tenants) but requires a react-router restructure, redirect/404 handling, and back-compat for the old path. Cost and risk outweigh the benefit at the current scale (1-2 internal orgs). A reasonable future enhancement, not this finding.

### Option C — Backend-only: reject without header, frontend sends from env ❌ Rejected

Cheapest, but the tenant decision moves into deployment config instead of the user. A wrong env in any environment breaks all logins with no self-service. Fine as a dev convenience, insufficient as the final solution — Option A includes it (field default from env).

### Trade-offs accepted (for the chosen option)

| Trade-off | Justification |
|-----------|---------------|
| One more required field on login | It is the single place that determines the scope of the whole session; the cost is one text input. |
| Breaking change for header-less logins | Intentional and documented; the previous behavior was non-deterministic misrouting, not a supported contract. |
| Dev friction without env default | `VITE_DEV_TENANT_SCHEME` pre-fills the field when set; otherwise the user types it manually. |

## 4. Solution Implemented

- **`api/app/controllers/api/v1/authentication_controller.rb`** — `resolve_scheme` reworked:
  - Header `X-Tenant-Scheme` is **required**; blank → `401 {"errors":[{"status":401,"message":"Tenant scheme is required"}]}`, no token.
  - Lookup is explicit: `Organization.where('lower(scheme) = ?', scheme).first` — case-insensitive match, returns the canonical scheme from the DB.
  - Unknown scheme → `401 {"errors":[{"status":401,"message":"Unknown tenant scheme"}]}`.
  - The `SELECT ... LIMIT 1` fallback and the `'test-corp'` hardcode are **removed**.
  - `authenticate` stops (`return if scheme.blank?`) because `resolve_scheme` already rendered the error.
- **`web/src/services/auth.ts`** — `authApi.login(data, tenantScheme)` now sends `{ headers: { "X-Tenant-Scheme": tenantScheme } }`.
- **`web/src/services/api.ts`** — the 401/403 interceptor skips the redirect-then-reload for the `/auth/login` request itself, so a failed login surfaces the backend error message in the UI instead of reloading the page and erasing it (F-03 AC#8).
- **`web/src/pages/auth/LoginPage.tsx`** —
  - New **Tenant** field above email, pre-filled from `VITE_DEV_TENANT_SCHEME` when set, with helper text "Organization scheme — provided by your assessor."
  - Empty tenant blocks submit with an inline error **"Tenant is required."** rendered under the field, replacing the helper info (`error ?? info` logic); typing clears the error and restores the helper.
  - Backend errors (e.g. "Unknown tenant scheme") are parsed from the error envelope and shown verbatim instead of the generic "Invalid email or password."
- **`web/src/pages/auth/LoginPage.tsx`** (UI polish) — password field gains a show/hide toggle: `Eye`/`EyeOff` icon button (aria-label "Show password"/"Hide password", `type="button"` so it never submits the form) switches the input between `type="password"` and `type="text"`. Behaviour-neutral — no logic change, added alongside this finding's login flow.
- **`web/.env.example`** — documents `VITE_DEV_TENANT_SCHEME` (empty by default → user types the scheme manually).
- **`api/spec/rails_helper.rb`** — `Rack::Attack.enabled = false` before the suite: the login throttle (5/min per IP) is a production guard and must not throttle the test suite (the auth spec issues many login requests per run and otherwise gets 429).

> **AI-Human Verification:** two correction moments while implementing. (1) The backend RSpec initially failed with 500 "Error occurred while parsing request parameters" because the spec sent form-encoded params with `Content-Type: application/json`; fixed by serializing `params.to_json` exactly like the real axios client — after that all 7 examples passed. (2) The tenant-required error was initially rendered under the submit button; the reviewer corrected that it must appear **under the Tenant field**, swapping with the helper info (`error ?? info`).

## 5. Acceptance Criteria & Edge Cases

| # | Criterion | Input | Expected Behavior | Edge Case |
|---|-----------|-------|-------------------|-----------|
| 1 | Login without header rejected | `POST /auth/login` without `X-Tenant-Scheme` | **401** `"Tenant scheme is required"`, no token | blank/whitespace header treated the same |
| 2 | Unknown scheme rejected | `X-Tenant-Scheme: nope-xyz` | **401** `"Unknown tenant scheme"` | lookup is case-insensitive (`TENANT-B` works) |
| 3 | Valid login forwarded | correct scheme + credentials | **200** JWT with `scheme` claim = that org's scheme | two orgs exist — token is scoped by the header, never by global `LIMIT 1` |
| 4 | Wrong credentials stay 401 | valid header, wrong password | **401** `"Invalid email or password"` (existing behavior) | — |
| 5 | Frontend sends the header | LoginPage submit | request carries `X-Tenant-Scheme` = field value | empty field → submit blocked + inline "Tenant is required." (no request) |
| 6 | Dev default field | `VITE_DEV_TENANT_SCHEME` set | field pre-filled; user can override | env empty → empty field + clear placeholder |
| 7 | Existing flow regression | login → redirect | auth flow unchanged (token stored, axios interceptor same) | — |
| 8 | Backend error surfaced | wrong tenant → 401 | backend message shown in login UI (not generic) | error envelope parsed; login 401 not swallowed by the global 401 redirect |

## 6. Tests & Verification

- **RSpec** — `api/spec/requests/api/v1/authentication_spec.rb` (new, 7 examples): AC#1 (missing + blank header), AC#2 (unknown scheme; two orgs present to prove no `LIMIT 1`), AC#3 (valid scheme → claim matches; header scoping beats global lookup; case-insensitive match returns canonical scheme), AC#4 (wrong password regression). **7/7 passing.**
- **Full backend suite** — **65/65 examples, 0 failures** (58 pre-existing + 7 new) — no regression.
- **Seeded fault test** — temporarily restored the old `LIMIT 1` fallback in `resolve_scheme`: both AC#1 examples failed with "expected 401 but got 200"; reverted, suite green again (65/65). Test genuinely catches the regression.
- **Vitest (frontend)** — `web/src/services/__tests__/auth.test.ts` (2: header sent; scheme passed through untouched) + `web/src/pages/auth/__tests__/LoginPage.test.tsx` (7: field rendered; password visibility toggle; empty-tenant blocks submit + inline error swaps with helper info + typing clears; header+schema on success; backend error surfaced; generic fallback; dev default pre-fill). **9/9 passing**; full frontend suite **30/30**; `tsc --noEmit` clean.
- **Manual (backend)** — before: login without header → 200 + token with `scheme: test-corp` (arbitrary org) while header `alpha-corp` → `scheme: alpha-corp` (misrouting proven). After: no header → 401 "Tenant scheme is required"; `test-corp` → 200 + JWT claim `scheme: test-corp`; `nope` → 401 "Unknown tenant scheme"; wrong password → 401 "Invalid email or password".
- **Manual (browser)** — login page shows the Tenant field; empty submit blocked with inline error under the field; correct tenant + credentials → redirect to `/assessments`; unknown tenant → backend error message displayed; the password field shows an `Eye` icon that toggles the input between hidden and visible text.

## 7. AI-Human Verification

Two correction moments while implementing: (1) RSpec 500 from form-encoded params with a JSON content type — fixed by sending `params.to_json` (mirrors the real client); (2) the required-header error lived under the submit button — reviewer moved it under the Tenant field with `error ?? info` semantics (error replaces helper, typing clears it).

---

*F-03 completed: 7 RSpec + 8 Vitest passing, seeded fault proven (2 failures under the LIMIT-1 fallback), manual before/after verified over curl and browser.*
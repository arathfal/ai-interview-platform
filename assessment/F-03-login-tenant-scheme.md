# F-03 — Login Without User↔Organization Relation → Tenant Bound to an Arbitrary Organization

> **Finding:** F-03 (severity: P1) · **Classification:** Defective Implementation · **Area:** Authentication / Multi-tenant routing (Fullstack) · **UU PDP:** Yes (related)
> **Branch:** `fix/f03-login-tenant-scheme` · **Status:** ✅ Completed & verified (decision evolution A → D documented)

---

## 1. Summary

Login never verified which tenant a user actually belongs to. On `POST /api/v1/auth/login`, the backend resolved the tenant via `request.headers['X-Tenant-Scheme'].presence || SELECT scheme FROM organizations LIMIT 1 || 'test-corp'` — with no header, the token was scoped to whichever organization PostgreSQL happened to return first (no `ORDER BY`, non-deterministic). The frontend login page only had email + password fields, so **every browser login silently landed in an arbitrary tenant**.

If left unfixed: with more than one organization, an assessor could unknowingly view and manage another tenant's candidates, sessions, and portfolios — silent multi-tenant misrouting of personal data (UU PDP) plus a data-integrity hazard (records created under the wrong tenant).

**Decision evolution (2026-08-17):** the finding was first addressed with a tenant input field on the login form (Option A) — implemented, verified, and opened as PR #8. A product review then revoked it: tenant input adds no *validity* (a user is not related to any organization, so the field is just a claim; anyone who knows a scheme could log into that tenant), and it does not match how a 1-account = 1-company app works. The final solution (Option D) makes tenancy a **data relation**: every user belongs to exactly one organization (`users.tenant_id`), login is clean (email + password) and derives the scheme from the account, and signup assigns the organization via a dropdown. The phase-1 commits are kept in the branch history so the decision evolution is auditable.

## 2. Analysis & Gap to Ideal

Root cause (deeper than the header): there is **no ownership relation between users and organizations** in the data model. Because of that, no tenant mechanism — header, form field, or env — can ever be *verified*; any claimed tenant is accepted. The correct fix must touch the data model, not just the login path.

Code-level evidence (before phase 2):

| File | Evidence |
|------|----------|
| `api/app/controllers/api/v1/authentication_controller.rb` | `resolve_scheme` fell back to `SELECT scheme FROM organizations LIMIT 1` \|\| `'test-corp'` — non-deterministic tenant binding |
| `api/db/schema.rb` (`users`) | users had only `email, password_digest, role` — no tenant column, no join table, no association |
| `web/src/pages/auth/LoginPage.tsx` | only email + password; `authApi.login({ email, password })` — no tenant path |
| `web/src/App.tsx` | `/signup` route missing — SignupPage dead code; `authApi.signup` hung without backend endpoint |
| `api/config/routes.rb` | no organization listing — the frontend had no source of valid tenants |

Gap to ideal condition (phase 2):
1. Every user has an explicit relation to an organization (`users.tenant_id`, NOT NULL + FK). Admin/assessors are always tenant-bound (no cross-org superadmin).
2. Login is tenant-implicit: email + password → scheme derived from the account. A user without an org is rejected with a clear message.
3. Signup is active with an organization dropdown fed by a public `GET /organizations` (id + name + scheme).
4. Tenancy is structurally verifiable: the token's `scheme` always equals the account's organization — misrouting is impossible, not merely unlikely.
5. `X-Tenant-Scheme` remains supported **only** for non-JWT/candidate flows (TenantResolverMiddleware) — unchanged.

## 3. Options & Trade-offs

### Option A — Tenant input on LoginPage + mandatory header ❌ Initially chosen, then revoked
Implemented and verified in phase 1 (PR #8 phase 1): the frontend sends `X-Tenant-Scheme`, the backend requires and validates it against `organizations` (401 required / 401 unknown). **Revoked by product review** (2026-08-17):
- Adds no data validity — the user is unrelated to any org, so the field is an unverifiable claim.
- Unusual for a 1-account = 1-company flow; adds per-login effort.
- Not mandated by the brief.
- Leaves "miss-tenant" (user typing a tenant that isn't theirs) — the exact problem, moved from the system to the user.

### Option B — URL-based tenant routing (`/:scheme/login`) ❌ Rejected
Router restructure + redirect/404 + back-compat; cost/risk disproportionate at current scale (1-2 internal orgs). Still cannot verify ownership.

### Option C — Backend-only: reject without header, frontend sends from env ❌ Rejected
Tenant decision moves to deployment config, not the user; a wrong env breaks all logins with no self-service.

### Option D — User↔organization relation (`users.tenant_id`) + login tenant-implicit + signup dropdown ✅ **CHOSEN (final)**

| Aspect | Assessment |
|--------|------------|
| **Product Impact vs Cost** | **Best.** Clean login (2 fields); users always sign in as *their own* org — wrong-tenant is structurally impossible. Cost is medium-high: migration + backfill (tiny user base, dev/test only) + model change + org listing + signup endpoint + UI + test rewrite |
| **Long-term Maintainability** | **Very good.** One source of truth in the data model (`belongs_to :organization`); standard pattern; scales with tenant growth |
| **Failure Modes** | User without org → login explicitly rejected (no misrouting). Orgs are assigned at signup/creation — the only manual process is the initial admin |
| **Contextual Fit** | Touches the root (data model), not the symptom (login input). Small user base → backfill is cheap. Defensible: *"tenant is determined by a data relation, not by user input"* |

Trade-offs accepted: breaking change for phase-1 header-based logins (intentional — the phase-1 behavior itself is revoked); signup exposes a public org listing (id/name/scheme only — nothing sensitive).

## 4. Solution Implemented

**Backend**
- `db/migrate/20260817110000_add_tenant_id_to_users.rb` — `users.tenant_id` (bigint): backfills existing users to the first organization, enforces NOT NULL, adds index + FK to `organizations`. Down migration reversible.
- `api/app/models/user.rb` — `belongs_to :organization, foreign_key: :tenant_id` (required by default → an org-less user cannot be created).
- `api/app/controllers/api/v1/authentication_controller.rb` — `authenticate`:
  - scheme = `user.organization.scheme`; any `X-Tenant-Scheme` header is **ignored** (no override).
  - missing relation → `401 "Account is not assigned to an organization"` (defense in depth; DB already enforces).
  - new `signup` action (`POST /api/v1/auth/signup`): validates `organization_id` (422 required/not found), creates the user already assigned to the org, returns `201` + token with the org's scheme. **Always creates an `admin` account** — the only functional role in this platform (login requires `admin`; every protected page requires assessor permissions; candidates use invite tokens without accounts; the legacy `user` role has no flow and would be an unusable trap).
- `api/app/controllers/api/v1/organizations_controller.rb` (new) — `GET /api/v1/organizations`: public minimal listing `id + name + scheme` (excludes `config`, hosts, alias hosts) for the signup dropdown.
- `api/config/routes.rb` — `auth/signup` + `organizations` routes.

**Frontend**
- `web/src/services/auth.ts` — `login({email, password})` without any tenant header; `signup({email, password, organization_id})` (no role — always admin server-side).
- `web/src/services/organizations.ts` (new) — `organizationsApi.list()`.
- `web/src/pages/auth/LoginPage.tsx` — tenant field removed; backend errors surfaced verbatim (e.g. "Account is not assigned to an organization"); CTA **"Don't have an account? Sign up"** below the button; password uses the shared `PasswordInput`.
- `web/src/pages/auth/SignupPage.tsx` — organization dropdown fed by the listing (empty list → message + disabled submit), role radio **removed** (signup always creates an admin account), shared `PasswordInput`, auto-login on success.
- `web/src/components/ui/password-input.tsx` (new) — reusable password field with show/hide toggle, used by both auth pages (reviewer correction — see §7).
- `web/src/App.tsx` — `/signup` route activated (dead code removed).
- `web/.env.example` — `VITE_DEV_TENANT_SCHEME` removed.

Unchanged: JWT still carries the `scheme` claim; TenantResolverMiddleware and WS authorization keep resolving from the token/header for candidate flows; `X-Tenant-Scheme` still works for non-JWT paths.

## 5. Acceptance Criteria & Edge Cases

| # | Criterion | Input | Expected Behavior | Edge Case |
|---|-----------|-------|-------------------|-----------|
| 1 | User must have a tenant | account without an organization tries to log in | **401** "Account is not assigned to an organization", no token | DB NOT NULL + FK makes this row impossible; controller guard is defense in depth |
| 2 | Login tenant-implicit | email+password of a user with an org | **200** JWT claim `scheme` = the account's org scheme | two orgs with different schemes — token always reflects the account, never any input |
| 3 | No cross-tenant access | user of tenant A requests tenant B data (token A) | rejected by existing scoping — unchanged | — |
| 4 | Header cannot override | `X-Tenant-Scheme: <other>` sent at login | **ignored** — scheme still from the account | prevents pretending to be another org |
| 5 | Migration safe | `users.tenant_id` added | backfill done (dev/test users), column NOT NULL, FK present | down migration reversible; backfill idempotent |
| 6 | Signup active + admin-only | `GET /organizations` + `POST /auth/signup` | dropdown lists id+name+scheme; submit creates an **admin** account assigned to the chosen org, login-capable | no orgs in DB → dropdown empty + message; duplicate email → 422; unknown/missing org_id → 422; role param ignored |
| 7 | Login → signup CTA | link below the Sign in button | navigates to `/signup` | — |
| 8 | Tenant field removed | LoginPage | no tenant field, no helper text; submit sends plain credentials | regression: clean login still works |
| 9 | 401/403 interceptor | login fails (no org / wrong password) | backend error shown in UI (no redirect/reload) | phase-1 behavior preserved |

## 6. Tests & Verification

- **RSpec** — `authentication_spec.rb` (rewritten, 9 examples): AC#1 denied-without-org; AC#2 scheme-from-account across two orgs; AC#4 header ignored + clean login; AC#5 NOT NULL/FK + model refuses org-less user; wrong-password/unknown-email regressions. `signup_spec.rb` (6): created as admin with org assigned + token scheme, 422 unknown/missing org, duplicate email, role param ignored + created account can log in, public. `organizations_spec.rb` (3): id+name+scheme only, no sensitive fields, public. **18 auth-related examples.**
- **Full backend suite** — **76 examples, 0 failures.**
- **Seeded fault test** — (a) removed the org guard in `authenticate`: AC#1 failed (500 instead of 401); (b) restored the old header/`LIMIT 1` resolution: AC#2 failed ("expected tenant-b, got tenant-a" — misrouting back). Both reverted; suite green again.
- **Vitest** — `LoginPage.test.tsx` (rewritten, 6): no tenant field; toggle via shared `PasswordInput`; plain login payload; backend error surfaced; generic fallback; CTA link. `auth.test.ts` (rewritten, 3): no header sent; signup payload carries `organization_id` (no role). `SignupPage.test.tsx` (new, 7): dropdown from listing; signup toggle; submit blocked until org selected; valid submit → navigate; backend error; empty list → disabled; listing failure → error. **16 auth tests; full frontend suite 37, 0 failures; `tsc --noEmit` clean.**
- **Manual (backend)** — the AC#4 header-ignore, AC#1 no-org and AC#6 signup paths are covered by the seeded-fault RSpec above; a curl spot-check is available in the phase-2 verify script (optional).
- **Manual (browser)** — verified end-to-end by the reviewer: signup via the organization dropdown → account created and auto-redirected to `/assessments` without being kicked; logging back in with the same credentials works; the login page has no tenant field and the signup password has the eye toggle.

## 7. AI-Human Verification

Phase 1 (kept): (1) RSpec 500 from form-encoded params with a JSON content type — fixed by serializing `params.to_json` like the real axios client; (2) the required-header error was initially under the submit button — reviewer moved it under the field with `error ?? info` semantics.

Phase 2:
1. **Decision evolution A → D (product review).** The reviewer revoked the phase-1 solution after a product discussion: a tenant field at login adds no verifiable validity (no user↔org relation exists), is unusual for a 1-account = 1-company flow, and is not mandated by the brief. The final approach anchors tenancy in a data relation. Both phases remain in the PR history and description for auditability.
2. **Reusable `PasswordInput` (reviewer correction).** The eye-toggle lived inline in LoginPage only; signup had no toggle at all. Reviewer: the field should be reusable so both pages share one implementation. Extracted `ui/password-input.tsx` (forwardRef + Eye/EyeOff), used by login and signup.
3. **"User" role trap found by the reviewer during manual verification.** Reproduced: signup with role "user" succeeded and auto-logged in, then the assessor page rejected the token (401 → redirect to login), and the same credentials could never log in again (login requires `admin`). Root cause: role "user" is vestigial — model allows it, but nothing in the platform can use it (login rejects it, every protected page requires admin/assessor, candidates use invite tokens without accounts). Fixed by making signup always create an admin account and removing the role radio; regression test asserts the created account can log in.
4. **NOT NULL surfaced in tests.** The migration's NOT NULL + FK made an org-less fixture row impossible to insert — itself proof the invariant is structural. AC#1 is therefore tested by stubbing a broken organization lookup plus schema assertions, then guarding it in the controller.

---

*F-03 phase 2 completed: 76 RSpec + 37 Vitest passing, seeded faults (a) and (b) proven, decision evolution A → D and the signup role-user trap documented in the PR.*
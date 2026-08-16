# F-06 — Audio Complete Ends an Active Session Without Coverage Verification

> **Finding:** F-06 (severity: P1) · **Classification:** Defective Implementation · **Area:** Backend — Session lifecycle / API (Backend Depth — High, Frontend Depth — Low) · **UU PDP:** Indirect (candidate transcript & interview result are personal data)
> **Branch:** `fix/f06-audio-complete-authorization` · **Status:** ✅ Completed & verified

---

## 1. Summary

`POST /sessions/:token/audio_complete` is a **public, invite-token-only** endpoint (no JWT). It immediately executes `Sessions::EndHandler(reason: 'all_covered')` on any `active` session found by token — with no verification that the WebSocket layer actually completed the coverage check. Because the invite token lives in the candidate's URL (leakable via referrer headers, browser history, proxy logs), anyone holding it can force-end an active session and trigger portfolio generation from a partial transcript.

Root cause: the "coverage complete" proof exists **only in in-memory EventMachine state** (`state.coverage_pending` / `state.ending_scheduled` in `audio_websocket_middleware.rb`) and is never persisted. The HTTP endpoint has nothing to check, so it trusts any caller that knows the token. The pre-fix code even documented this explicitly (`# No coverage re-check here`), a deliberate trade-off that left a P1 security gap.

## 2. Analysis & Gap to Ideal

Code-level evidence (before the fix):

| File | Evidence |
|------|----------|
| `api/config/routes.rb` (line 45) | `post 'sessions/:token/audio_complete'` inside the **Candidate-facing (no JWT — invite token only)** block |
| `api/app/controllers/api/v1/sessions_controller.rb` (`audio_complete`) | No authentication; straight to `Sessions::EndHandler.new(session).call(reason: 'all_covered')` |
| `api/app/controllers/api/v1/sessions_controller.rb` (comment) | `# No coverage re-check here` — the `all_covered` proof exists only in WebSocket middleware in-memory state, never persisted |
| `api/app/services/sessions/end_handler.rb` | End → `create_portfolio!` + `PortfolioGeneratorWorker.perform_async` → portfolio generated from whatever transcript exists |
| `api/db/schema.rb` | No column on `sessions` that could hold an auditable "preparing to end" proof |

Gap to ideal condition:

1. There is **persisted proof** that the interview process (WS) verified coverage and authorized the termination.
2. The public endpoint only ends a session **when that proof exists and is still fresh** — not whenever the token is known.
3. Idempotency is preserved (an already-ended session stays safe to call again).
4. No reintroduction of the historical false negative (WS→HTTP timing gap): the solution must stay in sync with the existing `preparing_to_end` flow, not add a re-check that races it.

## 3. Options & Trade-offs

### Option A — Persist a `preparing_to_end_at` flag/timestamp on the session + guard the endpoint ✅ **CHOSEN**

The WS layer writes a new `preparing_to_end_at` column right before sending the `preparing_to_end` event (exactly where it currently sets the in-memory flag). `audio_complete` only executes the end when the flag exists and is within a validity window; otherwise **409 Conflict**.

| Dimension | Assessment |
|-----------|-----------|
| **Product Impact** | Closes the premature-end gap without any candidate-visible change — WS→HTTP flow is identical, the flag is written at the same point as the existing event |
| **Cost** | Low–medium: 1 migration (nullable column), set flag at the 3 `preparing_to_end` send sites (middleware), guard in controller, RSpec |
| **Long-term Maintainability** | Good: the state transition becomes **verifiable** — an auditable persisted proof; removes blind trust in a public caller |
| **Failure Modes** | WS crashes before the flag → auto-end won't run (interview is already broken; safer than malicious end). Session stays `active` with partial transcript, endable manually by the assessor via the existing JWT path. Historical false negative does not return: the flag is written **before** the event, so the HTTP flow timing is unchanged |
| **Contextual Fit** | Best fit for the existing architecture: minimal change, reuses the existing signal point, RSpec-able |

### Option B — Rate-limit `audio_complete` per token (Rack::Attack / Redis counter)

Only 1 successful call per token; further calls get 429. Rejected as a standalone fix: it controls **volume**, not **validity** — the first call still ends the session without verification, and legit frontend retries could suffer false positives. Usable later as defense-in-depth on top of A.

### Option C — Log & monitor only

Record all calls and detect anomalies manually. Rejected: P1 severity demands an active guard, not passive observability. The chosen option keeps a warn log for rejected calls, capturing the monitoring value anyway.

## 4. Solution Implemented

- **DB (migration `20260817100000_add_preparing_to_end_at_to_sessions.rb`):** nullable `datetime` column `preparing_to_end_at` on `sessions`. Reversible via the standard `change` (add_column).
- **Model (`api/app/models/session.rb`):**
  - `PREPARING_TO_END_WINDOW = 30.minutes` — validity window, comfortably larger than the max WS poll (30 × 2s) + audio queue drain.
  - `mark_preparing_to_end!` — `update_column(:preparing_to_end_at, Time.current)`. `update_column` intentionally skips callbacks because the EM loop has no request/tenant context (consistent with existing middleware usage, e.g. `gemini_resumption_token`).
  - `preparing_to_end?` — true only when the flag is present **and** fresher than the window; stale flags (e.g. a token leaked and used days later) are rejected.
- **WebSocket middleware (`api/app/channels/audio_websocket_middleware.rb`):** new private helper `signal_preparing_to_end(browser_ws, state, session)` = persist flag → set `state.ending_scheduled = true` → send the event. All **3 existing send paths** now route through it: (1) closing-phrase fallback EM timer, (2) `finalize_after_wrap_up`, (3) `finalize_natural_close`. No path can signal the browser without persisting the proof.
- **Controller (`api/app/controllers/api/v1/sessions_controller.rb` `audio_complete`):** after the existing "unknown token → 404" and "already ended → idempotent 200" early returns, a guard checks `session.preparing_to_end?`; on failure it logs a warning and returns **409** `{ errors: [{ status: 409, message: "Session is not ready to end" }] }` with zero side-effects. The assessor `end_session` path (JWT) is untouched.

Key decisions: the window prevents "stale ends" (token leaked a week after the interview); ended sessions remain idempotent (early return precedes the guard); failure mode accepted is strictly safer than the status quo (malicious end impossible; broken WS means the interview is broken anyway).

## 5. Acceptance Criteria & Edge Cases

| # | Criterion | Input | Expected Behavior | Edge Case |
|---|-----------|-------|-------------------|-----------|
| 1 | End rejected without WS proof | session `active`, no `preparing_to_end_at` → `POST audio_complete` | **409** `{ errors: [{ status: 409, message: "Session is not ready to end" }] }`; session stays `active` | Valid token of a session from another tenant (unscoped lookup still resolves; guard still applies) |
| 2 | End allowed after `preparing_to_end` | flag set (WS simulation) → `POST audio_complete` | **200** `{ ended: true }`; session `ended`, reason `all_covered` | — |
| 3 | Idempotent for ended sessions | session already `ended` → `POST audio_complete` (with or without flag) | **200** `{ ended: true, message: "Session already ended" }`; no duplicate portfolio | Flag stale/expired → still 200 (session is genuinely ended) |
| 4 | Expired flag rejected | `preparing_to_end_at` older than window (30 min) → call | **409**; session stays `active` | Long-active session with stale flag cannot be ended via the public path |
| 5 | Assessor `end_session` (JWT) unaffected | assessor manual end | still succeeds (separate path, not `audio_complete`) | — |
| 6 | Unknown token | random token → call | **404** `Invalid or expired invite token` (existing behavior preserved) | — |
| 7 | No portfolio created on rejected end | scenario #1 → check `session.portfolio` | `nil` (no side-effect) | — |

## 6. Tests & Verification

- **RSpec request spec (`api/spec/requests/sessions_audio_complete_spec.rb`):** 6 examples covering all 7 ACs (AC#7 is asserted inside AC#1). Result: **6/6 passing**. Full suite: **58 examples, 0 failures** (no regression across existing middleware/model/request specs).
- **Seeded fault test:** the controller guard was commented out (marked `# SEEDED FAULT`), then:
  - AC#1 → **FAIL** `expected the response to have status code :conflict (409) but it was :ok (200)`
  - AC#4 → **FAIL** same message
  - Guard restored → full suite green again. The tests genuinely catch the regression; evidence documented in `.ai-audit/F-06-Result/seeded-fault.md`.
- **Manual verification (rails console + curl, backend-only):** completed — confirmed by the human verifier (2026-08-17). Identical before/after scenario on a fresh active session: call without flag → **409** `Session is not ready to end`, session stays `active`, `portfolio` nil; after setting the flag (WS simulation) → **200** `{ ended: true, message: "Session ended" }`, session `ended` with `all_covered`; controls: re-call on the ended session → 200 `Session already ended` (idempotent), random token → 404. Steps kept in `.ai-audit/F-06-Result/verify_steps_after.rb`.

## 7. AI-Human Verification

1. **Portfolio status expectation corrected by manual verification:** during the *before* verification the AI expected `Portfolio.generation_status` to read `pending` after the forced end. The human verifier's run observed **`failed`**. The AI investigated and confirmed the cause: Sidekiq is running, `PortfolioGeneratorWorker` (retry: 3) exhausted its retries — the test session has no interview transcript, so generation failed and `sidekiq_retries_exhausted` set `generation_status: 'failed'` + `generation_error`. The finding's validity was unaffected (the endpoint still force-ended the session and created the portfolio artifact); the verification notes were updated to reflect the observed reality instead of the assumption. This is a good example of why manual verification matters: the AI's predicted value was wrong on a non-essential detail.
2. **Guard placement vs the historical false negative:** the fix deliberately writes the proof **before** the `preparing_to_end` event (same instant the in-memory flag is set), so the WS→HTTP timing that previously caused false negatives is byte-for-byte unchanged — only the *persistence* is new. Re-checking coverage inside the endpoint (the old broken design) was explicitly rejected.

*F-06 completed: 6 RSpec examples (full suite 58/0 green), seeded fault proven (AC#1/AC#4 fail without the guard), manual before/after verification confirmed by the human verifier.*
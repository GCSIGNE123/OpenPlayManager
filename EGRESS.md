# Egress — Baselines, Architecture, and Regression Guards

This document is the single source of truth for what "safe" data-access
looks like in this shared Supabase backend (used by both this repo,
**OpenPlayManager/Pro**, and **PickleKingPlayer/Player** — one project,
one `opl_kv` table, one `player-photos` Storage bucket). It exists because
this backend previously had a real, measured egress crisis (a Supabase
`402 exceed_egress_quota` outage), traced to a small number of concrete,
fixable access patterns. Phases 1–5e fixed what they fixed; this file
records exactly what was measured, what changed, what's still open, and
what a regression looks like — so the next person (human or Claude) never
has to re-derive any of it from scratch.

## 1. Old measured baselines (the crisis, pre-Phase-1)

These numbers are frozen historical measurements, not live figures — kept
here permanently for comparison, never updated:

- **`fetchAllLiveSessions()` full-table scan**: ~4.18 MB per call, across
  68 stored `opl-session-*` rows, measured on a snapshot with **zero**
  currently-live sessions — every byte of that was wasted.
- **`fetchAllPlayers()` complete roster fetch**: ~2.52 MB per call, across
  330 `opl-player-*` rows (N+1: one `list`, then one `get` per row).
- **Session row size**: median ≈ 30.8 KB, max ≈ 363.6 KB.
- **Measured production egress**: 15.709 GB total across two days
  (Sept 8: 4.281 GB PostgREST; Sept 9: 5.11 GB PostgREST + 1.362 GB
  Realtime).

## 2. New baseline — as of Phase 5 closeout (2026-09-18)

Live figures, re-measurable at any time via the read-only queries in
§6 below (never guess these — always re-query). Unchanged from Phase 4's
own measurement — no writes have occurred anywhere in this project since
(every phase from 4 through 5e was implementation/testing only, no
commit/push/deploy performed until explicitly authorized):

| Metric | Value |
|---|---|
| Pro production commit | `ca78e5114c52b257b15de2f5569f49e61118af36` |
| Pro production deployment | `dpl_DzHkrvzVBHL3F31WArS16SYDtMrM` (`pickleking.vercel.app`) |
| Player production commit | `807521ca0bf98a7307b237e189db301bfb6f6d12` |
| Player production deployment | `dpl_FQ4k1Z386wpgh7C5YpQ38J43a8x1` (`picklekingplayer.vercel.app`) |
| Supabase project | `ettqcwhkdtxncjciumot` (region ap-south-1) |
| `opl-player-*` row count | 330 (2,643,611 bytes total, ~8 KB avg) |
| `opl-session-*` row count (live) | 68 (4,176,956 bytes total, median ~31.6 KB, max ~372.3 KB — essentially unchanged from the original baseline, as expected: these are ended/historical rows, not actively growing) |
| `opl-tournament-*` row count | 20 (199,690 bytes total, ~10 KB avg, ~20 KB max) |
| `opl-session-index-*` count | 58 (12,882 bytes total) |
| `opl-session-report-*` count | 67 (190,346 bytes total) |
| `opl-playerrating-*` count | 263 (47,282 bytes total — tiny per-row, but see §4a: 263 individual requests today) |
| `player-photos` Storage bucket | exists, `public=true`, 2 MB limit, `image/jpeg\|png\|webp` only |
| `player-photos` object count | **0** — no photo has been uploaded to Storage in production yet (expected: the feature just shipped) |
| Current billing-cycle egress usage | **Not available** — the Supabase CLI has no `usage`/`billing` subcommand; this figure only exists in the Supabase Dashboard's own Usage page, which this tooling cannot query. Do not estimate or fabricate this number — check the Dashboard directly when a real reading is needed. |

**Note on IMPORTANT deployment status**: this file describes what's
**implemented in the working tree**. As of Phase 5 closeout, Phases 5a–5e's
code changes have been implemented and tested but **not yet committed,
pushed, or deployed** — the commit/deployment identifiers above are still
the last actually-shipped state (Phase 3B). Re-check `git log`/`git status`
before assuming any Phase 5 fix is live in production.

## 3. Architecture — what's fixed, and the exact safe access pattern

### 3.1 Player: Open Play session discovery (Phase 1) — ✅ intact, verified

**Never** do a bare scan of every `opl-session-*` row to find "is this
player live somewhere." The safe pattern (`pickleking-player/src/lib/liveSessionApi.js`):

1. `SELECT key, value FROM opl_kv WHERE shared AND key LIKE 'opl-session-index-%'`
   — the lightweight index only (no players/photos/match history).
2. Filter to `status === "active"` candidates (`extractActiveSessionCodes`).
3. If zero candidates, **stop** — zero full-blob bytes fetched (the common
   case, per the original measurement).
4. Otherwise, fetch full blobs **only** for those candidates via an exact
   `.in("key", candidateKeys)` — never a second `.like()` scan.
5. `filterCurrentSessions`/lifecycle rules still run on each candidate —
   the index's `status` is a candidate filter only, never the final
   source of truth (it can lag reality by up to the 15-minute sweep).

### 3.2 Player: Realtime session updates (Phase 2) — ✅ intact, verified

**Never** discard a Realtime payload and re-fetch the whole row on every
change. The safe pattern (`liveSessionApi.js`'s `subscribeToSession` +
`realtimeSessionEvents.js`):

- INSERT/UPDATE → the payload's `new.value` is the complete, authoritative
  new row (Postgres logical replication always sends the full new row) —
  parse and apply it directly, no fetch.
- DELETE → means "the session is gone," nothing to fetch.
- Reconnect (a `SUBSCRIBED` status **after** the first one) → this is the
  **one** case a genuine re-fetch is required, since Realtime never
  replays events missed while disconnected.

### 3.3 Photos (Phase 3A/3B) — ✅ intact, verified

- A player may have no photo (`photo: null`) — never blocked, never a
  generated placeholder image.
- A **new** photo is uploaded to the `player-photos` Storage bucket, never
  written as base64: Player uploads directly (RLS-authorized via
  `player_identity_links`); Pro (no auth system) goes through the
  `upload-player-photo` Edge Function, the bucket's only writer for Pro.
- An **existing** base64 `photo` (written before Storage existed) is left
  completely alone — no migration, no rewrite, ever, unless a future phase
  explicitly authorizes one.
- `photo` is always exactly one of: a legacy `data:image/...` base64
  string, a `https://.../storage/v1/object/public/player-photos/...` URL,
  or `null`. Every render site treats all three identically.

## 4. Fixed by Phase 5 (5a–5e) — no longer open risks

All five confirmed present, intact, and covered by automated regression
guards as of the Phase 5 closeout reassessment (2026-09-18):

| Item | Fixed by | Guard |
|---|---|---|
| Pro's 5 read-only Realtime discard-refetch consumers (`TournamentDisplayView.jsx` ×2, `OpenPlayTVModePage.jsx`, `PlayerPortalScreen.jsx` ×2) | 5a | `scripts/verify-egress-guards.mjs`, `scripts/verify-realtime-storage-events.mjs` |
| Pro's organizer dashboard (`PickleballOpenPlay.jsx`'s `load()`/Realtime path), preserving its `updatedAt` staleness guard exactly | 5b | same |
| Pro `fetchAllPlayers()` N+1 (331 requests → 1 bulk request) | 5c | `scripts/verify-fetch-all-players.mjs` |
| Pro `fetchAllPlayers()` shared 8s cache + successful-save invalidation | 5d | `scripts/verify-async-cache.mjs`, `scripts/verify-fetch-all-players.mjs` |
| Player Live Tournament Realtime discard-refetch (`LiveTournamentScreen.jsx`) | 5e | `tests/egressGuards.test.js`, `tests/liveTournamentRealtimeRules.test.js` |

## 4a. Newly discovered remaining risks (found during Phase 5 closeout re-audit, 2026-09-18)

**Correction to an earlier assumption**: tournament indexing (5f) is
**not** the only deferred major item. Re-searching Pro for the exact same
`list()`-then-`Promise.all(keys.map(get))` N+1 shape Phase 5c fixed for
players found it **also present, unchanged, in several other Pro lib
files** — never in Phase 5's original four-item scope, so never
previously audited or fixed:

| File → Function | Current measured volume | Request-count cost | Notes |
|---|---|---|---|
| `src/lib/ratingModel.js` → its list-all-ratings function | 263 rows, 47,282 bytes total | **264 requests** (1 list + 263 get) for ~47 KB | Worst request-count-to-bytes ratio of anything measured — tiny payload, huge round-trip count. |
| `src/lib/sessionReportModel.js` → its list-all-reports function | 67 rows, 190,346 bytes total | 68 requests | Same shape as the old `fetchAllPlayers()`, smaller scale. |
| `src/lib/sessionIndexModel.js` → its list-all-index function | 58 rows, 12,882 bytes total | 59 requests | Ironically, the very index Phase 1 introduced to avoid a full-session-scan is itself read via the N+1 pattern (small in bytes, real in request count). |
| `src/lib/courtDatabase.js`, `venueModel.js`, `bookingModel.js` | 4, 1, 4 rows respectively | ≤5 requests each | Negligible today at this volume. |
| `src/lib/leagueModel.js`, `membershipPlans.js`, `organizationModel.js`, `userDatabase.js` | **0 rows** (unused/architecture-only features per their own constants.js comments) | 1 request each (list only, nothing to `get`) | Zero current impact — structurally present but inert until these features are actually used. |

None of these were fixed in Phase 5a–5e (out of scope) and none are fixed
by this closeout reassessment either — this section exists to correct the
record and give a future phase an accurate starting inventory, not to
silently address them.

**Player-side**: re-confirmed clean — every Player read of multiple rows
already uses a bulk `.in("key", keys)` select (`PartnerHistoryScreen.jsx`,
`discoverApi.js`, `liveSessionApi.js`, `openPlayRankingApi.js`,
`pkrRankingApi.js`). The N+1 pattern is Pro-specific, living entirely in
how several `lib/*Model.js` files use the `window.storage.list()`+`get()`
combination.

Not a risk (re-verified during this closeout): Player's
`subscribeToOrganizerMessages` (one channel per mount, proper cleanup,
payload consumed directly, no refetch) and Pro's `messagingApi.js` (no
Realtime subscription at all).

## 4b. Remaining deferred item: tournament indexing (5f)

`(Player repo)` `src/lib/liveTournamentApi.js` → `fetchAllTournamentsWithUpdatedAt()`
remains unindexed: one bulk `select(value, updated_at)` scan of every
`opl-tournament-*` row (20 rows, 199,690 bytes today), the same
structural shape Phase 1 fixed for sessions via `opl-session-index-*` —
but tournaments never got their own lightweight index, so every call
downloads every tournament's full value regardless of whether the calling
player is even entered in it.

**Reassessed cost comparison** (current data volume × blast radius),
per the explicit request to re-evaluate before committing to 5f:

| Source | Bytes per call | Requests per call | Blast radius to fix |
|---|---|---|---|
| Tournament discovery (5f candidate) | ~200 KB | 1 (already a single bulk query) | **High** — requires new write-side index infrastructure in **Pro** (mirroring `sessionIndexModel.js`) plus new read-side logic in **Player**; a genuine two-repo, cross-team change. |
| Pro `fetchAllPlayers()` *before* 5c/5d | ~2.64 MB | 331 | Low — single-repo, mechanical (5c took one focused session to implement and test). |
| Pro's newly-found `ratingModel.js` N+1 (§4a) | ~47 KB | 264 | Low — same single-repo, mechanical fix as 5c, smaller scope. |
| Session Realtime payloads (pre-5a/5b) | ~61 KB avg per event, continuous during a live session | 1 extra fetch per change event | Low — proven pattern, already applied 7 times across two repos. |

**Conclusion**: tournament discovery's current absolute cost (200 KB, one
query) is smaller than several items already fixed this phase, and
smaller than the newly-found `ratingModel.js`/`sessionReportModel.js` N+1
patterns in **request count**. Its blast radius to fix is also the
**highest** of anything in this document — the only item requiring new
cross-repo write-side infrastructure rather than a local read-path change.
This combination (lower-than-already-fixed-items cost, highest blast
radius) is why 5f remains the correct thing to defer, not because it's
uniquely large — a future phase revisiting priority order should
seriously consider the newly-found `ratingModel.js`/`sessionReportModel.js`/
`sessionIndexModel.js` N+1 fixes (§4a) first, since they're structurally
identical to the already-proven 5c fix and cost far less to implement.

**Concrete trigger condition for revisiting 5f** (an engineering
decision, not a measured-usage finding — no telemetry currently
supports a specific GB/day number):

- `opl-tournament-*` row count grows past **~100 rows** (5× today's
  volume), **or**
- Player's `findMyActiveTournament`/`anyActiveTournamentExists` call
  frequency increases materially (e.g., a new screen starts polling it on
  every focus/visibility regain the way the pre-Phase-1 session discovery
  once was), **or**
- Actual Supabase Dashboard usage crosses the 2 GB "investigate" threshold
  (§7) and this function shows up as a contributing source in that
  investigation.

Whichever comes first should prompt re-opening 5f as its own scoped,
two-repo phase — not before, given its blast radius relative to its
current, actually-measured cost.

## 5. What constitutes a regression

Any of the following, in either repo, is a regression against this
document and should block a release until reverted or re-justified here:

1. A new bare `.like("key", \`opl-session-%\`)`-shaped scan (or the
   equivalent for `opl-player-*`) that bypasses an existing index/narrow
   key list.
2. `subscribeToSession`'s Open Play session path discarding its Realtime
   payload and calling `fetchSessionState` outside the `resync` branch.
3. A new player-photo write path that assigns a raw resized `data:` URL
   directly into `emptyPlayerRecord`/`savePlayerRecord`/`createPlayerProfile`/`updateMyProfile`
   without going through `uploadPlayerPhoto`/`isFreshlyPickedPhoto` first.
4. A direct Storage `.storage.from(...)` write appearing anywhere in Pro's
   client code (Pro must never regain unrestricted Storage INSERT — all
   Pro uploads go through the Edge Function, by design).
5. Any migration or rewrite of existing base64 `photo` values that wasn't
   explicitly, separately authorized.
6. Any of Pro's 5 read-only Realtime consumers, or `PickleballOpenPlay.jsx`'s
   organizer dashboard, going back to discarding its Realtime payload and
   calling `window.storage.get(...)` unconditionally (5a/5b).
7. `PickleballOpenPlay.jsx`'s `updatedAt` staleness comparison being
   removed, reordered, or bypassed (5b).
8. `fetchAllPlayers()` going back to `window.storage.list()` + N×`get()`,
   or being called without going through `playersCache.get()` (5c/5d).
9. `savePlayerRecord()` invalidating the roster cache *before* (or
   without regard to) a successful `window.storage.set()` — invalidation
   must only ever follow a write that actually succeeded (5d).
10. Player's `subscribeToTournament`/`LiveTournamentScreen.jsx` going back
    to discarding its Realtime event and calling `fetchTournamentState`
    unconditionally (5e).

`scripts/verify-egress-guards.mjs` (Pro) and `tests/egressGuards.test.js`
(Player) encode narrow, automated checks for all of the above — see §8.

## 6. Re-measuring the baseline (read-only, safe to re-run anytime)

```sql
-- opl-player-* count and size
SELECT count(*), sum(length(value)), avg(length(value))::int
FROM public.opl_kv WHERE key LIKE 'opl-player-%';

-- opl-session-* (live) count and size
SELECT count(*), sum(length(value)), avg(length(value))::int, max(length(value))
FROM public.opl_kv WHERE key LIKE 'opl-session-%'
  AND key NOT LIKE 'opl-session-index-%' AND key NOT LIKE 'opl-session-report-%';

-- Storage bucket + object count
SELECT b.id, b.public, b.file_size_limit,
  (SELECT count(*) FROM storage.objects o WHERE o.bucket_id = b.id) AS object_count
FROM storage.buckets b WHERE b.id = 'player-photos';
```

Run via `supabase db query --linked "<sql>"`. Billing-cycle egress itself
must be read from the Supabase Dashboard's Usage page — there is no CLI
equivalent.

## 7. Monitoring thresholds (internal engineering thresholds — not Supabase's own quota limits)

These are the thresholds this project has used since the original egress
investigation, for **deciding when a human should look at usage**, not
automated alerts:

| Threshold | Action |
|---|---|
| 1 GB | Watch |
| 2 GB | Investigate |
| 3 GB | Optimization review |
| 4 GB | Emergency review |
| 5 GB | Quota-risk threshold |

**No automated alerting exists for these thresholds.** Nothing in this
repo or the Supabase project currently sends a notification when usage
crosses any of them — this table is a manual-check reference only. If
automated alerting is ever added, this section must be updated to say
exactly what was configured and how it was verified; until then, do not
describe these as active alerts.

## 8. Regression guard tests

- **Pro**:
  - `scripts/verify-egress-guards.mjs` — the main source-text-level
    regression guard file (5a–5e's anti-pattern checks).
  - `scripts/verify-realtime-storage-events.mjs` — `parseStorageChangePayload`/
    `createResyncStatusHandler`/`resolveRealtimeUpdate` unit tests (5a/5b).
  - `scripts/verify-fetch-all-players.mjs` — `fetchAllPlayers()`/
    `savePlayerRecord()` integration tests, mock-client call counting (5c/5d).
  - `scripts/verify-async-cache.mjs` — the `createAsyncCache` primitive,
    tested with an injected clock (5d).
  - Run all of Pro's tests via `node .scratch_vercel/run-all-verify.mjs`
    if present, or each `scripts/verify-*.mjs` individually.
- **Player**:
  - `tests/egressGuards.test.js` — the main source-text-level regression
    guard file (Open Play + Tournament anti-pattern checks).
  - `tests/liveTournamentRealtimeRules.test.js` — `resolveTournamentRealtimeEvent`
    unit tests (5e).
  - Both run as part of `npm test`.

These are lightweight, source-text-level and pure-logic checks (not full
behavioral/integration tests against a real Supabase project) — see each
file's own header for exactly what it does and doesn't prove.

## 9. Recommended observation period before any legacy-photo migration

No existing base64 photo should be migrated to Storage until at least
one full billing cycle has passed with the new upload paths live in
production, so:

- Real-world upload volume/size can be observed against the 2 MB cap and
  the monitoring thresholds above, with actual Dashboard egress numbers
  (not estimates).
- Any latent issue with the Edge Function (Pro) or the RLS policy
  (Player) surfaces under real usage before a migration adds write load
  on top.

A specific recommended minimum: **one full Supabase billing cycle** (this
project's cycles have run in Sept 8–9 windows historically) with the
Storage-backed upload path live, and zero unresolved Phase 3B-related
defects reported in that window, before considering a legacy-photo
migration proposal.

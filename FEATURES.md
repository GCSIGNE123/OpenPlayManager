# Open Play Manager Feature Backlog

## Development Rule

Only one feature should be implemented per development task.

Before making any code changes:

1. Read FEATURES.md.
2. Explain the implementation plan.
3. Wait for organizer approval.
4. Implement only the selected feature.
5. Mark the feature complete when finished.

Do not implement multiple unrelated features in a single task.

## 🚧 In Progress

## 🔥 High Priority

- [x] Multi-Tenant Venue Architecture
  - Venue entity
  - Venue dashboard
  - Venue ownership model
  - Venue-ready modules
  - Future organization support
  - Multi-tenant foundation
  - ✅ Active Venue Workspace Architecture
    - Active Venue Context
    - Venue Workspace Model
    - Multi-Venue Ready
    - Venue-scoped Navigation
    - Future Authentication Ready
- [x] Court Booking & Reservations
  - Booking Dashboard
  - Court Management
    - Court Photos
    - Surface Type
    - Court Status Badges (Available, Reserved, Maintenance, Inactive)
    - ✅ Court Management UI
      - Visual Court Cards
      - Court Photos
      - Surface Badges
      - Equipment Badges
      - Operational Statuses
      - Reservation Summary
      - Responsive Grid Layout
  - Booking Calendar
    - ✅ Interactive Reservation Timeline
    - Day View
    - Week View
    - Click-to-Create Reservation
    - Click-to-Edit Reservation
    - Conflict Detection
    - Live Current Time Indicator
  - Availability Engine
  - Conflict Detection
  - Booking CRUD
  - Reservation Status
- [x] Open Play TV Mode
  - Live Court Display
  - Live Standings
  - Queue Display
  - Next Match Display
  - Smart TV Optimized
  - Full Screen Mode
  - Real-time Updates
  - Player Photos & Broadcast Experience
  - ✅ TV Mode 2.0
    - Broadcast-style TV layout
    - 40% Live Matches
    - 40% Upcoming Matches
    - 20% Live Standings
    - Persistent venue/session header
    - Highlighted "Next on Court"
    - Full-screen TV optimization
    - Large-screen responsive design
  - ✅ TV Mode Layout Optimization
    - 45/35/20 display ratio
    - Live Courts panel
    - Compact Up Next cards
    - Simplified Standings
    - Future adaptive layout support
  - ✅ TV Mode Layout Rebalancing
    - 45/20/35 display ratio (Live Courts unchanged, Up Next narrowed, Standings widened)
    - Up Next typography/spacing rescaled for the narrower column
    - Standings gains more room for names before truncation
  - ✅ TV Mode - Up Next Card Optimization
    - Layout ratio (45/20/35) unchanged
    - Smaller avatars (~12%) and tighter avatar/name/VS spacing
    - Smaller, less dominant "NEXT ON COURT" badge
    - Slightly smaller player-name font so more characters show before truncating
    - Non-highlighted cards get their own more compact padding
    - First upcoming match still visually emphasized (accent border/background/badge)
  - ✅ TV Mode - Standings Expansion
    - 40/30/30 display ratio (Live Courts narrowed, Up Next widened, Standings resized for a fuller table)
    - Standings gains a labeled header row and W/L columns alongside the existing SPR value (reused as-is, not recalculated)
    - Up Next sizing rescaled back up for the wider 30% column
    - More room for longer player names before truncation
- [x] Expected Playing Opportunities (Session Duration-Based Estimate)
  - Session Duration input (hours, decimal-friendly) replaces manual Expected Games Per Player entry
  - Configurable Average Match Duration (default 15 minutes)
  - Read-only, auto-computed estimate — never manually editable
  - Live-updates on courts/duration/registered players/match duration changes
- [x] Player Checkout During Session
  - Player participation status
  - Mid-session checkout
  - Checkout timestamp
  - Active and Checked Out player sections
  - Future-ready status model
- [x] Guaranteed Upcoming Match Queue
  - Upcoming matches are always generated automatically whenever complete matches can be formed from waiting players (no manual "Regenerate matchups" needed)
  - Skill balancing is preferred but never blocks play — same-skill pairings are used automatically when a balanced mix isn't available
  - Existing fairness rules (waiting time, fewest games played, avoid repeat teammates/opponents) remain the primary pairing algorithm throughout
  - Superseded by Smart Queue Management's queue-depth cap below: the queue is no longer generated without limit — see that section for the current behavior (still auto-regenerates, just bounded to Live Courts − 1)
- [ ] Progressive Skill Rotation
- [x] Progressive Skill Rotation automatically falls back to a randomized first round when all registered players belong to the same skill level. Normal Progressive Skill Rotation resumes from Round 2 onward.
- [x] Adaptive Skill Rotation
  - Separate Beginner and Intermediate divisions
  - Automatic promotion after 3 consecutive wins
  - Automatic relegation after 3 consecutive losses
  - Manual facilitator skill override
  - Existing fairness engine preserved
  - ✅ Winner vs Winner Preference
    - Within each division, players coming off a win are preferred as opponents for other players coming off a win (same for losses)
    - A soft scoring preference, never a hard requirement — repeat-opponent avoidance always still wins if the two conflict
    - Partners keep rotating every match — team formation is completely untouched by this
    - No separate fallback path needed: a court is never left empty, since the preference simply contributes nothing when it can't be satisfied
  - ✅ Cross-Division Fairness Redesign — bug fix for a real starvation bug: the Beginner and Intermediate divisions used to build their candidate matchups independently and simply get concatenated (Beginner-first) before Smart Queue Management's queue-depth cap sliced the result, so the smaller/less-recently-served division's matchups were silently truncated away entirely, every round, with zero fairness signal weighing in — confirmed by simulation to cause TOTAL starvation of the smaller division (0 games, entire session) even at an even 16/16 split. Fixed by exposing each candidate matchup's full fairness score (`BalancedRotationEngine.scoreFullMatchup` — a new public method composing the existing `scorePartner`+`scoreOpponents`, no scoring logic reimplemented) and having `AdaptiveSkillRotationEngine.generateMatchups` merge every candidate from BOTH divisions onto one shared scale and only then let the existing queue-depth cap slice the top N. **Superseded below** — the original version of this fix ranked candidates by one flat additive number (partner+opponent+winner+a small waiting/games bonus); that part has since been replaced by the Games-Played Imbalance Redesign's lexicographic ranking, for the reasons described there. The starvation fix's core architecture (merge both divisions onto one scale before the cap) is unchanged and still the reason Intermediate/Beginner starvation can't recur.
  - ✅ Games-Played Imbalance Redesign — real-world bug fix: even with the starvation fix above shipped, real Open Play sessions still showed players who checked in simultaneously drifting to large games-played gaps (e.g. 8 vs 2). Root cause (confirmed by simulation, not assumed): team FORMATION (`BalancedRotationEngine.buildTeams`/`scorePartner`) has zero games-played awareness — it only ever considers partner recency — and the flat additive games/waiting bonus the original fairness redesign added was numerically swamped every round by `scorePartner`/`scoreOpponents`'s much larger range (roughly -400 to +200), so a modest partner/opponent advantage could reliably outvote a real games-played disadvantage; raising the bonus weight only plateaued (a 0-10 tuning sweep showed diminishing/reversing returns past ~4-5) — a ranking-ALGORITHM problem, not a weight problem. Fixed by replacing the flat additive score with an explicit lexicographic (tiered) ranking tuple in `AdaptiveSkillRotationEngine.generateMatchups`: **(1)** lowest average games played across the matchup's 4 players, **(2)** lowest maximum games played among those 4 (guards against an already-over-served player "riding along" with a needy partner — a matchup only wins tier 1 on average if even its most-played member isn't propping that average up), **(3)** the existing matchup quality score (`qualityScoreFor` — partner diversity + opponent diversity + Winner-vs-Winner, exactly the same inputs as before, just no longer summed with games/waiting), **(4)** the waiting bonus (`waitingBonusFor`, unchanged) as the final tiebreak. Chosen after simulating three candidate primary keys (lowest MINIMUM games, lowest AVERAGE games, and this avg-then-max tuple) across 20-40 seeded trials each at realistic (~3h) and long (~15h) session lengths — average-based ranking clearly beat minimum-based, and the avg-then-max tuple matched or exceeded plain average-based on every metric with no measurable downside (see TESTING.md for the full comparison tables, including a final before/after comparison against the previous shipped algorithm: games-played spread dropped from 4.93 to 3.17 at realistic session length, from 8.6 to 3.5 over a long session, with waiting time, partner diversity, opponent diversity, promotions/relegations, and court utilization all unaffected or improved, and zero starvation in any of 100+ trials). `GAMES_BONUS_WEIGHT` is removed (superseded by the tuple's tiers 1-2); `WAIT_BONUS_WEIGHT` remains, now used purely as tier 4. Team formation, partner/opponent scoring, and Winner-vs-Winner scoring are completely untouched — only the PRIORITY ORDER in which already-diversity-optimized candidates are considered changed. A permanent regression test (`verify-adaptive-skill.mjs` section 13) simulates 10 seeded ~3-hour sessions with every player checked in simultaneously and asserts the games-played spread never approaches the old bug's scale (8 vs 2) again. Promotion/relegation, Smart Queue Management, Smart Court Dispatch, Beginner/Intermediate separation, and every other rotation mode remain untouched — the fix lives entirely inside `AdaptiveSkillRotationEngine`
- [x] Smart Queue Management
  - Limited upcoming queue — Upcoming Matchups = Live Courts − 1 in steady state (enough to fill every automatic court before the session's first match, so "Fill all open courts" always has something to deploy)
  - Waiting timer — "Waiting Xm" from a player's last match end, or "Checked in Xm ago" before their first match; updates live, no session save required
  - Hold Match / Resume Match / Cancel Match — reserve an upcoming matchup out of automatic court assignment without dissolving it; Resume restores its original queue position (never sent to the back); Cancel dissolves it and returns all 4 players to the waiting queue
  - Skip Player — moves a player to the back of the waiting queue (restroom, water, brief absence) while keeping them fully eligible for matchmaking the whole time
  - Hold Player / Resume Player — temporarily excludes a player from matchmaking while preserving every stat, streak, and payment field; player stays checked in
  - Queue Status — reusable canonical statuses (Playing, Upcoming, Waiting, Held, Checked Out) computed fresh from session state, not stored
  - Queue regeneration is automatic on every relevant event (check-in, checkout, resume, skip, held-player-resume, matchup-cancelled) — no manual action needed
  - All 7 queue actions (holdPlayer, resumePlayer, skipPlayer, holdMatch, resumeMatch, cancelMatch, regenerate) are reusable, UI-agnostic functions (`src/lib/queueManagement.js`) — ready for future features like Smart Court Dispatch or voice announcements to call directly
  - Held Match dissolution notice — if a held matchup is automatically dissolved (a player checks out, changes skill division, is substituted, moved to queue, removed, or held), the facilitator gets a toast and a permanent entry in a new Queue Activity Log; dissolving an ordinary (not-held) matchup stays silent, same as before
  - ✅ Pre-Check-In Skill Correction — a registered player who hasn't checked in yet shows their current skill (BEG/INT tag) as a one-tap toggle button, right in the Check-In tab's "not yet here" list — tapping it flips Beginner↔Intermediate instantly, before check-in, so a facilitator correcting a roster mistake for a 32-player check-in only needs one tap per correction. This is a roster-data correction, not a mid-session promotion/relegation: the new pure `setPreCheckInSkill` (`lib/utils.js`) deliberately does NOT touch `skillChangeLog` (so it never shows up in the Skill Change Activity Log or counts toward Session Analytics' promotion/relegation stats), does NOT reset `streak`/`lossStreak` (nothing to reset pre-check-in), and does NOT dissolve any reserved matchup (an unchecked-in player is never reserved in one) — a no-op, by construction, once the player is checked in. Once checked in, the existing in-session `changePlayerSkill` mechanism (Waiting Players panel) is the only skill-change path from that point on — no second, competing implementation. Skill is roster data regardless of rotation mode, so this works identically whether or not the session's active rotation mode segregates by skill. Once checked in, Adaptive Skill Rotation immediately places the player using the corrected skill on the very first matchup-generation call. `AdaptiveSkillRotationEngine`, the games-played fairness tuple, Smart Queue Management's other actions, Smart Court Dispatch, Held Player Reminder, and Session Analytics are all untouched.
  - ✅ Sprint 2.1 — Richer Queue Activity Log
    - The full dissolved matchup (both teams' player names) is captured at the moment of dissolution — never reconstructed afterward — alongside matchup ID, reason, the responsible player, and a timestamp
    - The Queue Activity Log renders each entry as a small scannable card ("Held Match Removed" / Team A vs Team B / Reason / time) instead of a single dense line
    - No change to Hold Match/Resume Match/queue priority/regeneration/matchmaking/rotation engines — purely a logging/UI improvement
    - Remains fully rotation-mode-agnostic, same as the base Held Match dissolution notice
  - ✅ Held Player Reminder — a facilitator safeguard, not a matchmaking feature: if a held player stays held for a configurable amount of time (default 20 minutes) OR a configurable number of completed rounds (default 3), a small non-blocking reminder card appears — "`{name}` has been held for `{X}` minutes (`{Y}` completed rounds) — Resume?" with **Resume**/**Keep Held** buttons, matching the reminder mockup exactly. Whichever threshold is reached first triggers it. **Resume** calls the exact same Resume Player action the Waiting Players panel's own button uses — no separate code path. **Keep Held** only dismisses that device's card; the player stays held, session state is completely untouched, and the reminder becomes eligible again on its own once the configurable repeat interval (default 10 minutes) elapses — it never re-fires immediately. Supports multiple simultaneously-held players, each with an independent card, stacked. All three thresholds are configurable in Session Settings. Every time a reminder actually fires, a `heldPlayerReminder` entry is recorded in the same shared Queue Activity Log Sprint 2.1 introduced. Two new fields (`heldAt`, `heldAtRound`) are set fresh by `holdPlayer` and cleared by `resumePlayer`; a third (`heldReminderLastShownAt`) gates the repeat interval — all three are read ONLY by the reminder's own pure query function (`getPlayersNeedingHeldReminder`, `lib/queueManagement.js`), never by any rotation engine or `courtDispatch.js`, so this can never affect matchmaking or player priority, exactly as required. The visible-reminder set is lifted to `PickleballOpenPlay.jsx` (not local to `ScorerView`) for the same reason `queueActivityLogExpanded` already is — `ScorerView` unmounts on every tab switch, and an already-due reminder shouldn't vanish just because the facilitator glanced at another tab.
    - ✅ Facilitator convenience — skill level + last court context on the reminder card: each card now also shows the player's current skill division (Intermediate/Beginner) and a "Last played: ..." line, matching the requested mockup ("Alfred / Intermediate / Last played: Court 2"). Purely additive display data computed in `PickleballOpenPlay.jsx` at render time from data that already exists — a new read-only helper, `getLastCourtForPlayer(state, playerId)` (`lib/queueManagement.js`), scans `matchHistory` backwards for the player's most recent completed match and returns its court number, or `null` if they've never played. For players with 0 games, the copy distinguishes two cases per spec: "Not yet played" for someone who's been checked in since close to session start (checked in within 5 minutes of `sessionStartedAt`) versus "Waiting for first match" for someone who checked in well after the session was already underway (a mid-session check-in / walk-in). Nothing about the reminder's own timing, thresholds, repeat-interval gating, or Queue Activity Log entries changed — `getPlayersNeedingHeldReminder`/`markHeldReminderShown`/`holdPlayer`/`resumePlayer` are all untouched, and `getLastCourtForPlayer` is a brand-new, side-effect-free function that only reads `matchHistory` — it does not read or write `heldAt`/`heldAtRound`/`heldReminderLastShownAt` and cannot affect matchmaking, queue order, or player priority.
- [x] Smart Court Dispatch
  - Automatic Court Dispatch — whenever a court becomes available (a completed match, an unlocked manual court, an undone round, or any other action), the highest-priority eligible upcoming matchup is dispatched automatically, no facilitator action required
  - A reusable dispatch SERVICE (`src/lib/courtDispatch.js`), not tied to any single action — it runs inside the app's single `save()` write path, the same way Queue Management's own regeneration already does, so it reacts to any court becoming available rather than being coupled to match-end specifically
  - Fully respects existing Queue Management: never dispatches a Held Match, a matchup containing a Held Player, a checked-out player, an incomplete/dissolved matchup, a manual-assignment court, or a Court Booking-reserved court — if the first upcoming matchup can't be dispatched, the next eligible one is used instead, with the queue's order otherwise fully preserved
  - Manual dispatch (Assign match / Fill all open courts / Generate remaining courts) now shares the exact same matchup-selection logic as automatic dispatch — one single definition of "what's next" for the whole app
  - `Dispatching` is a dedicated court status (distinct from Open/Live/Finished) — a dispatched court shows "Calling Players..." with its teams already visible, before scoring starts
  - Dispatch Confirmation — a dispatched court stays in `Dispatching`/"Calling Players..." until the voice announcement finishes (or the announcement delay elapses if announcements are muted/unsupported), then automatically becomes Playing — unless Auto Start Match is off, in which case it stays `Dispatching` until the facilitator clicks "Start Match"
  - Voice Announcements via the browser's native Speech Synthesis API (no external service): "Court N. A and B, versus C and D. Please proceed to Court N."
  - Repeat Announcement — available on both `Dispatching` and Playing (Live/Finished) courts; replays the same announcement from the court's current team assignment without regenerating anything
  - Session Settings: Auto-fill Courts (default ON), Auto Start Match (default ON), Voice Announcements ON/OFF, Announcement Volume, Announcement Voice, Announcement Speed, Announcement Delay (Immediate/2s default/5s/10s) — all rotation-mode-agnostic and persisted for the session
  - Every dispatch/announcement event (court automatically dispatched, voice announcement completed/repeated, announcement muted/skipped) is recorded in the same Queue Activity Log Sprint 2.1 introduced, enriched with court number and both teams' player names, not just a prose description
  - TV Mode Integration — plain browser CustomEvents (`CourtAssigned`, `AnnouncementStarted`, `AnnouncementCompleted`) are fired on every dispatch/announcement so TV Mode can subscribe later; no visual redesign in this sprint
  - Dispatch never depends on a successful voice announcement — court assignment is always persisted first, before any announcement is even attempted
  - Zero rotation-specific code: nothing in Smart Court Dispatch reads `rotationMode` or any engine file, so it works identically under Continuous, Progressive Skill, Adaptive Skill, Winner Pool, or any future rotation mode
  - ✅ Bug fix — multiple open courts now all get populated in one pass (previously only Court 1 dispatched; Courts 2/3 stayed open forever once Court 1 became occupied, because the queue-depth cap collapsed to 0 the moment any court was occupied, regardless of how many others were still open). `dispatchAvailableCourts` is now an explicit iterative loop over every open automatic court, and `maxUpcomingMatchups` never caps the queue below the number of courts still open right now
  - Adaptive Skill Rotation, the Winner vs Winner preference, the fairness engine, TV Mode, and the payment system are all untouched by this sprint
  - ✅ Scorer Layout — Prioritize Courts: Courts now render above the Queue Activity Log (facilitators spend nearly all their time on court controls, not reading the log), and the log is a collapsible panel — "Queue Activity Log (N)" with Expand/Collapse, collapsed by default, remembering the facilitator's choice for the rest of the session (survives switching tabs and back, resets only on a real reload/new session). Collapsed state still shows a one-line "Latest:" summary of the most recent event. Presentation-only — no logging, held-match, dispatch, or voice-announcement behavior changed
  - ✅ Redesign Scorer Tab for Clarity and Readability: player avatars/photos removed from every Scorer-tab player display (court cards, waiting players, next matchups, Fix Teams/substitution pickers) in favor of a plain sequential number + a more prominent bold player name — names-first, easier to scan at a glance. `PlayerChip`/`TeamRow`/`CourtCard` gained an opt-in `hideAvatar`/`index`/`startIndex` prop chain so this only affects the Scorer tab; `BoardView`/`TournamentCourtsView` (which reuse `CourtCard`) are unaffected and still show avatars. Layout reordered to Session Information → merged toolbar (players waiting / Generate remaining courts / Fill all open courts / End session, court +/- stepper folded into the Courts stat) → Waiting Players → Next Matchups → Courts → collapsible Queue Activity Log. The expanded Queue Activity Log was also restyled from multi-line cards to compact single-line rows (kind pill + inline "Court N: Team A vs Team B" + timestamp), capped at the latest 5 entries by default with a "Showing latest N of M activities" / "View full log" (and "Show less") toggle. Presentation-only — every existing interaction (scoring, Won, Fix teams, Repeat Announcement, Assign match, End match early, Automatic/Manual toggle, Lock/Unlock, Substitute, Hold/Resume, Skip, Check Out) is unchanged
  - ✅ Scorer Layout Reorder: Courts now render immediately below the toolbar (top-most section a facilitator sees), followed by Next Matchups, then Active Players (Waiting Players panel + the Adaptive Skill Change Activity Log that travels with it), then the collapsible Queue Activity Log at the bottom. Presentation-only JSX reorder in `ScorerView.jsx` — no component, prop, or logic changes; verified live and against the full automated suite
  - ✅ One Court Per Row (Operational Layout): `courtGrid` changed from a multi-column card grid to a single stacked column — every court now spans the full page width instead of competing for space side-by-side, so facilitators running 20-40+ player sessions can read names/scores/actions without squinting. Team A and Team B render side-by-side within a live court's row (with a vertical divider) on wide screens, and wrap to stacked sub-rows on narrower/tablet widths rather than overflowing — same treatment applied to the Dispatching ("Calling Players...") and awaiting-pair states. The open-court row (Automatic/Manual toggle, "Court is free"/"Reserved via Court Booking", Assign match) was also merged into one inline row instead of two stacked blocks. Presentation-only — no Smart Court Dispatch, Queue Management, matchmaking, or scoring logic touched
- [x] Player Payment Tracking (Hotfix) — session-scoped Paid/Unpaid status and Cash/GCash method, so a facilitator can tell each checked-in player's payment state at a glance during Open Play. Every player record gains `paymentStatus` ("unpaid" default) and `paymentMethod` (`null` default, set to `"cash"`/`"gcash"` once paid) — set fresh at both player-creation sites (`startSession`'s roster, `quickAddCheckIn`'s walk-in path), so it's genuinely reset to defaults for every new session, never carried over, and never touches the Player Database (payment belongs to the session, not the roster record). New pure `setPlayerPayment(state, playerId, method)` (`lib/queueManagement.js`) is the single mechanism for both marking a player Paid and correcting a mistaken method later (Cash ↔ GCash) — the same one-click tag toggles the method once already paid, mirroring the Pre-Check-In Skill Correction's tap-to-toggle pattern. New compact `PaymentBadge` component renders a scannable tag beside every checked-in player wherever they already appear — "UP" (unpaid, coral) or "P-C"/"P-GC" (paid, green) — with one-click Cash/GCash buttons shown only while unpaid: Waiting Players panel and Standings render the full interactive badge; court/matchup player rows (`PlayerChip`, shared by `CourtCard`/`TeamRow`/`NextMatchupCard`) render the compact read-only tag only, matching "when space permits." Every payment change is recorded in the same shared Queue Activity Log other features already use (`paymentReceived` for the first Paid mark, `paymentUpdated` showing the "Cash → GCash" correction), with matching Scorer-tab log labels/summaries. New pure `derivePaymentStats(players)` (only counts checked-in players) drives both a facilitator-reference stats panel in the Scorer tab (Players Paid/Unpaid, Cash/GCash) and an additive "Payment Summary" section in the Session Analytics & Fairness Report (Total Players/Paid/Unpaid/Cash/GCash — also included in the report's CSV export) — purely additive fields that never feed into `gamesFairnessScore`/waiting/diversity/grade, so none of Session Analytics' existing calculations changed. `AdaptiveSkillRotationEngine`, the games-played fairness tuple, Smart Queue Management, Smart Court Dispatch, and Held Player Reminder are all untouched — `setPlayerPayment` never reads or writes `queueIds`/`nextMatchups`/`skill`/`games`/streaks.
- [x] Session Analytics & Fairness Report — Sprint 4A (Analytics Engine, V1)
  - A new, reusable, React-free module (`src/lib/sessionAnalytics.js`) computes every metric below from plain session state — the UI only ever renders what it returns, never computes a metric itself, so a later sprint can persist/export/reopen the exact same shape without this module changing.
  - Clicking "End session" no longer ends the session immediately — it computes and displays the full report first (`SessionAnalyticsReport.jsx`, full-screen). The facilitator reviews it, then either confirms (the session actually ends — delete + leave, same as before) or cancels (report dismissed, session continues exactly as it was, nothing touched). **V1 scope: review-and-confirm only** — the report is not saved anywhere, there's no Session History integration yet, and no PDF/CSV/JSON export yet; all deferred to a later sprint.
  - Session Summary: session name, rotation mode, real elapsed duration (new `sessionStartedAt`, set once at session creation), court count, player count (checked-in participants only).
  - Participation: average/highest/lowest games played, standard deviation, and the **Games Fairness Score** (explicitly renamed from a bare "Fairness Score," per direction — it's one input into the overall Session Grade, not fairness in general) — same `100 × (1 − stdDev/avg)` formula `RotationSimulationEngine.js`'s `calculateFairnessStats` already used, reused here rather than redefined.
  - Waiting Analysis, backed by **real tracking, not after-the-fact estimation**: three new per-player fields (`totalWaitMs`, `longestWaitMs`, `waitPeriodsCount`) accumulated inside `PickleballOpenPlay.jsx`'s central `save()` — the single write path every action (manual assignment, Fill all open courts, Generate remaining courts, Smart Court Dispatch) already funnels through — by diffing which players newly transitioned from waiting onto a court each save. Purely observational: reads the outcome of matchmaking/dispatch decisions, never influences them. Reports Average Waiting Time (mean of each player's own average wait), Longest Waiting Time, and Average Time Between Games (a session-wide pooled average of the same data — a deliberately different, complementary view). A new `currentPlayStreak`/`longestPlayStreak` pair (same accumulation point, a sub-1-minute gap between matches counts as "no real wait" and extends the streak instead of resetting it) feeds Players Needing Attention below.
  - Diversity Analysis: average unique partners/opponents, reusing `partnerCounts`/`opponentCounts` exactly as Adaptive Skill Rotation's own fairness scoring already populates them — no new tracking needed.
  - Adaptive Skill Analysis — shown only when `rotationMode === "adaptiveSkill"`: Promotions, Relegations, Manual Skill Changes, Automatic Skill Changes. A new `source: "automatic"`/`"manual"` field was added wherever a `skillChangeLog` entry is already created (both the automatic promotion/relegation path and `changePlayerSkill`'s manual override) so these can be counted reliably instead of string-matching `reason`; a session's `skillChangeLog` entries from before this field existed fall back to that same string-matching, purely so older data still reports something sane.
  - Players Needing Attention: simple, explainable threshold rules (not a black-box score) — fewest games played, longest single wait, longest consecutive playing streak — each shown with the specific reason a player was flagged, so a facilitator can see exactly why.
  - Session Grade: **extensible by design**, per explicit direction — a named, exported weights table (`SESSION_GRADE_WEIGHTS`: 60% games fairness / 30% waiting fairness / 10% diversity) combines independent 0-100 sub-scores into one number, and a separate named band table (`SESSION_GRADE_BANDS`, 95-100 Excellent / 90-94 Very Good / 80-89 Good / 70-79 Fair / below 70 Needs Improvement) maps it to a label. Adding a future sub-score means adding one line to the weights table, not redesigning the grading function or the report shape.
  - Architecture note for future sprints (not implemented yet, per explicit scope): the report shape already carries everything a later "Save the report" / "Session History → View Session Analytics" / PDF-CSV-JSON export sprint would need — nothing about this sprint's data model needs to change to support that.
  - Preserves existing behavior exactly: `BalancedRotationEngine.js`, `AdaptiveSkillRotationEngine.js`, `ProgressiveSkillRotationStrategy.js`, `lib/courtDispatch.js`, `lib/queueManagement.js`, `lib/winnerPoolRound.js`, and every TV Mode component are untouched by this sprint.
  - ✅ Sprint 4B — Session Report Persistence: the report Sprint 4A already computes now survives past the session it was generated from. New `src/lib/sessionReportModel.js` (`saveSessionReport`/`fetchAllSessionReports`/`fetchSessionReportById`) mirrors this app's existing shared-KV-list convention exactly (`leagueModel.js`/`courtDatabase.js`/`tournamentModel.js` — one record per id under a shared prefix, `SESSION_REPORT_PREFIX`, listed via `window.storage.list`) rather than inventing a new persistence pattern. Confirming "End session" now saves the report (id/sessionCode/savedAt + everything `computeSessionAnalyticsReport` returned) BEFORE the live session record is deleted, so a save failure never blocks actually ending the session. New `OpenPlaySessionHistoryScreen.jsx`, reached from the landing page via "View session history →" (same pattern as "View tournament history →"), lists every saved report (venue, rotation mode, date, grade) with a click-to-reopen — reopening reuses `SessionAnalyticsReport.jsx` exactly as-is via a new `onClose`-only (read-only) mode, showing a single "Close" button instead of Confirm/Cancel, guaranteeing the reopened view is byte-for-byte the same shape as what the facilitator saw at End Session, never a second slightly-different rendering. Still nothing else changed: no export (PDF/CSV/JSON) yet, per explicit scope.
  - ✅ Sprint 4C — Session Report Export: three export buttons (Print/PDF, Export CSV, Export JSON) now sit at the top of `SessionAnalyticsReport.jsx`, available both during the End Session review flow and when reopening a saved report from Session History — the exact same buttons, same code path, either way. Reuses `ExportService.js` exactly as Tournament Reports already does, rather than inventing a second export mechanism: CSV goes through its existing generic `{title, columns, rows}` shape (new `src/lib/sessionReportExport.js`'s `buildSessionReportExportTable` flattens the report into that shape — Session/Rotation Mode/Duration/Courts/Players/every Participation-Waiting-Diversity-Adaptive stat/Session Grade/each Player Needing Attention as one row apiece — no new CSV-writing code); JSON is a new `ExportService.exportJSON` method (same Blob → object URL → anchor-click download mechanism as `exportCSV`, downloads the exact report object); PDF is the same browser-native `window.print()` + `@media print` convention `TournamentReportsView.jsx` already established (a print-scoped `#session-report-print-area` id hides the dialog chrome/export buttons/footer, printing only the report itself) — no PDF-generation library, none was needed for Tournament Reports either.
- [ ] Winner Pool Rotation
- [ ] Game History
- [ ] Manual Court Assignment
- [ ] Player Replacement Improvements
- [ ] Session Settings
- [ ] Standings Improvements
- [ ] PWA Support

## ⚡ Medium Priority

- [ ] Player Photos
- [ ] Statistics Dashboard
- [ ] Fairness Simulator
- [ ] Session Reports
- [ ] Export Results
- [ ] Player Search

## 💡 Low Priority

- [ ] Dark Mode
- [ ] CONNECT.PH Branding Improvements
- [ ] Push Notifications
- [ ] Club Profiles
- [ ] Seasonal Statistics
- [ ] DUPR Integration (Future)

## 🏆 Tournament Manager

- [x] Session Type Architecture
- [x] Tournament Engine Foundation
- [x] Round Robin Scheduler
- [x] Tournament Match Management
- [x] Round Robin Standings
- [x] Tournament Completion
- [x] Champion Determination
- [x] Multiple Pool Support
- [x] Playoff Qualification
- [x] Pool Qualification Engine
- [x] Wild Card Qualification
- [x] Best Third Place
- [x] Manual Qualification Override
- [x] Bracket Generation
- [x] Playoff Match Management
- [x] Winner Advancement
- [x] Round Robin Playoff Engine
- [x] Automatic Qualification
- [x] Automatic Bracket Generation
- [x] Automatic Playoff Bracket Generator
- [x] Bronze Medal Match
- [x] Manual Seeding
- [ ] Double Elimination Brackets
- [x] Double Elimination Foundation
- [x] Winners Bracket Progression
- [ ] Losers Bracket Progression
- [ ] Grand Final Reset
- [ ] Double Elimination Reports
- [x] Automatic Winner Advancement
- [x] Winner Advancement Engine
- [x] Automatic Tournament Completion
- [x] Bronze Medal Match
- [x] Placement Matches
- [x] Best-of-3 Finals
- [ ] Best-of-5 Finals
- [x] Live Playoff Bracket
- [x] Court Assignment
- [x] Match Operations
- [ ] Referee Assignment
- [ ] Live TV Display
- [ ] Live Streaming
- [ ] Push Notifications
- [x] Tournament Court Assignment
- [x] Match Queue
- [x] Court Assignment Engine
- [x] Automatic Court Assignment
- [ ] AI Court Optimization
- [x] Tournament Display Mode
- [x] Tournament Templates
- [x] Tournament Settings
- [x] Advanced Seeding
- [ ] Team Events
- [ ] Template Import/Export
- [ ] Shared Organization Templates
- [ ] Public Live Sharing
- [ ] QR Code Access
- [ ] Remote Score Entry
- [ ] Court Optimization
- [ ] Referee Assignment
- [ ] Bronze Match
- [x] Consolation Bracket
- [ ] Double Elimination Tournament
- [ ] Single Elimination Tournament
- [ ] Pool Assignment Methods
- [ ] Elimination Bracket
- [ ] Advanced Tie-breakers
- [ ] Single Elimination
- [ ] Double Elimination
- [ ] Bracket Generator
- [ ] Seeding
- [ ] Tournament Standings
- [x] Tournament Reports
- [x] Tournament Summary
- [x] Tournament History
- [x] PDF Export
- [x] CSV Export
- [ ] Excel Export
- [ ] Email Reports
- [ ] Season Reports
- [ ] League Reports
- [x] Player Portal
- [ ] Player Login
- [ ] Messaging

## 🎨 Branding

- [x] Pickleball King Branding
- [ ] White Label Support
- [ ] Club Branding
- [ ] Theme Customization

## 🔐 Access Control

- [x] Role-Based Access Control
- [ ] Multi-Club Management
- [ ] Custom Roles
- [ ] Enterprise Edition

## 📅 League Management

- [x] League Management
- [ ] Team Leagues
- [ ] League Playoffs
- [ ] Promotion/Relegation

## 🗄️ Player Database

- [x] Player Database Architecture
- [ ] Player Management UI (edit/deactivate)
- [ ] Player Statistics
- [x] Club Rankings
- [ ] Season History
- [ ] DUPR Integration

## 🧑‍🤝‍🧑 Player Management

- [x] Player Management
  - Player Directory
  - Player Profiles
  - Profile Photos
  - Player Statistics
  - Search
  - Sorting
  - Editing
  - TV Mode Integration
- [ ] Online Payments
- [ ] Auto Renewal
- [ ] Family Memberships

## ⭐ Club Rating & Ranking Engine

- [x] Club Rating Engine
- [x] Rating History
- [x] Club Leaderboards
- [ ] DUPR Integration
- [ ] National Rankings
- [ ] Cross-Club Ratings

## ✅ Completed

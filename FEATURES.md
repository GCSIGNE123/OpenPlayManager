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
  - ✅ Revert Paid → Unpaid — `setPlayerPayment` also accepts `"unpaid"` as a third method value, for a facilitator's mis-clicked payment: reverting an already-paid player clears both `paymentStatus` (back to `"unpaid"`) and `paymentMethod` (back to `null`) in one call, logs a `paymentUpdated` Queue Activity Log entry ("Cash → Unpaid" / "GCash → Unpaid"), and is a no-op if the player is already unpaid. `PaymentBadge`'s interactive mode gained a small "Undo" button next to the paid Cash↔GCash-correction tag, so a facilitator can send a player back to the same two-button (Cash/GCash) unpaid state shown before the mistaken click — no separate dialog or confirmation step, matching the rest of this feature's one-click philosophy.
- [x] Court Renaming (Hotfix) — facilitators can give any court a custom display name ("Center Court", "Show Court", "Court A") right from the Scorer tab, without changing anything about how that court actually works. Every court gains a `name` field (`null` default) that's purely a display label — the court's real identifier, `number`, is completely untouched and keeps driving everything it always has (`matchHistory`'s `court` field, Court Booking reservations, Smart Court Dispatch, matchmaking, the Held Player Reminder's "Last played: Court N" text). New pure `renameCourt(state, courtNumber, name)` and `courtDisplayName(court)` (`lib/utils.js`) are the one place "what does this court display as" is decided and set — a blank/whitespace name resets a court back to its default "Court {number}" display. `CourtCard.jsx` gained a small pencil-edit control beside the court badge (Scorer tab only — Live Board/TV Mode/other read-only views show the custom name but never the edit control, since they never receive the `onRename` prop), with an inline text input, Save (Enter or the check button), and Cancel (Escape or the X button) — one facilitator action, no confirmation dialog. Voice announcements (`buildAnnouncementText`, `lib/announcer.js`) now say the custom name too ("Center Court. John and Mike, versus Peter and Carl. Please proceed to Center Court.") when one is set, falling back to "Court {number}" exactly as before when it isn't — fully backward-compatible (the function's new 4th `courtLabel` parameter is optional). Browser-verified live: renamed Court 2 to "Center Court" in the Scorer tab, confirmed it displayed correctly (with the edit pencil) there and, read-only, on the Live Board — zero console errors.
  - ✅ BUG FIX — Court Name Persistence: custom names were silently reverting to "Court N" the instant a match on that court ended. Root cause: every court-reset-to-open path (`endMatch`'s non-pooling branch, and Winner Pool Rotation's `resolveWinnerPoolMatch` in both its odd-court-out and both-courts-in-a-pair-finished branches) used a plain `emptyCourt(court.number)`, which always starts `name` at `null` — the match itself was unaffected, only the label silently reset the moment the court went back to "open". Fixed with one new function, `resetCourtForNextMatch(court)` (`lib/constants.js`) — identical fresh-defaults reset as `emptyCourt`, except it carries the court's current `name` forward — used at all 3 production reset sites. A custom name is now genuinely authoritative for the entire session until the organizer explicitly renames it again. Also closed a related display gap: Queue Activity Log entries (`courtDispatched`/`announcementCompleted`/`announcementRepeated`/`announcementMuted`/`announcementSkipped`/`liveMatchCancelled`) previously rendered `Court {courtNumber}` directly from the raw number, ignoring any custom name — `logDispatchEvent` (`lib/courtDispatch.js`) now also stamps a frozen `courtLabel` (resolved once, at logging time, same "frozen snapshot" precedent as Sprint 2.1's dissolved-matchup team names) that `ScorerView.jsx`'s log-rendering functions now prefer over the plain number, with a graceful fallback for older entries that predate this field. 22 new regression checks (`scripts/verify-court-name-persistence.mjs`).
- [x] Session Persistence Across Refresh (Hotfix) — an F5/browser refresh mid-session no longer drops the facilitator back to the landing page. `localStorage` holds just the plain session code for the device; a new mount effect restores it automatically unless a URL-driven screen (`?display=`, `?openPlayDisplay=`, `?portal=`, the `/openplay/:code/tv` path) already claimed the load, in which case that explicit navigation always wins. A second effect keeps it in sync with whichever session is actually open; `leaveSession` ("switch session") is the one place that clears it, so ending or explicitly switching sessions never leaves a stale code behind (a session that's since been deleted just fails the resume fetch and self-clears). Scorer PIN auth is deliberately NOT persisted — a refresh correctly re-shows the PIN gate if the facilitator returns to the Scorer tab, same security boundary as before.
  - ✅ BUG FIX — mobile refresh/backgrounding reverted to the login page: originally used `sessionStorage`, chosen specifically so a device would never silently auto-resume a stale session days later — but `sessionStorage` is tied to a single tab's lifetime, and mobile OSes (iOS/Android) routinely discard a backgrounded tab's `sessionStorage` to reclaim memory, so a facilitator pulling down to refresh (or just switching apps and coming back) on a phone genuinely lost the session and landed back on the login page, exactly as reported. Switched to `localStorage`, which survives all of that. The original staleness concern is now covered a different way: Auto-End Aged Sessions (`SESSION_AUTO_END_AGE_MS`, `lib/sessionIndexModel.js`'s `sweepAgedSessions`, added in a later sprint) ends any session left running 3+ days regardless of what any one device remembers locally, so a stale local code can never resurrect a long-abandoned session — it just fails the resume fetch (the session's live record is already gone) and self-clears, same as before. Verified live: seeded a session, confirmed a real page reload correctly resumed it, then cleared `sessionStorage` only (simulating exactly what a mobile OS backgrounding/tab-kill does) and reloaded again — the session still resumed correctly via `localStorage`, proving the original mobile-refresh bug is fixed.
- [x] Cancel Live Match — a Live Board/Scorer safeguard for a player stepping away mid-match (toilet break, phone call): a new "Cancel match" button on any "dispatching" or "live" (not yet "finished") court frees that court back to open and reinserts the exact same 4 players' pairing as a new entry at the very front of Next Matchups — "put on next queue" — instead of dissolving the pairing and returning everyone to the general pool. No result is recorded (no games/wins/losses/streaks/matchHistory change) — a full abort, not an early finish (distinct from the existing "End match early" action). New pure `cancelLiveMatch(state, courtNumber)` (`lib/queueManagement.js`) resets the court (preserving its custom name — see Court Renaming above) and returns the 4 players to `state.queueIds` (removed from there when the court originally went live), since `nextMatchups` is only ever a reservation overlay on top of the queue, never a separate pool. Logs a `liveMatchCancelled` Queue Activity Log entry (court + both teams' names + reason). 48 regression checks (`scripts/verify-cancel-live-match.mjs`).
- [x] Facilitator Workflow Improvements (32-player session sprint) — a bundle of workflow fixes gathered from real facilitator observations running a 32-player Open Play session:
  - ✅ Alphabetical Check-In List — the Check-In tab's "Registered players not yet here" list is now sorted A→Z by display name (new pure `getRegisteredNotHere(players)`, `lib/utils.js`), recomputed fresh on every render so it re-sorts automatically the instant a new walk-in registers — no separate "resort" step. Checked-in players still disappear from the list the instant they check in, exactly as before; only the ORDER of what's left changed. 19 regression checks (`scripts/verify-workflow-improvements.mjs`).
  - ✅ Optimize Player Names in the Scorer Tab — `styles.teamNameProminent` (the names-first style court cards use) now lets a long name wrap onto a second line instead of being cut short with "…" (previously inherited a hard `nowrap`/ellipsis from the base `teamName` style), with a much larger guaranteed `minWidth` (40→90) and higher flex-grow priority so names get first claim on available horizontal space before anything else shrinks. Static font size only — no responsive/clamp scaling was needed. Player photos remain removed from the Scorer tab (unchanged from the earlier Scorer Tab Redesign) — this is a CSS-only readability fix, not a photo reintroduction.
  - ✅ Simplify Standings Table — the live Standings tab is reduced to exactly Player/GP/W/L/+/-/RTG, per direct facilitator feedback that it carried more information than needed at a glance. Removed from the Player cell: the skill tag + skill-override button (Adaptive Skill Rotation), the payment badge, and the win-streak flame icon — none of these are lost capabilities, skill correction already lives in the Scorer tab's Waiting Players panel and payment status in both the Waiting Players panel and the Scorer tab's own stats bar; Standings just no longer duplicates them. Session Analytics' own reporting (`lib/sessionAnalytics.js`) — including the reopenable Session History report below — is completely untouched; this only simplified the live, in-session Standings tab's presentation.
  - ✅ Permanent Partner Mode ("Always Pair Players") — a new, OFF-by-default Session Setting: when on, any player with a facilitator-designated partner always stays teamed with that partner; only opponents rotate. Designed as a reusable matchmaking OPTION rather than a special-cased rotation mode or engine — implemented once, in `BalancedRotationEngine.buildTeams` (new `extractFixedPartnerTeams` helper, gated behind a new `alwaysPairPlayers` parameter), the shared team-forming step every mode that composes `BalancedRotationEngine` already reuses. Concretely wired through and verified for **Continuous** (direct) and **Adaptive Skill Rotation** (via its `divisionEngine` composition — a fixed pair is only ever forced together WITHIN one division's pool, since divisions are processed as separate calls, so Beginner/Intermediate separation is structurally untouched); Winner Pool Rotation's dedicated 4-player pooling algorithm and Progressive Skill Rotation's Transition/Competitive phases have their own separate scoring models that don't share this step and are unaffected either way, same as they already don't share other `BalancedRotationEngine`-specific behavior. A fixed pair still goes through the exact same opponent-selection scoring (`scoreOpponents`) as any other team afterward, so opponent diversity keeps working; for Adaptive Skill Rotation, the resulting matchup still goes through the exact same games-played fairness tuple and Winner-vs-Winner bonus as any other candidate — only WHICH two players end up on the same team changed, never how matchups are scored or ranked afterward. New mutual `partnerId` field (session-scoped roster data, `null` default) set via new pure `setFixedPartner(state, idA, idB)`/`clearFixedPartner(state, playerId)` (`lib/queueManagement.js`) — reassigning a partner cleanly clears the old link on both sides, so `partnerId` is always genuinely mutual or null, never a stale one-sided pointer. New compact partner picker in the Waiting Players panel, shown only while the setting is on. When disabled (the default), behavior is provably unchanged — verified directly against a fixed pair with deliberately terrible partner-recency scores that the normal algorithm actively avoids re-pairing. 21 regression checks (`scripts/verify-permanent-partner-mode.mjs`).
  - ✅ Substitute Right Away — picking a name from the Substitute picker (live-court `CourtCard` or next-matchup `NextMatchupCard`) now performs the swap immediately — no separate "Confirm sub" click. `PlayerPicker`'s `onSelect` calls the substitution directly (`chooseSub`, replacing the old `confirmSub` + disabled-until-picked button), and the now-unused `Confirm sub` button/`Repeat` icon import were removed from both cards. Cancel remains, for backing out of Substitute mode without picking anyone.
  - ✅ End Match Early continues waiting time — ending a match that never reached "finished" (the facilitator clicked "End match early" directly on a still-live court, as opposed to "Confirm result" after a declared winner) no longer resets the 4 players' waiting clock to right now. New pure `nextLastMatchEndAt(player, matchEndedAt, isEarlyEnd)` (`lib/utils.js`) — used in `endMatch`'s (`PickleballOpenPlay.jsx`) two team-stat loops — leaves `lastMatchEndAt` exactly as it was before the match for an early end, so the Waiting Queue Timer (`WaitingTimer.jsx`) and Session Analytics' wait-time bookkeeping both continue counting from each player's true last stopping point instead of treating an interrupted match as a fresh finish. A normally-completed match (already "finished", Won/declareWinner already ran) still resets the clock exactly as before. Browser-verified live: 4 players with a known 40-minute-old wait reference had a match ended early, and all 4 kept that exact same reference afterward — the very next match's waiting-queue entries correctly showed "Waiting 41m", not "Waiting 0m".
  - ✅ Session Review Improvements — a completed session's Session Analytics & Fairness Report (reopenable from Session History, fully read-only, same as before) gains two additive sections: **Final Standings** (Player/GP/W/L/+/-/RTG, reusing `buildStandingsRows` — the exact same function the live Standings tab itself uses, so a reopened report can never disagree with what Standings showed live) and a per-player **Payment Detail** list (who paid, who's still unpaid, and by which method) alongside the existing aggregate Payment Summary counts. Both are new fields on `computeSessionAnalyticsReport`'s return object (`finalStandings`, `paymentDetails`) — purely additive, computed from the same session snapshot as everything else in the report, never fed back into `gamesFairnessScore`/waiting/diversity/grade. Both are also included in the report's CSV export. Older, already-saved reports from before this field existed render exactly as before (no crash, sections simply don't appear) — confirmed live by reopening a pre-existing Session History entry. 19 regression checks (part of `scripts/verify-workflow-improvements.mjs`, alongside Alphabetical Check-In).
- [x] TV Mode Standings optimization — the broadcast Standings column's W/L-only stat pair gains **+/-** (point differential) and relabels the existing rating column from "SPR" to **"RTG"**, matching the in-session Standings tab's own column set (Player/W/L/+/-/RTG). No new data: both values come straight off `buildStandingsRows` (`lib/performanceRating.js`), the exact same function the in-session Standings tab and the Session Analytics report's Final Standings already use, so TV Mode can never disagree with either. `+/-` is color-coded the same way W/L already are (positive green, negative red, zero neutral, via new `ts.standingsStatDiff(diff)`, `tvOpenPlayStyles.js`).
- [x] Substitute Recommendation — when a facilitator clicks Substitute (on a live court or an upcoming matchup), the replacement picker now flags up to 3 candidates as "(recommended)", ranked by longest waiting time first — reusing the exact same "since" fallback (`lastMatchEndAt` once a player has played, else `checkedInAt`) the on-screen waiting timer (`WaitingTimer.jsx`) already displays with, so a recommendation can never disagree with what the facilitator sees next to that player's name. A held player is never recommended, regardless of how long they've been waiting — Hold Player means deliberately excluded from matchmaking, the opposite of who should be pulled in. New pure `getRecommendedSubstitutes(waitingPlayers, count = 3)` (`lib/utils.js`) is computed once per render in `ScorerView.jsx` from the same `unassignedPlayers` pool both substitution surfaces (live-court `CourtCard`, next-matchup `NextMatchupCard`) already draw candidates from, then threaded through as a new `recommendedIds` prop to `PlayerPicker.jsx`, which lists the recommended players first (in priority order) followed by everyone else alphabetically — a facilitator can still pick anyone else from the full list; this is a ranking hint only and never touches `queueIds`/`nextMatchups`/matchmaking. Browser-verified live: a held player waiting 90 minutes was correctly never recommended, while the 3 non-held longest-waiting players were flagged "(recommended)" in the correct priority order (45 min → 20 min → 5 min). 12 regression checks (`scripts/verify-substitute-recommendation.mjs`).
- [x] All Sessions (a persistent session index + auto-end aged sessions) — the former "Session History" screen (only ever listed sessions that had a saved report) is now "All Sessions": every session ever created — still running, manually ended, or auto-ended — in one reviewable list, each showing when it opened and when it closed. New `lib/sessionIndexModel.js` maintains one KV record per session code (`opl-session-index-{code}`, independent of both the live session record and the saved report), written once at `startSession` (`recordSessionCreated`) and updated once at End Session (`recordSessionEnded`, "Ended by facilitator") — never deleted, so it survives regardless of the session's current state. Clicking an **ended** entry reuses the exact same saved-report lookup Session History always used; clicking a **still-active** entry computes a fresh, read-only snapshot on the fly (`computeSessionAnalyticsReport` against the live record, nothing saved or mutated) — same `SessionAnalyticsReport` component either way. **Auto-End Aged Sessions**: any session still "active" whose `sessionStartedAt` is 3+ days old (`SESSION_AUTO_END_AGE_MS`, `lib/constants.js`) is automatically ended — a report is generated and saved exactly as a manual End Session would, the live record is deleted, and the index entry is marked ended with reason "Auto-ended — inactive 3+ days" — the moment the All Sessions screen is opened (`sweepAgedSessions`, run once on mount). This app has no server-side cron, so an organizer opening this screen is what triggers the check — a documented limitation, not a background job; an orphaned index entry whose live record is already gone some other way is also cleaned up defensively rather than being re-checked forever. Browser-verified live: a directly-seeded 4-day-old active session was automatically ended on screen load, correctly showing "1 session inactive for 3+ days was just automatically ended," with its Payment Summary/Final Standings intact in the resulting report; a genuinely still-active session opened its live snapshot without touching its live record or index status. 25 regression checks (`scripts/verify-all-sessions.mjs`).
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

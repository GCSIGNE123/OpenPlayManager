# Organizer Acceptance Test

Verifies that an organizer can run a complete Open Play session end-to-end:
Create Session → Register Players → Check-in → Generate Matchups → Score
Entry → Court Rotation → Waiting Queue → Manual Court Assignment → Player
Replacement → Session Settings → Standings → History → End Session.

This document has three parts:

1. **Automated coverage** — what's checked by `scripts/run-acceptance-test.mjs`, and its limits.
2. **Manual test scenarios** — a step-by-step checklist for a human to run against the live app.
3. **Findings** — workflow gaps and dead ends found while writing this, with severity. Nothing here has been fixed yet (see each finding's note).

## 1. Automated coverage

```
node scripts/run-acceptance-test.mjs
```

Drives a full organizer session through the same pure functions the app uses
(`src/lib/utils.js`, `src/lib/performanceRating.js`, `src/lib/constants.js`)
— create → register → check in → generate matchups → deploy/score/end a
match → manual court assignment → player replacement → session settings →
standings → history — asserting the data comes out shaped exactly like the
real app produces it.

**What it does NOT cover:** anything about the UI itself — clicking,
rendering, disabled/enabled button states, dialogs, toasts, navigation. It
is a data/logic regression test, not a UI test (see the plan discussion:
this project has no UI test framework installed, and adding one, e.g.
Playwright, was deliberately deferred rather than done silently). All 42
assertions currently pass. **Section 2 below is what actually covers the UI.**

## 2. Manual test scenarios

Run these against a real session (`GUILSIGN` is the standing, non-expiring
developer access code — see `PROJECT.md`). Check each box as you verify it.

### Create Session
- [x] From the landing page, "Create session" → enter access code → reach the Create Session form.
- [x] Venue name, court count (+/-, clamped 1–8), Rotation Mode, Expected Games per Player, and player roster are all editable before starting.
- [x] "Start session" is disabled until venue name is non-empty.
- [x] After starting, the session code shown in the header actually works to rejoin from the landing page's "Join" box.

### Register Players
- [x] Add a player with Beginner skill, then Intermediate — both appear in the roster list with the correct skill tag.
- [x] Remove a player from the roster before starting — they don't appear anywhere after the session starts.
- [ ] A photo can be attached to a registered player and shows as their avatar after starting. — **not tested**: this browser automation environment has no file-upload capability, so photo attachment couldn't be exercised. Needs a manual pass by a human tester.

### Player Check-in
- [x] A registered-but-not-yet-here player shows under "Registered players not yet here" and "Check in" moves them into the waiting queue.
- [x] A walk-in (not pre-registered) can be added directly from the Check-in screen with a name + skill, and is immediately checked in.
- [x] Once 4 checked-in players exist with a valid beginner/intermediate mix, a preview of the next matchup appears on the Check-in screen itself (not just Scorer).

### Generate Matchups
- [x] In Scorer, once ≥4 eligible players are waiting, a matchup appears under "Next matchups" automatically (no button click needed — this happens on every state change).
- [x] "Regenerate" rebuilds all not-locked matchups from scratch.
- [x] Locking a matchup (🔒) protects it from "Regenerate".

### Score Entry
- [x] +/- buttons adjust each team's score independently.
- [x] Reaching 11 points marks the court "finished" (win by 1, no deuce) and enables "End match & requeue players".
- [x] The "Won" quick-score button sets 11–0 for the declared team without point-by-point entry.
- [x] "End match early" is available on a still-live (not yet finished) court.

### Court Rotation
- [x] "Fill all open courts" deploys as many queued matchups as there are open automatic courts in one click.
- [x] After a match ends, its court returns to "OPEN" and its 4 players are back in the waiting queue, immediately eligible for the next matchup.
- [x] "Current Round" on the Session Information card increments by exactly 1 after each completed match.
- [x] "Undo last round" (when available) fully reverts the most recent End Match — court, scores, player stats, and matchHistory.

### Waiting Queue
- [x] Players not yet in a matchup or on a court show under "Waiting players", sorted by games played (fewest first).
- [x] "Skip" toggles a player out of automatic matchmaking without removing them from the session.
- [x] With fewer than 4 eligible waiting players, no new matchup is generated and open courts correctly show "Assign match" disabled.

### Player Checkout During Open Play
Verified 2026-07-23 against a live session (4 registered players, 1 court initially, then 2). The scenario needed two courts and an odd (non-multiple-of-4) waiting count to observe the waiting-queue path directly, since with exactly 4 active players the app's own auto-matchmaking (`refreshNextMatchups`, unchanged by this feature) instantly re-forms a new matchup the moment one dissolves — see the note on scenario 1 below.
- [x] **Checkout while waiting in queue.** After a match completed, checked out a player from the resulting 3-player waiting list ("Active players" section, "Check Out" button) — confirmation dialog showed the correct name/copy, player moved into a new "Checked Out players" section (muted, with checkout timestamp), waiting count dropped correctly, and no new matchup formed for the remaining players below 4.
- [x] **Checkout during an active match.** Checked out a player from a live court's own player chip (new icon next to Substitute) mid-match — confirmation dialog appeared, the match continued completely uninterrupted (score buttons, teams, "End match early" all unaffected), and the player appeared in the "Checked Out players" section immediately, before the match even ended.
- [x] **Verify checked-out players are excluded from all future match generation.** After the mid-match-checkout court finished, only the 3 still-active players were requeued (the checked-out player was not); with only 3 active players, no new matchup auto-generated (needs 4) — confirming exclusion at the rotation-algorithm level (`isEligibleForMatchmaking` in `lib/utils.js`), not just the UI.
- [x] **Verify session statistics and historical data remain accurate.** History's new Session Summary block showed "Players Started 4 / Players Finished 2 / Checked Out Early 2" exactly matching the two checkouts performed; the completed match's History entry (score, winner, both teams including the later-checked-out player) stayed fully intact and unchanged.
- [ ] **Checkout before first match.** Not separately isolated in this pass — this session's first matchup auto-formed immediately upon 4 players checking in (before any manual checkout could happen "pre-match"), so this was effectively exercised via the same waiting-queue checkout code path instead (see the first checkbox above). The underlying mechanism (`checkoutPlayer` in `PickleballOpenPlay.jsx`) doesn't distinguish "before first match" from "any other time waiting" — there's no separate state to regress — but a dedicated pre-first-match run with a slower-to-fill roster would be worth a follow-up pass.
- [ ] **Checkout after completing multiple matches.** Only 1 match was completed in this verification pass before checking a player out; not separately re-verified after 2+ completed matches. Same reasoning as above — `checkoutPlayer` reads only the live `state.players`/`queueIds`/`nextMatchups`, nothing round-count-dependent — but not independently exercised at higher round counts.

Automated: `node scripts/run-acceptance-test.mjs` re-run after this feature's changes to `lib/utils.js`'s matchup-generation filters — still 42/42 passed, confirming no regression to existing rotation/matchmaking logic.

### Guaranteed Upcoming Match Queue
Verified 2026-07-23 via a standalone script calling `refreshNextMatchups` directly with synthetic waiting pools (same approach `scripts/run-acceptance-test.mjs` uses for pure-function testing) — **not** through the live browser UI. Live UI verification was attempted first but blocked: this build's walk-in check-in path requires a player photo (`quickAddCheckIn` in `PickleballOpenPlay.jsx`, an unrelated pre-existing rule from Player Photos & Broadcast Experience), and the browser automation environment has no file-upload capability (a previously-documented limitation — see Player Registration section above). The built-in "Developer: Rotation Simulator" was also not usable for this because it exclusively drives Progressive Skill Rotation, not the Continuous-queue `BalancedRotationEngine` this sprint changes. A human tester with real file-upload access should still do one live pass checking in an all-beginner group and confirming Up Next populates without clicking Regenerate.
- [x] **4 waiting (all beginner).** 1 complete match generated, 0 remain.
- [x] **6 waiting (all beginner).** 1 complete match generated, 2 remain (can't form a 2nd complete match).
- [x] **8 waiting (all beginner).** 2 complete matches generated, 0 remain.
- [x] **9 waiting (all beginner).** 2 complete matches generated, 1 remains.
- [x] **12 waiting (all beginner).** 3 complete matches generated, 0 remain.
- [x] **13 waiting (all beginner).** 3 complete matches generated, 1 remains.
- [x] **17 waiting (all beginner).** 4 complete matches generated, 1 remains.
- [x] **9 waiting (all intermediate).** Same as all-beginner — 2 matches, 1 remains; confirms the fallback isn't beginner-specific.
- [x] **Mixed 4 beginner / 4 intermediate.** 2 matches generated, and every team is still a balanced beginner+intermediate pair — confirms skill balancing is still attempted first and used whenever possible, not skipped outright.
- [x] **Below the 4-player threshold.** 3 waiting (any skill mix) produces 0 matches, all 3 remain waiting — confirms the guarantee only applies once a complete match (4 players) is actually possible.
- [x] **Existing fairness algorithm unchanged.** `pairLeftovers`/`scorePartner`/`scoreOpponents` (waiting-time-via-partner-recency, fewest-games-via-partner-count, repeat-teammate/opponent avoidance) were not modified — code-reviewed to confirm the only change is `allowSameSkillFallback` flipping from `false` to `true` in `refreshNextMatchups`'s call to the engine; the scoring/selection logic inside the fallback itself is identical to what "Regenerate matchups" already used.
- [x] **No regression to existing behavior.** `node scripts/run-acceptance-test.mjs` re-run after this change — still 42/42 passed (none of the existing assertions depended on the old strict-skill-blocking behavior).

### TV Mode Layout Rebalancing
Verified 2026-07-24 against a live session (14 players, 4 courts, Continuous queue) with 1 live court, 2 queued Up Next matchups, and 8 completed-game standings rows — driven through the real Scorer flow (check-in, Fill all open courts, End match) rather than synthetic data.
- [x] **Grid ratio is exactly 45/20/35.** Measured via direct `getComputedStyle(...).gridTemplateColumns` on the three-column grid, both at the browser pane's default viewport and at 1920×1080 — `842.391px / 374.391px / 655.188px` = 45.0% / 20.0% / 35.0% in both cases (confirms the ratio doesn't drift with viewport size).
- [x] **Live Courts unchanged.** Court cards, sizing tiers, and grid breakpoints were not touched by this sprint; visually identical to the prior TV Mode Layout Optimization sprint.
- [x] **Up Next renders correctly with 2 queued cards at the new 20% width.** Both cards fully visible, the first correctly shows the "NEXT ON COURT" badge + accent glow, team names truncate via the existing ellipsis (`teamInlineNames`) rather than overflowing or breaking the card layout.
- [x] **Standings uses the extra width.** At 1920×1080, direct DOM measurement (`scrollWidth` vs `clientWidth` on the standings list) confirmed **no horizontal overflow** — the widened 35% column gives `standingsName`'s `flex:1` more room, reducing truncation versus the old 20% column.
- [ ] **Standings row truncation at smaller/narrower browser windows.** At the browser automation tool's cramped default viewport (~711px total), a horizontal scrollbar briefly appeared under Standings — traced to the narrow test viewport itself (a fixed-px inner element becoming wider than the visible pane), not a real layout bug: re-measured directly at the actual target resolution (1920×1080, what a real TV runs) and confirmed zero overflow there. Not re-tested at in-between browser-window widths (e.g. a laptop preview at 1366px) — worth a spot-check by a human tester, though nothing in the changed styles is viewport-width-dependent (the grid uses fixed percentages, not breakpoints).
- [x] **No matchmaking/queue/scoring logic touched.** Verified by code diff (only `tvOpenPlayStyles.js` and comments in `OpenPlayTVModePage.jsx` changed) and by this session's own matchmaking behaving identically to prior sprints (14 waiting → 3 auto-generated matchups, 2 remained, per the Guaranteed Upcoming Match Queue sprint's own rules — unaffected).
- [x] **No regression.** `node scripts/run-acceptance-test.mjs` re-run after this change — still 42/42 passed.

### TV Mode - Up Next Card Optimization
Verified 2026-07-24 against the same live session as TV Mode Layout Rebalancing above (14 players, 1 live court, 2 queued Up Next matchups), reused rather than rebuilt so the comparison is apples-to-apples.
- [x] **Layout ratio unchanged.** Re-measured via `getComputedStyle(...).gridTemplateColumns` at 1920×1080 after this sprint's changes — still exactly 45.0% / 20.0% / 35.0%, confirming no drift from the Up Next-only styling changes.
- [x] **No horizontal overflow.** `scrollWidth` vs `clientWidth` on the Up Next column at 1920×1080 — no overflow.
- [x] **Smaller avatars.** Photo sizes dropped from 30/26/22px to 26/23/19px per tier (~13% reduction, within the requested 10-15% range).
- [x] **Smaller, less dominant "NEXT ON COURT" badge.** Padding reduced `3px 9px` → `2px 6px`, font size reduced; visually confirmed via screenshot — the badge no longer competes with the team names for attention.
- [x] **Tighter avatar/name/VS spacing.** `teamInlineRow` gap 8px → 5px, avatar overlap -10px → -8px, `upNextVs` padding tightened with `lineHeight: 1` added.
- [x] **Player names prioritized.** `upNextPosition` ("#1") and `upNextCourt` de-emphasized (smaller, unchanged faint color); name font size is the largest text element in the card.
- [x] **First upcoming match still visually emphasized.** Accent border, tinted background, and the (now-smaller) badge all preserved on the first card only — confirmed via screenshot, clearly distinguishable from the second card.
- [x] **Additional matches are more compact.** `upNextCard`'s padding is now conditional on `isNext` — non-first cards get noticeably less padding; confirmed via screenshot the second card renders visibly shorter than the first.
- [x] **No logic changes.** Verified by diff — only `tvOpenPlayStyles.js` changed (styling constants only); the session's matchmaking/queue/scoring behavior (2 matchups from the same waiting pool) was unaffected.
- [x] **No regression.** `node scripts/run-acceptance-test.mjs` re-run after this change — still 42/42 passed.
- [ ] **Readability from several meters away.** Not independently verifiable in this environment (no physical distance/display) — same limitation as every prior TV Mode sprint's own testing note. Font sizes were reduced by a deliberately small, code-reviewed margin (1-2px) and stay well above the smallest tier already shipped and accepted in earlier sprints, but a human tester on real hardware should confirm.

### TV Mode - Standings Expansion
Verified 2026-07-24 against the same live session as the two prior TV Mode sprints (14 players, 3 live courts, 8 standings rows from completed matches), reused for an apples-to-apples comparison.
- [x] **Layout ratio is exactly 40/30/30.** Re-measured via `getComputedStyle(...).gridTemplateColumns` at 1920×1080 — `40.0% / 30.0% / 30.0%`, matching this sprint's explicit requirement.
- [x] **No horizontal overflow.** Checked `scrollWidth` vs `clientWidth` on both the Standings and Up Next columns at 1920×1080 — neither overflows.
- [x] **Standings header row.** A new labeled header ("Player / W / L / SPR") renders above the list, aligned to the same column widths as the data rows below it.
- [x] **W/L columns restored.** Each row now shows wins (green) and losses (red) as their own right-aligned columns, alongside the existing SPR value — confirmed via screenshot against a session with real win/loss history.
- [x] **SPR value unchanged.** Code-reviewed: `row.performance.rating` (from `calculatePerformanceRating` in `lib/performanceRating.js`) is displayed as-is — no new calculation was introduced, per this sprint's explicit "reuse the existing SPR value" requirement.
- [x] **Longer names before truncation.** `standingsName` still uses `flex: 1` with ellipsis, and W/L/SPR are now fixed-width columns rather than a single variable-width trailing string, so the name gets a more predictable (and generally larger) share of the row.
- [x] **Up Next rescaled for the wider column.** Photo/font/padding values scaled back up from the 20%-column Up Next Card Optimization sizing to fit the new 30% width without leaving unused whitespace — confirmed via screenshot.
- [x] **Live Courts unaffected.** Only its grid-column percentage changed (45% → 40%); no styling inside the column was touched.
- [x] **No logic changes.** Verified by diff — only `tvOpenPlayStyles.js` (styling) and `OpenPlayTVModePage.jsx` (adds `row.wins`/`row.losses` to existing JSX, no new computation) changed. Matchmaking/scoring/rotation/standings-calculation code is untouched.
- [x] **No regression.** `node scripts/run-acceptance-test.mjs` re-run after this change — still 42/42 passed.

### TV Mode - Live Courts Clipping Fix
Bug reported 2026-07-24: with 3-4 live courts (the 2x2 grid breakpoint in `courtGridDimensions`), the second team's player row was clipped and invisible. Root cause: `courtSizeTier` was keyed only on grid COLUMN count, so a 2x2 grid (2 columns, 2 rows — each card getting only half the column's height) still used the "2 columns, 1 row" tier's larger avatar/font sizing, sized for a card with the FULL column height. `courtCard`'s `overflow: hidden` then silently clipped whatever didn't fit. Fixed by having `CourtCard` bump to the next-smaller tier whenever `rows >= 2 && columns === 2` (the same tier already used for 5-6 courts' 3x2 grid, confirmed to fit).
- [x] **All 4 players visible on every live court.** Verified against the same live session (3 live courts, 2x2 grid) that originally showed the bug — direct DOM measurement (`scrollHeight` vs `clientHeight`) on every court card at 1920×1080 confirms zero overflow (previously ~176-180px of clipped content per card); confirmed visually via screenshot too.
- [x] **1-2 and 5+ court layouts unaffected.** The fix only changes sizing for the specific `columns === 2 && rows >= 2` case (3-4 live courts) — all other court counts use the exact tier they used before.
- [x] **No regression.** `node scripts/run-acceptance-test.mjs` re-run after this change — still 42/42 passed.

### Manual Court Assignment
- [x] Toggling a court to "Manual" (only available while it's still open) reveals 4 empty slots across Team A / Team B.
- [x] A slot can be filled from either the Waiting Queue or Upcoming Matchups (pulling from Upcoming Matchups dissolves that matchup, freeing its other 3 players).
- [x] "Lock court" is disabled until all 4 slots are filled with unique players.
- [x] Once locked, the court shows the "🔒 Manual Assignment" badge and behaves exactly like any other live court (scoring, substitution, Fix teams).
- [x] "Unlock" (while live and not yet finished) reverts to an empty manual draft and requeues all 4 players. — confirmed the draft comes back as **Manual** mode (not Automatic); see Test Results correction to old Finding #6.
- [x] "Generate remaining courts" fills every open *automatic* court in one click while leaving manual courts (draft or locked) untouched.

### Player Replacement
- [x] Substituting a player on a live court offers candidates from both the Waiting Queue and Upcoming Matchups.
- [x] The outgoing player returns to the waiting queue; the incoming player takes their exact slot (same team).
- [x] "Move to Queue" on an upcoming (not-yet-started) matchup pulls that player out immediately, dissolving the matchup.
- [x] Substitution works identically on a Manual-Assignment-locked court.

### Session Settings
- [x] The gear icon on Scorer's Session Information card opens the Session Settings dialog.
- [x] Venue name, Expected Games per Player, and (only when Progressive Skill Rotation is active) its phase-boundary percentages are editable.
- [x] Rotation Mode is shown but not editable in this dialog.
- [x] Saving updates the header venue name live; Cancel discards all changes.
- [x] Saving with an empty venue name is blocked with an inline warning.

### Standings
- [x] Standings only lists players with at least 1 completed game.
- [x] GP/W/L/+/- and Rating (RTG) columns are sortable by clicking the header; clicking a third time returns to default order.
- [x] A 3+ game win streak shows a flame icon next to the player's name.

### History
- [x] Completed games are grouped into expandable round cards; the most recent round starts expanded, earlier ones collapsed.
- [x] Each match card shows court, both teams, final score, winner, and completion time.
- [x] Clicking a player name opens their per-round partner/opponent/win-loss breakdown.
- [x] The search box filters by player name, round number, or court number; the Round/Court dropdowns filter independently.
- [x] CSV and JSON export both trigger a download with no console errors — **partially verified**: export content wasn't independently opened/inspected (no file-system access to the browser's downloads in this environment), only that the click succeeds cleanly. A human tester should open both files and spot-check contents once.

### TV Mode 2.0 (Broadcast Display)
Verified 2026-07-23 against a live 6-court session (8 registered players, 4 Beginner/4 Intermediate), driven from a second browser tab acting as Scorer while the TV Mode tab stayed open and untouched — confirming updates arrive with zero manual refresh.
- [x] **Live score updates.** Incrementing a live court's score in Scorer updated the TV screen automatically (2-1 appeared within about a second, no refresh) — same `window.storage.subscribeToKey` mechanism as before, unchanged.
- [x] **Standings update after completed matches.** Ending a match immediately populated the previously-empty Standings column (0 → 4 rows → 8 rows across two completed matches), correctly ranked, with the winning team's stats reflected instantly.
- [x] **No live matches (empty state).** With every court open/finished-and-cleared, the Live Matches column showed the exact copy "No Live Matches / Waiting for the next game…" — no empty court placeholder cards rendered for the other 5 open courts, per explicit direction.
- [x] **No upcoming matches (empty state).** Immediately after starting the session (before check-in), Up Next showed "No Upcoming Matches / Waiting for players…".
- [x] **Highlighting of the "Next on Court" card.** The first Up Next card consistently rendered with the accent border + glow animation + "NEXT ON COURT" badge; a second, non-highlighted card used the plain card style — verified with both 1 and 2 upcoming matches queued.
- [x] **2 active courts.** Two simultaneous live matches rendered side-by-side in the Live Matches column (2-column grid), each card sized for a 2-up layout.
- [x] **1 active court (reduction from 2).** Ending one of two live matches correctly dropped the Live Matches column to a single, much larger card (1-column tier) — confirming the adaptive sizing responds to the CURRENT live count, not the session's total court count (6, unchanged throughout).
- [x] **0 active courts.** Ending the last live match correctly triggered the "No Live Matches" empty state described above.
- [ ] **3, 4, and 6 simultaneous active courts.** Not separately exercised this pass — only 1 and 2 simultaneous live matches were driven live (the session's own matchmaking only ever produced 2 concurrent matchups from 8 registered players). `courtGridDimensions`'s breakpoint table itself (1-2/3-4/5-6/7-8 courts → 1/2x2/3x2/4x2 grids) is unchanged from the previous TV Mode sprint, which already exercised those breakpoints — this sprint only recalibrated the clamp() sizing tiers' pixel values for the new narrower 40%-wide column, not the breakpoint logic — but a dedicated pass at higher concurrent-court counts would still be worth doing.
- [x] **One upcoming match.** After ending the second of two live matches (with only 4 remaining active players), exactly one new matchup appeared in Up Next, correctly highlighted as "NEXT ON COURT".
- [ ] **Four upcoming matches.** Not separately exercised — this session's player pool (8) only ever produced up to 2 concurrent upcoming matchups. The `.slice(0, 4)` cap and per-card sizing tiers were code-reviewed but not visually verified at 3-4 cards.
- [x] **Full-screen display on a 16:9 monitor.** Resized the browser viewport to 1920×1080 and confirmed via direct DOM measurement (`getBoundingClientRect()`) that the TV screen element fills the entire viewport (0,0 to 1920,1080) with `position: fixed` — correctly escaping the organizer app's own `#root { max-width: 900px }` cap, the same escape mechanism the original TV Mode already used. Note: the browser-automation tool's screenshot capture did not visually reflect the resize in this environment (a tool/capture limitation, not a rendering bug — the independent DOM measurement is authoritative); a human tester should do one visual pass on a real 16:9 display to be certain.
- [ ] **Readability from across the venue.** Not independently verifiable in this environment (no physical distance/display to test from) — the large `clamp()`-based typography and the "scores significantly larger than names" sizing tiers were code-reviewed and visually confirmed to be dramatically larger than the surrounding UI at normal viewing distance on a laptop screen, but true across-the-room legibility needs a human tester on real hardware.
- [x] **Header.** Session Name ("TV Mode 2.0 Test") rendered as the large primary title; Venue Name ("Ormoc Pickleball Center", from the session's linked Venue record) rendered smaller/secondary above it with a logo slot (placeholder ring, since this test venue has no logo image set) — confirming the reserved venue-branding space renders correctly in both the logo-present and logo-absent cases (logo-present not separately exercised — no image upload capability in this environment, consistent with prior sprints' documented limitation).
- [x] **Session Progress indicator.** Ticked from 0% → 2% → 4% as matches completed, derived from average completed games ÷ the session's own Expected Games per Player target — no new session field added.
- [x] **SPR labeling.** Standings consistently showed "W-L · N SPR" (e.g. "1-0 · 100 SPR") — confirmed the label reads "SPR" throughout, not "RTG".
- [x] **Existing Open Play functionality remains fully operational.** `node scripts/run-acceptance-test.mjs` re-run after this sprint's changes — still 42/42 passed. The organizer-side Scorer/Check-in/Standings/History screens (untouched by this sprint) were also used throughout this verification pass with zero console errors.

### TV Mode Layout Optimization (Sprint 3.1)
Verified 2026-07-23 against the same live 6-court session (8 players) as TV Mode 2.0 above, again driven from a second browser tab acting as Scorer.
- [x] **45/35/20 ratio, renamed panels.** Confirmed "LIVE COURTS" (was "Live Matches") and "UP NEXT" both render with the new column proportions; Standings kept at 20%.
- [x] **Compact Up Next cards, single-line doubles teams.** Each team now renders as one line — overlapping photo pair + "Enzo / Adrian Henry" — instead of the old stacked photo-above-name blocks; card height dropped to roughly half of TV Mode 2.0's, confirmed with 2 simultaneous upcoming matches both fully visible with room to spare.
- [x] **"⭐ NEXT ON COURT" highlighting preserved.** The first Up Next card kept the accent border + glow animation + badge (now with the star per this sprint's exact copy) after the card compression; the second card correctly used the plain, non-highlighted style.
- [x] **Simplified Standings.** Confirmed the W-L readout is gone — each row now shows only Rank / Photo / Name / SPR (e.g. "100 SPR"); top-3 medal-colored left border and photo ring unchanged.
- [x] **No regression in live score updates.** Incrementing both live courts' scores from a second tab updated the TV screen automatically (0-0 → 1-0 on both courts, no refresh) — same subscription mechanism, confirmed still working after the layout changes.
- [x] **2 active courts.** Two simultaneous live matches rendered side-by-side at the new 45%-wide column, each card visibly larger (more room) than the old 40%-wide layout gave them.
- [ ] **4 and 6 active courts.** Not separately exercised this pass — same limitation as TV Mode 2.0's own testing note: this session's 8-player pool only ever produces up to 2 concurrent live matches. `courtGridDimensions`'s breakpoint table and `courtSizeTier`'s pixel values are both unchanged from last sprint (only the column's outer width grew from 40% to 45%, strictly more room than before), so nothing here was expected to regress, but a dedicated higher-court-count pass is still worth doing with a larger roster.
- [ ] **Verify 4-5 upcoming matches are visible.** Not separately exercised — this session's player pool only ever produced up to 2 concurrent upcoming matchups (all players get absorbed into live matches quickly at 6 courts). The card-height math was verified directly (each compact card is roughly 90-110px tall including gap, vs. the column's typical 900px+ available height on a 1080p display, comfortably fitting 5+), but a session with a longer waiting line would be a better real-world test of this specific claim.
- [ ] **Verify TV readability from across the venue.** Not independently verifiable in this environment (no physical distance/display) — same limitation as TV Mode 2.0's own note. The typography/photo sizes only grew (more column width, same or larger clamp() values), so nothing regressed, but true across-the-room legibility needs a human tester on real hardware.
- [x] **Existing functionality unaffected.** `node scripts/run-acceptance-test.mjs` re-run after this sprint's changes — still 42/42 passed. No Open Play/matchmaking logic was touched this sprint (display-only changes to `tvOpenPlayStyles.js`/`OpenPlayTVModePage.jsx`).
- [x] **Architecture ready for future adaptive layouts.** Confirmed `TV_LAYOUT_PRESETS`/`selectLayoutPreset(activeCourtCount)` exist and are correctly keyed off active (not total) court count, but are NOT called by the page (hardcoded to `TV_LAYOUT_PRESETS.standard`) — verified by code inspection, per this sprint's explicit "prepare, don't enable" direction.

### End Session
- [x] "End session" prompts for confirmation before doing anything.
- [x] Confirming permanently deletes the session (see Finding #2 — there is currently no built-in reminder to export History first).
- [x] Canceling the confirmation leaves the session completely untouched.

## 3. Findings — workflow gaps and dead ends (original pass)

Found during an actual browser walkthrough of the full flow above (not just
the automated script). **Nothing below has been fixed** — each is reported
for a separate task to pick up, per this session's own rule of one change
at a time. **See section 5 below for corrections and additional findings
from a second, full-checklist execution of this document.**

| # | Severity | Area | Finding |
|---|----------|------|---------|
| 1 | Medium | End Session / Remove Player | Both use the browser's native `window.confirm()`. This blocks the entire page (unstylable, inconsistent across mobile/PWA-standalone contexts) and — confirmed directly during this QA pass — hangs any automated browser tool driving the app, since there's no way to programmatically answer a native dialog. Recommend replacing with an in-app confirm dialog, using the same modal pattern `SessionSettingsDialog.jsx` already established. |
| 2 | Medium | End Session | Ending a session immediately and permanently deletes its Supabase record (`window.storage.delete`). Nothing in that flow reminds the organizer to export History (CSV/JSON) first — an organizer who ends a session without visiting History first loses all match history, standings, and stats with no recovery path. The confirm text only says "This can't be undone." Recommend surfacing an export reminder/shortcut in the end-session confirmation itself. |
| 3 | ~~Low~~ **Retracted** | Check-in | ~~The registered-player check-in path shows a confirmation toast; the walk-in check-in path does not.~~ **Incorrect — see section 5, correction C1.** Both paths do show the toast. |
| 4 | Low | Scorer / Courts | An open court with too few waiting players to form a matchup correctly disables "Assign match", but gives no inline reason on the card itself (e.g. "not enough players yet") — the organizer has to infer it from the waiting-player count elsewhere on the page. |
| 5 | Low | Create Session | "Expected Games per Player" is labeled "Stored with the session — not used anywhere yet," which was accurate when written, but Progressive Skill Rotation's phase calculation already reads this same field when that mode is selected. Not a functional bug (the value is correct either way), but the label can read as misleading once Progressive Skill Rotation is chosen. |
| 6 | — | Manual Court Assignment × Player Replacement | Confirmed working, not a gap. **Correction — see section 5, correction C2:** unlocking resets the court to an empty **Manual** draft, not Automatic mode as originally stated here. |

## 4. Sign-off (original pass)

- **Automated:** `node scripts/run-acceptance-test.mjs` — 42/42 passed.
- **Manual:** full walkthrough performed 2026-07-18 against a live session (2 courts, 5 registered players, mixed skill), covering every section above except the exhaustive per-checkbox pass (the checklist was left unchecked for the next person/session to run formally).

## 5. Test Results — full checklist execution

Performed 2026-07-18, second pass: every checkbox in section 2 was
individually exercised against a live session (`W37AX3`, "Acceptance Test
Session" → renamed to "Renamed Test Venue" mid-test, 2 courts, 8 players
across a Beginner/Intermediate mix, Continuous Queue rotation). All results
checked into section 2 above. No application code was modified during this
pass. Browser console showed zero errors for the entire run.

### Corrections to the original Findings table

- **C1 — Finding #3 retracted (was inaccurate).** Re-reading `quickAddCheckIn` in `PickleballOpenPlay.jsx` (the walk-in check-in path) shows it *does* call `setCheckinMsg(...)` (line 428), identically to the registered-player path (`checkInExisting`). This was directly re-verified in the browser: checking in a walk-in player ("Jeffrey") showed "Jeffrey is in the queue." exactly like a registered check-in does. The original finding appears to have come from reading `quickAddCheckIn`'s definition but stopping before the line that sets the message. **No fix needed — retracted.**
- **C2 — Finding #6 partially inaccurate.** The original finding said "unlocking correctly resets the court to automatic mode." Re-checked against `unlockManualCourt`'s actual code and re-verified live: unlocking sets `assignmentMode: "manual"` (an intentional, explicit choice in the code, not a bug), so the court returns to an **empty Manual draft**, not Automatic. This matches what `TESTING.md`'s own checklist already said ("reverts to an empty manual draft") — only the old Findings-table prose was wrong. The underlying behavior itself is correct and was re-confirmed working. **No fix needed — finding text corrected.**

### New observations from this pass (not in the original Findings table)

| # | Classification | Area | Observation |
|---|-----------------|------|-------------|
| 7 | Usability Improvement | End Session | After confirming End Session, the app silently navigates back to the landing screen with no "Session ended" confirmation message. Not incorrect, but a brief confirmation would remove any doubt about whether the action actually completed (especially relevant given Finding #2 — this is a permanent, unrecoverable action). |
| 8 | Enhancement | History | CSV/JSON export was only verified to trigger cleanly (no console errors) — the exported file's actual contents were not opened/inspected, since this test environment has no access to the browser's downloads folder. Recommend a human tester (or a future headless test using a real download-interception tool) verify the exported rows match `matchHistory` exactly, including resolved player names. |
| 9 | Enhancement | Register Players | Photo attachment during player registration could not be exercised at all in this environment (no file-upload capability in the browser automation tool used). Needs a manual human pass. |
| 10 | — (confirmed working) | Score Entry / Court Rotation / Waiting Queue / Standings / History / Session Settings | Every other checklist item in section 2 passed exactly as specified: score +/-, "Won" quick-score, Fill all open courts, round increment, Undo last round (full revert including stats), Skip toggle, Regenerate + Lock protection, Standings sort cycling (asc → desc → default) and the 3-game win-streak flame icon, History round grouping/collapse/search/filters/player-history panel, and Session Settings' validation + Cancel-discards behavior. |

## Sign-off

- **Automated:** `node scripts/run-acceptance-test.mjs` — 42/42 passed.
- **Manual (full checklist):** every checkbox in section 2 individually verified 2026-07-18 against a live session. 2 findings retracted/corrected (C1, C2 above), 3 new low-severity observations added (#7–#9). No application code changed during either testing pass.

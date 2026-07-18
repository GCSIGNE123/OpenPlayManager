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

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
- [ ] From the landing page, "Create session" → enter access code → reach the Create Session form.
- [ ] Venue name, court count (+/-, clamped 1–8), Rotation Mode, Expected Games per Player, and player roster are all editable before starting.
- [ ] "Start session" is disabled until venue name is non-empty.
- [ ] After starting, the session code shown in the header actually works to rejoin from the landing page's "Join" box.

### Register Players
- [ ] Add a player with Beginner skill, then Intermediate — both appear in the roster list with the correct skill tag.
- [ ] Remove a player from the roster before starting — they don't appear anywhere after the session starts.
- [ ] A photo can be attached to a registered player and shows as their avatar after starting.

### Player Check-in
- [ ] A registered-but-not-yet-here player shows under "Registered players not yet here" and "Check in" moves them into the waiting queue.
- [ ] A walk-in (not pre-registered) can be added directly from the Check-in screen with a name + skill, and is immediately checked in.
- [ ] Once 4 checked-in players exist with a valid beginner/intermediate mix, a preview of the next matchup appears on the Check-in screen itself (not just Scorer).

### Generate Matchups
- [ ] In Scorer, once ≥4 eligible players are waiting, a matchup appears under "Next matchups" automatically (no button click needed — this happens on every state change).
- [ ] "Regenerate" rebuilds all not-locked matchups from scratch.
- [ ] Locking a matchup (🔒) protects it from "Regenerate".

### Score Entry
- [ ] +/- buttons adjust each team's score independently.
- [ ] Reaching 11 points marks the court "finished" (win by 1, no deuce) and enables "End match & requeue players".
- [ ] The "Won" quick-score button sets 11–0 for the declared team without point-by-point entry.
- [ ] "End match early" is available on a still-live (not yet finished) court.

### Court Rotation
- [ ] "Fill all open courts" deploys as many queued matchups as there are open automatic courts in one click.
- [ ] After a match ends, its court returns to "OPEN" and its 4 players are back in the waiting queue, immediately eligible for the next matchup.
- [ ] "Current Round" on the Session Information card increments by exactly 1 after each completed match.
- [ ] "Undo last round" (when available) fully reverts the most recent End Match — court, scores, player stats, and matchHistory.

### Waiting Queue
- [ ] Players not yet in a matchup or on a court show under "Waiting players", sorted by games played (fewest first).
- [ ] "Skip" toggles a player out of automatic matchmaking without removing them from the session.
- [ ] With fewer than 4 eligible waiting players, no new matchup is generated and open courts correctly show "Assign match" disabled.

### Manual Court Assignment
- [ ] Toggling a court to "Manual" (only available while it's still open) reveals 4 empty slots across Team A / Team B.
- [ ] A slot can be filled from either the Waiting Queue or Upcoming Matchups (pulling from Upcoming Matchups dissolves that matchup, freeing its other 3 players).
- [ ] "Lock court" is disabled until all 4 slots are filled with unique players.
- [ ] Once locked, the court shows the "🔒 Manual Assignment" badge and behaves exactly like any other live court (scoring, substitution, Fix teams).
- [ ] "Unlock" (while live and not yet finished) reverts to an empty manual draft and requeues all 4 players.
- [ ] "Generate remaining courts" fills every open *automatic* court in one click while leaving manual courts (draft or locked) untouched.

### Player Replacement
- [ ] Substituting a player on a live court offers candidates from both the Waiting Queue and Upcoming Matchups.
- [ ] The outgoing player returns to the waiting queue; the incoming player takes their exact slot (same team).
- [ ] "Move to Queue" on an upcoming (not-yet-started) matchup pulls that player out immediately, dissolving the matchup.
- [ ] Substitution works identically on a Manual-Assignment-locked court (verified in this task's QA pass — see Findings, item 6, confirmed working).

### Session Settings
- [ ] The gear icon on Scorer's Session Information card opens the Session Settings dialog.
- [ ] Venue name, Expected Games per Player, and (only when Progressive Skill Rotation is active) its phase-boundary percentages are editable.
- [ ] Rotation Mode is shown but not editable in this dialog.
- [ ] Saving updates the header venue name live; Cancel discards all changes.
- [ ] Saving with an empty venue name is blocked with an inline warning.

### Standings
- [ ] Standings only lists players with at least 1 completed game.
- [ ] GP/W/L/+/- and Rating (RTG) columns are sortable by clicking the header; clicking a third time returns to default order.
- [ ] A 3+ game win streak shows a flame icon next to the player's name.

### History
- [ ] Completed games are grouped into expandable round cards; the most recent round starts expanded, earlier ones collapsed.
- [ ] Each match card shows court, both teams, final score, winner, and completion time.
- [ ] Clicking a player name opens their per-round partner/opponent/win-loss breakdown.
- [ ] The search box filters by player name, round number, or court number; the Round/Court dropdowns filter independently.
- [ ] CSV and JSON export both download and contain every completed match with resolved player names.

### End Session
- [ ] "End session" prompts for confirmation before doing anything.
- [ ] Confirming permanently deletes the session (see Finding #4 — there is currently no built-in reminder to export History first).
- [ ] Canceling the confirmation leaves the session completely untouched.

## 3. Findings — workflow gaps and dead ends

Found during an actual browser walkthrough of the full flow above (not just
the automated script). **Nothing below has been fixed** — each is reported
for a separate task to pick up, per this session's own rule of one change
at a time.

| # | Severity | Area | Finding |
|---|----------|------|---------|
| 1 | Medium | End Session / Remove Player | Both use the browser's native `window.confirm()`. This blocks the entire page (unstylable, inconsistent across mobile/PWA-standalone contexts) and — confirmed directly during this QA pass — hangs any automated browser tool driving the app, since there's no way to programmatically answer a native dialog. Recommend replacing with an in-app confirm dialog, using the same modal pattern `SessionSettingsDialog.jsx` already established. |
| 2 | Medium | End Session | Ending a session immediately and permanently deletes its Supabase record (`window.storage.delete`). Nothing in that flow reminds the organizer to export History (CSV/JSON) first — an organizer who ends a session without visiting History first loses all match history, standings, and stats with no recovery path. The confirm text only says "This can't be undone." Recommend surfacing an export reminder/shortcut in the end-session confirmation itself. |
| 3 | Low | Check-in | The registered-player check-in path shows a confirmation toast ("X is in the queue."); the walk-in check-in path does not, despite using the same screen and the same underlying queue. Inconsistent feedback between the two. |
| 4 | Low | Scorer / Courts | An open court with too few waiting players to form a matchup correctly disables "Assign match", but gives no inline reason on the card itself (e.g. "not enough players yet") — the organizer has to infer it from the waiting-player count elsewhere on the page. |
| 5 | Low | Create Session | "Expected Games per Player" is labeled "Stored with the session — not used anywhere yet," which was accurate when written, but Progressive Skill Rotation's phase calculation already reads this same field when that mode is selected. Not a functional bug (the value is correct either way), but the label can read as misleading once Progressive Skill Rotation is chosen. |
| 6 | — | Manual Court Assignment × Player Replacement | Confirmed working, not a gap: substituting a player on a Manual-Assignment-locked court behaves identically to a normal live court, and unlocking correctly resets the court to automatic mode and requeues its players. Rotation continued normally afterward (round count incremented, a fresh automatic matchup was generated). Called out explicitly since this was the highest-risk cross-feature interaction to check. |

## Sign-off

- **Automated:** `node scripts/run-acceptance-test.mjs` — 42/42 passed.
- **Manual:** full walkthrough performed 2026-07-18 against a live session (2 courts, 5 registered players, mixed skill), covering every section above except the exhaustive per-checkbox pass (the checklist is left unchecked for the next person/session to run formally). Findings above were produced by this walkthrough.

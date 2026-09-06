import { ACCESS_PREFIX, CODE_CHARS, QUEUE_STATUSES, STORAGE_PREFIX } from "./constants.js";
import { BalancedRotationEngine } from "../engines/BalancedRotationEngine.js";
import { ProgressiveSkillRotationStrategy } from "../engines/ProgressiveSkillRotationStrategy.js";
import { AdaptiveSkillRotationEngine } from "../engines/AdaptiveSkillRotationEngine.js";
import { uid } from "./random.js";

export { uid, shuffle } from "./random.js";

export function generateRandomCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

// Lists every Open Play/Tournament session record — nothing previously
// needed to enumerate ALL sessions at once (every other screen loads one
// session by its own code), but Phase 0's Venue Dashboard does, to count
// Active Open Play Sessions per venue. Same list+get+JSON.parse pattern as
// every fetchAll* in this app (lib/playerDatabase.js, lib/courtDatabase.js, ...).
export async function fetchAllSessions() {
  const { keys } = await window.storage.list(STORAGE_PREFIX, true);
  const records = await Promise.all(
    keys.map(async (key) => {
      try {
        const res = await window.storage.get(key, true);
        return JSON.parse(res.value);
      } catch (e) {
        return null;
      }
    })
  );
  return records.filter(Boolean);
}

// shrink a photo to a small square thumbnail so many player photos stay well
// under the shared-session storage limit
export function resizeImageToAvatar(file, size = 128) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Couldn't load image"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

// pulls from the CONNECT.PH theme's rotating avatar palette (--color-avatar-1..6,
// see styles.js) rather than hardcoding hex here
const AVATAR_COLORS = [
  "var(--color-avatar-1)",
  "var(--color-avatar-2)",
  "var(--color-avatar-3)",
  "var(--color-avatar-4)",
  "var(--color-avatar-5)",
  "var(--color-avatar-6)",
];
export function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function sortByGames(ids, players) {
  return [...ids].sort((a, b) => (players[a]?.games || 0) - (players[b]?.games || 0));
}

// Alphabetical Check-In List — see PROJECT.md/FEATURES.md. Every
// registered player not yet checked in, A→Z by display name. Recomputed
// fresh from the current player map every time it's called (never
// memoized/stored), so it's always up to date — a newly-registered
// walk-in, or a whole 32-player roster, appears in order automatically
// with zero extra bookkeeping. Checked-in players are excluded exactly as
// before; only the ORDER of what's left changed.
export function getRegisteredNotHere(players) {
  return Object.values(players || {})
    .filter((p) => !p.checkedIn)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// tries a handful of random codes and returns the first one not already in
// use — collisions are astronomically unlikely with a 6-char code, but a
// quick check costs nothing
export async function findUniqueSessionCode() {
  for (let i = 0; i < 6; i++) {
    const code = generateRandomCode(6);
    try {
      const existing = await window.storage.get(`${STORAGE_PREFIX}${code}`, true);
      if (!existing) return code;
    } catch (e) {
      return code; // get() throws when the key doesn't exist — code is free
    }
  }
  return generateRandomCode(6);
}

// access codes are longer (8 chars) than session codes (6) so the two are
// never visually confused — an access code is a paid unlock, a session
// code is just "which open play am I looking at"
export async function findUniqueAccessCode() {
  for (let i = 0; i < 6; i++) {
    const code = generateRandomCode(8);
    try {
      const existing = await window.storage.get(`${ACCESS_PREFIX}${code}`, true);
      if (!existing) return code;
    } catch (e) {
      return code;
    }
  }
  return generateRandomCode(8);
}

// every player id currently locked into one of the pre-built upcoming
// matchups (as opposed to still unassigned in the waiting queue)
export function reservedMatchupIds(nextMatchups) {
  const ids = new Set();
  nextMatchups.forEach((m) => {
    m.teamA.forEach((id) => ids.add(id));
    m.teamB.forEach((id) => ids.add(id));
  });
  return ids;
}

// every player id currently drafted or locked into a Manual Court
// Assignment (see PROJECT.md) — a court in "manual" assignmentMode holds
// its organizer-picked players directly in teamA/teamB while status is
// still "open" (an in-progress draft, possibly <2 per side) just the same
// as once it's locked and "live". Used to keep those players out of the
// automatic rotation engine's pool (it must "ignore players already
// assigned to manual courts") and out of other manual courts' own
// candidate pickers, before they're ever deployed. Live/locked manual
// courts don't strictly need to be included here too — their players are
// already out of queueIds once locked, same as any other live court — but
// including them is harmless and keeps this one function the single
// source of truth for "is this player spoken for by a manual court."
export function manuallyReservedIds(courts) {
  const ids = new Set();
  (courts || []).forEach((c) => {
    if (c.assignmentMode !== "manual") return;
    c.teamA.forEach((id) => id && ids.add(id));
    c.teamB.forEach((id) => id && ids.add(id));
  });
  return ids;
}

// Real-world Open Play organizers need to pull a replacement from wherever
// someone's actually available — not just the waiting queue, but also
// players already scheduled into a later matchup who haven't started yet.
// Returns both pools, ready for PlayerPicker: `waiting` (already player
// objects) and `upcoming` (player objects tagged with which matchup they're
// currently reserved in and a human label for it, e.g. "Next up" / "Then ·
// matchup 2" — the same labels Scorer already shows above each matchup card,
// so a candidate's tag always matches what the organizer sees on screen).
// `excludeMatchupId` leaves out the matchup currently being edited, so a
// next-matchup substitution never offers a teammate/opponent from that same
// matchup as its own replacement.
export function buildReplacementCandidates(nextMatchups, unassignedPlayers, players, excludeMatchupId = null) {
  const upcoming = [];
  nextMatchups.forEach((m, i) => {
    if (m.id === excludeMatchupId) return;
    const scheduledLabel = i === 0 ? "Next up" : `Then · matchup ${i + 1}`;
    [...m.teamA, ...m.teamB].forEach((id) => {
      const p = players[id];
      if (p) upcoming.push({ ...p, matchupId: m.id, scheduledLabel });
    });
  });
  return { waiting: unassignedPlayers, upcoming };
}

// Substitute Recommendation — see PROJECT.md/FEATURES.md. Surfaces the
// facilitator's best pick(s) when swapping a player out mid-match: whoever
// from the waiting queue has been sitting out longest, since that's who
// most deserves the next open spot. Never recommends a held player — Hold
// Player means "temporarily excluded from matchmaking on purpose," so a
// held player is exactly the opposite of someone who should be pulled in.
// Reuses the exact same "since" fallback WaitingTimer.jsx already displays
// with (lastMatchEndAt once a player has played, else checkedInAt) — no
// new field, no new persisted state, and the ranking here can never
// disagree with what the on-screen waiting timer shows for the same
// player. Purely a UI ranking hint — doesn't touch queueIds/nextMatchups/
// matchmaking, and a facilitator can still pick anyone else from the full
// candidate list.
// End Match Early — see PROJECT.md/FEATURES.md. Decides what a player's
// `lastMatchEndAt` (the Waiting Queue Timer's basis, see WaitingTimer.jsx)
// should become once a match ends: reset to right now for a normally-
// completed match (the court already reached "finished" — Won/
// declareWinner already ran, this is just "Confirm result"), or left
// exactly as it was for an early-ended one (the court was still "live" —
// the facilitator hit "End match early" directly) — so all 4 players'
// waiting clock keeps counting from their true last stopping point
// instead of restarting at zero. An early-ended match shouldn't make a
// player look freshly rested when they were really just interrupted.
export function nextLastMatchEndAt(player, matchEndedAt, isEarlyEnd) {
  return isEarlyEnd ? player.lastMatchEndAt : matchEndedAt;
}

export function getRecommendedSubstitutes(waitingPlayers, count = 3) {
  const since = (p) => p.lastMatchEndAt || p.checkedInAt || 0;
  return (waitingPlayers || [])
    .filter((p) => p && !p.held)
    .slice()
    .sort((a, b) => since(a) - since(b)) // oldest "since" first = longest waiting
    .slice(0, count)
    .map((p) => p.id);
}

// Since a player last stopped playing (or checked in, if they haven't played
// yet) — the exact same fallback WaitingTimer.jsx displays with. Exported so
// both getRecommendedSubstitutes/getSubstituteRecommendations and
// PlayerPicker's own row rendering read from one shared definition.
export function sinceWaiting(p) {
  return p?.lastMatchEndAt || p?.checkedInAt || 0;
}

// Better Player Substitution — see PROJECT.md/FEATURES.md. Extends the
// original longest-waiting-only Substitute Recommendation with two more
// reasons a candidate might be worth recommending, each attached to the
// SPECIFIC candidate(s) it actually applies to rather than blended into one
// score: a facilitator sees exactly why each flagged name was suggested.
// Still purely informational/a ranking hint — never touches queueIds/
// nextMatchups/matchmaking, and the facilitator can pick anyone else from
// the full list regardless of what's recommended here.
//
// Priority order when the cap is reached (count, default 3): (1) the
// outgoing player's Tournament Partner (see setFixedPartner/
// clearFixedPartner, lib/queueManagement.js), if they're currently eligible
// to sub in — reinstating the requested pair immediately, if possible, is
// the single most relevant recommendation; (2) longest-waiting, same
// "since" fallback the on-screen waiting timer already uses; (3) same skill
// level as the outgoing player, only used to fill any remaining slots. A
// held player is never recommended for any reason — Hold Player means
// deliberately excluded from matchmaking. Each returned candidate gets
// exactly one reason (the highest-priority one that applied), matching the
// "⭐⭐ Recommended / {reason}" mockup — a candidate is never shown with more
// than one reason at once, even if several technically apply.
export function getSubstituteRecommendations(waitingPlayers, outgoingPlayer, count = 3) {
  const eligible = (waitingPlayers || []).filter((p) => p && !p.held);
  const picked = new Map(); // id -> reason, insertion order = priority order

  if (outgoingPlayer?.partnerId) {
    const partner = eligible.find((p) => p.id === outgoingPlayer.partnerId);
    if (partner) picked.set(partner.id, "Tournament partner");
  }

  const byWait = [...eligible].sort((a, b) => sinceWaiting(a) - sinceWaiting(b));
  for (const p of byWait) {
    if (picked.size >= count) break;
    if (!picked.has(p.id)) picked.set(p.id, "Longest waiting");
  }

  if (outgoingPlayer?.skill) {
    for (const p of eligible) {
      if (picked.size >= count) break;
      if (!picked.has(p.id) && p.skill === outgoingPlayer.skill) picked.set(p.id, "Same skill level");
    }
  }

  return [...picked.entries()].map(([id, reason]) => ({ id, reason }));
}

// Dissolves whichever upcoming matchup `playerId` is currently reserved in
// (if any), freeing all 4 of that matchup's players back to the unassigned
// pool — a matchup can't exist with only 3 players, so pulling one out
// always tears the whole thing down. The freed players stay in `queueIds`
// (they never left it — see reservedMatchupIds) and get picked up again the
// next time refreshNextMatchups runs, via the session's active rotation
// engine — so re-matching them still goes through the same Progressive
// Skill Rotation logic as everything else, not a special case. No-op if
// `playerId` isn't reserved anywhere (already unassigned, or mid-court).
// `exceptMatchupId` protects a matchup from being dissolved by its own
// substitution — see buildReplacementCandidates' excludeMatchupId.
export function dissolveMatchupIfReserved(nextMatchups, playerId, exceptMatchupId = null) {
  return (nextMatchups || []).filter(
    (m) => m.id === exceptMatchupId || (!m.teamA.includes(playerId) && !m.teamB.includes(playerId))
  );
}

// Latecomer Priority — see PROJECT.md/FEATURES.md. A facilitator-control
// override layer around the existing next-matchup system, NOT a new
// matchmaking algorithm — Adaptive/Progressive/Winner Pool Rotation still
// decide every matchup's actual composition; this only decides "who to
// bump, and with whom" for a preview the facilitator explicitly confirms.
// Pure and side-effect-free (no save(), no mutation) so it can be called
// once to render a preview and called AGAIN at Apply time to detect if the
// queue changed in between (see PickleballOpenPlay.jsx's
// applyLatecomerPriority) without any risk of the two calls disagreeing for
// any reason other than the queue actually having changed.
//
// Picks the first not-locked, not-held entry in `nextMatchups` (the
// earliest one Priority is allowed to touch — a locked matchup is
// explicitly protected by the organizer, same protection Regenerate
// already respects; a held matchup is deliberately reserved/paused and
// shouldn't be quietly reshuffled). Bumps whichever of that matchup's 4
// current players have played the MOST games (least in need of the next
// match) — ties broken by fixed slot order (teamA[0], teamA[1], teamB[0],
// teamB[1]) for determinism — one bumped slot per latecomer, in the order
// `latecomerIds` was given. Never invents a skill-pairing/diversity rule
// this codebase doesn't already enforce elsewhere (see
// buildReplacementCandidates above — a manual Substitute already allows
// any waiting player into any slot), so this doesn't weaken or duplicate
// anything Adaptive Skill Rotation itself decides.
//
// Returns `{ ok: false, reason }` (nextMatchups completely unexamined
// further, nothing to apply) when there's no eligible matchup, too many
// latecomers for one matchup (max 4), or a latecomer is somehow already
// reserved somewhere (shouldn't happen for a freshly checked-in player,
// checked defensively). Returns `{ ok: true, matchupId, before: {teamA,
// teamB}, after: {teamA,teamB}, displacedPlayerIds, insertedPlayerIds }`
// otherwise — `insertedPlayerIds[i]` took the slot `displacedPlayerIds[i]`
// vacated, matching `latecomerIds`' given order.
export function computeLatecomerPriorityPreview(nextMatchups, players, latecomerIds) {
  const ids = [...new Set(latecomerIds || [])].filter(Boolean);
  if (ids.length === 0) return { ok: false, reason: "No player was selected to prioritize." };
  if (ids.length > 4) {
    return { ok: false, reason: "Too many players selected — a matchup only has 4 spots." };
  }

  const reserved = reservedMatchupIds(nextMatchups || []);
  const alreadyReserved = ids.find((id) => reserved.has(id));
  if (alreadyReserved) {
    const name = players?.[alreadyReserved]?.name || "That player";
    return { ok: false, reason: `${name} is already part of an upcoming matchup.` };
  }

  // Defense-in-depth against stale UI state — a player who was eligible
  // when the "Prioritize Next Match" button rendered may have since been
  // held, checked out, or removed entirely (e.g. another facilitator
  // action landed first). Never silently proceed with someone who's no
  // longer a valid, currently-waiting player.
  const unavailable = ids.find((id) => {
    const p = players?.[id];
    return !p || p.held || p.status === "CHECKED_OUT";
  });
  if (unavailable) {
    const name = players?.[unavailable]?.name || "That player";
    return { ok: false, reason: `${name} is no longer available to prioritize (held, checked out, or removed).` };
  }

  const target = (nextMatchups || []).find((m) => !m.locked && !m.held);
  if (!target) {
    return { ok: false, reason: "No upcoming matchup is available to prioritize into — every one is locked or held." };
  }

  const slots = [
    { side: "teamA", index: 0, playerId: target.teamA[0] },
    { side: "teamA", index: 1, playerId: target.teamA[1] },
    { side: "teamB", index: 0, playerId: target.teamB[0] },
    { side: "teamB", index: 1, playerId: target.teamB[1] },
  ];
  const gamesOf = (id) => players?.[id]?.games ?? 0;
  const bumpOrder = [...slots].sort((a, b) => gamesOf(b.playerId) - gamesOf(a.playerId));
  const bumped = bumpOrder.slice(0, ids.length);

  const teamA = [...target.teamA];
  const teamB = [...target.teamB];
  const displacedPlayerIds = [];
  bumped.forEach((slot, i) => {
    displacedPlayerIds.push(slot.playerId);
    (slot.side === "teamA" ? teamA : teamB)[slot.index] = ids[i];
  });

  return {
    ok: true,
    matchupId: target.id,
    before: { teamA: target.teamA, teamB: target.teamB },
    after: { teamA, teamB },
    displacedPlayerIds,
    insertedPlayerIds: ids,
  };
}

// Adaptive Skill Rotation — see PROJECT.md/FEATURES.md. Reusable manual
// skill-override action: a single pure function so every UI entry point
// (Waiting Players panel today; Standings and any future Player Details
// screen) calls the exact same logic rather than each reimplementing it.
// Also used internally by automatic promotion/relegation (see endMatch in
// PickleballOpenPlay.jsx), so both paths append to the same activity log in
// the same shape. Deliberately does NOT touch state.courts — a live match a
// player is currently on continues completely undisturbed; only
// queueIds-eligible matchups are affected (dissolveMatchupIfReserved is a
// no-op for a player who's mid-match, same as moveToQueue/substitution).
// Resets both streak counters so a manual override can't be immediately
// undone by an in-flight automatic promotion/relegation the next time
// endMatch runs — manual changes are meant to override automatic ones.
export function changePlayerSkill(state, playerId, newSkill, reason = "Manual override") {
  const p = state.players[playerId];
  if (!p || (newSkill !== "beginner" && newSkill !== "intermediate") || p.skill === newSkill) {
    return state;
  }
  const previousSkill = p.skill === "intermediate" ? "intermediate" : "beginner";
  const players = {
    ...state.players,
    [playerId]: { ...p, skill: newSkill, streak: 0, lossStreak: 0 },
  };
  const nextMatchups = dissolveMatchupIfReserved(state.nextMatchups, playerId);
  const logEntry = {
    id: uid(),
    playerId,
    playerName: p.name,
    previousSkill,
    newSkill,
    reason,
    source: "manual", // Session Analytics Engine — distinguishes this from an automatic promotion/relegation (see PickleballOpenPlay.jsx's endMatch) without string-matching `reason`
    timestamp: Date.now(),
  };
  const skillChangeLog = [logEntry, ...(state.skillChangeLog || [])].slice(0, 50);
  return { ...state, players, nextMatchups, skillChangeLog };
}

// Pre-Check-In Skill Correction — see PROJECT.md/FEATURES.md. A one-click
// facilitator correction to a registered player's roster skill level,
// available only in the Check-In tab's "not yet here" list, BEFORE the
// player checks in. This is an initial data correction, not a mid-session
// promotion/relegation, so — deliberately, unlike changePlayerSkill above
// — it does NOT touch skillChangeLog (that log, and the Session Analytics
// promotion/relegation stats derived from it, are for in-session changes
// only), does NOT reset streak/lossStreak (a not-yet-checked-in player has
// none to reset), and does NOT call dissolveMatchupIfReserved (an
// unchecked-in player can never be reserved in nextMatchups). A no-op —
// same state reference — once the player is checked in; from that point
// on, changePlayerSkill (via PickleballOpenPlay.jsx's wrapper) is the one
// and only skill-change path, per explicit direction against a second,
// competing implementation.
export function setPreCheckInSkill(state, playerId, newSkill) {
  const p = state.players[playerId];
  if (!p || p.checkedIn || (newSkill !== "beginner" && newSkill !== "intermediate") || p.skill === newSkill) {
    return state;
  }
  return { ...state, players: { ...state.players, [playerId]: { ...p, skill: newSkill } } };
}

// Court Renaming — see PROJECT.md/FEATURES.md. Display-only: sets a
// court's `name` label, found by its (unchanged, real-identifier) `number`.
// A blank/whitespace-only name resets the court back to the default
// "Court {number}" display (stored as `null`, not an empty string, so
// courtDisplayName's fallback stays a single check). A no-op (same state
// reference) if the court doesn't exist or the name is already exactly
// this value. Never touches `number` itself, `status`, or any other court
// field — matchHistory, Court Booking reservations, dispatch, and every
// matchmaking engine all key off `number`, completely unaffected by this.
export function renameCourt(state, courtNumber, name) {
  const court = state.courts.find((c) => c.number === courtNumber);
  if (!court) return state;
  const trimmed = (name || "").trim();
  const nextName = trimmed === "" ? null : trimmed;
  if (court.name === nextName) return state;
  const courts = state.courts.map((c) => (c.number === courtNumber ? { ...c, name: nextName } : c));
  return { ...state, courts };
}

// Court Renaming — the one place "what does this court display as" is
// decided, so every screen (CourtCard, voice announcements, Queue
// Activity Log, etc.) shows the exact same label. Falls back to
// "Court {number}" whenever no custom name has been set.
export function courtDisplayName(court) {
  return court?.name ? court.name : `Court ${court?.number}`;
}

// Smart Queue Management — see PROJECT.md/FEATURES.md. Reusable, pure
// status derivation for a checked-in player — never stored on the player
// record itself (it's always computed fresh from state, so it can never
// drift out of sync with the court/matchup/held data it's derived from).
// Priority order matters: a player can only ever be in exactly one of
// these at a time, so CHECKED_OUT/PLAYING are checked first since they're
// the most "final" for this moment (a player mid-match stays PLAYING
// regardless of any other flag). HELD is checked before UPCOMING —
// holdPlayer (lib/queueManagement.js) always dissolves any matchup a
// player is reserved in before marking them held, so in practice the two
// never overlap, but this ordering keeps the function correct even if a
// future caller sets `held` without going through that action.
export function getPlayerQueueStatus(player, state) {
  if (!player) return null;
  if (player.status === "CHECKED_OUT") return QUEUE_STATUSES.CHECKED_OUT;
  const onLiveCourt = (state.courts || []).some(
    (c) => c.status !== "open" && (c.teamA.includes(player.id) || c.teamB.includes(player.id))
  );
  if (onLiveCourt) return QUEUE_STATUSES.PLAYING;
  if (player.held) return QUEUE_STATUSES.HELD;
  const upcoming = (state.nextMatchups || []).some(
    (m) => m.teamA.includes(player.id) || m.teamB.includes(player.id)
  );
  if (upcoming) return QUEUE_STATUSES.UPCOMING;
  return QUEUE_STATUSES.WAITING;
}

// In-Court Player Count — see PROJECT.md. IN-COURT PLAYERS = every
// checked-in player who is not CHECKED_OUT — i.e. PLAYING + HELD + UPCOMING
// + WAITING combined (every getPlayerQueueStatus outcome except
// CHECKED_OUT), reusing that exact same taxonomy rather than a second
// definition. Deliberately NOT `player.checkedIn` alone — checkedIn stays
// true forever after checkout (see PickleballOpenPlay.jsx's checkoutPlayer,
// which only ever flips `status`), so a naive checkedIn-only count would
// silently keep counting players who have already left for the rest of the
// session.
export function countInCourtPlayers(state) {
  return Object.values(state.players || {}).filter(
    (p) => p.checkedIn && getPlayerQueueStatus(p, state) !== QUEUE_STATUSES.CHECKED_OUT
  ).length;
}

// Rotation strategies (Strategy pattern — see src/engines/), one instance
// per mode. state.rotationMode ("continuous" | "winnerPool" |
// "progressiveSkill", see ROTATION_MODES in constants.js) picks which one
// generates matchups for the general waiting queue — see getRotationEngine
// below. "winnerPool" mode still uses balancedEngine here for its general
// queue (players not currently part of an active court pair); its own
// pooled-team building is separate, see src/lib/winnerPoolRound.js.
const balancedEngine = new BalancedRotationEngine();
const progressiveSkillEngine = new ProgressiveSkillRotationStrategy();
const adaptiveSkillEngine = new AdaptiveSkillRotationEngine();

export function getRotationEngine(rotationMode) {
  if (rotationMode === "progressiveSkill") return progressiveSkillEngine;
  if (rotationMode === "adaptiveSkill") return adaptiveSkillEngine;
  return balancedEngine;
}

// Player Checkout During Open Play — see PROJECT.md. A player is eligible
// for future match generation only while ACTIVE: not held (Smart Queue
// Management's Hold Player — temporary, reversible, see
// lib/queueManagement.js) and not checked out (status "CHECKED_OUT",
// permanent for the rest of the session). One shared predicate so
// refreshNextMatchups/regenerateNextMatchups (and anything else that ever
// needs this question) can't drift out of sync with each other.
//
// On Break / Left (PickleKing Player's Open Play Availability feature) —
// see PROJECT.md's UX audit finding. `player.playStatus` is written
// exclusively by the Player app (never by Pro — see
// WaitingPlayersPanel.jsx's read-only badge, the only other place Pro
// reads this field) via one of: "available", "on_break",
// "confirmation_required", "left", or unset (existing sessions predating
// this field, or a player who has never touched their status — treated
// exactly like "available", never as an error and never excluded). Only
// "on_break" and "left" are excluded here: a player has explicitly said
// "don't call me right now." "confirmation_required" is deliberately NOT
// excluded — it means a matchup has already been formed with this player
// in it and they're mid-way through confirming they're still around (see
// pickleking-player's playStatusRules.js's shouldRequestConfirmation),
// not "don't select me" — excluding it here would fight the very selection
// that put them in that state. This is the single shared choke point every
// rotation mode's candidate pool already flows through (see the comment
// below on sortMatchupsByPriority), so this one exclusion applies
// identically under Continuous, Winner Pool, Progressive Skill, and
// Adaptive Skill Rotation — no engine file needed a matching change.
function isPausedByPlayerStatus(player) {
  return player.playStatus === "on_break" || player.playStatus === "left";
}

function isEligibleForMatchmaking(player) {
  return Boolean(player) && !player.held && player.status !== "CHECKED_OUT" && !isPausedByPlayerStatus(player);
}

// On Break / Left — dissolve reservation. holdPlayer/checkoutPlayer (see
// lib/queueManagement.js) already dissolve a player's nextMatchups
// reservation the INSTANT they become ineligible, as part of that same
// Pro-side action/state transition — see dissolveMatchupIfReserved above.
// playStatus has no equivalent moment: it's written directly into the
// session row by PickleKing Player's set-play-status Edge Function, not by
// any Pro-side action, so it arrives here purely via the realtime
// subscription's plain setState (PickleballOpenPlay.jsx's `load`), with no
// hook of its own to dissolve anything. Without this, a player who was
// selected into a matchup while AVAILABLE and then marks On Break/Left
// stays reserved in that matchup forever (isDispatchEligible below already
// guarantees it can never be dispatched to a court — see courtDispatch.js —
// but nothing would ever free their 3 teammates back into the waiting
// pool). Called from save() (PickleballOpenPlay.jsx), right alongside
// applyPendingCourtRemovals, before refreshNextMatchups runs — so freed
// teammates are immediately eligible again in that SAME save(), not one
// cycle later. A no-op whenever no upcoming matchup currently holds a
// paused player (the overwhelmingly common case) — same reference-stable
// no-op precedent every other state-shaping step in this app already
// follows when there's nothing to do.
export function dissolveMatchupsForPausedPlayers(nextMatchups, players) {
  const pausedIds = Object.keys(players || {}).filter((id) => isPausedByPlayerStatus(players[id]));
  if (pausedIds.length === 0) return nextMatchups;
  return pausedIds.reduce((matchups, id) => dissolveMatchupIfReserved(matchups, id), nextMatchups || []);
}

// Smart Queue Management — see PROJECT.md/FEATURES.md. How many upcoming
// matchups the automatic engine is allowed to keep queued at once, given
// the session's current court occupancy. Manual-assignment courts are
// excluded entirely from both counts — they're a separate pool the
// automatic engine never touches (same precedent as
// manuallyReservedIds/generateRemainingCourts).
//
// Steady state: Live Courts − 1 — enough that a court finishing has an
// upcoming match ready immediately, without stockpiling matches far beyond
// what can actually be deployed soon. "Live" here means any court not
// currently "open" (covers "live" mid-score AND "finished" awaiting End
// Match — both still occupied).
//
// Before the session has any court occupied yet (a fresh session, or a
// lull where every court is simultaneously open), the steady-state formula
// would floor at 0 and never let the FIRST matches get built at all — so
// that specific case is special-cased to "enough to fill every automatic
// court", exactly enough for one full round of "Fill all open courts".
// The instant any court goes live, this reverts to the plain Live Courts −
// 1 rule on its own — no separate "has the session started" flag to track.
export function maxUpcomingMatchups(courts) {
  const automaticCourts = (courts || []).filter((c) => c.assignmentMode !== "manual");
  const openCount = automaticCourts.filter((c) => c.status === "open").length;
  const occupiedCount = automaticCourts.length - openCount;
  if (occupiedCount === 0) return automaticCourts.length;
  // Bug fix (Smart Court Dispatch) — the plain "Live Courts − 1" steady-
  // state formula collapses toward 0 the moment even ONE court becomes
  // occupied, regardless of how many OTHER automatic courts are still
  // sitting open waiting to be filled (e.g. 1 occupied + 2 still-open
  // courts used to cap the queue at 0, so those 2 open courts could never
  // get a matchup no matter how many players checked in afterward — only
  // Court 1 ever got dispatched, and it never recovered). The cap must
  // never drop below the number of courts that are still open right now,
  // since Smart Court Dispatch needs one matchup per open court to fill
  // them all in a single pass. Once every court is occupied (openCount
  // === 0), this reduces back to the original literal "Live Courts − 1"
  // steady-state spare, unchanged.
  return Math.max(openCount, occupiedCount - 1);
}

// appends any additional ready-to-play matchups the active rotation engine
// can build from waiting players not already locked into one (and not held
// — players[id].held) — existing matchups are left completely untouched,
// so a scorer's manual "fix teams" / substitute edits (or a matchup
// already mid-review) never get silently overwritten. Safe to call after
// every state change; it's a no-op unless the engine finds a
// newly-possible matchup AND there's still room under maxUpcoming (Smart
// Queue Management's queue-depth cap, see maxUpcomingMatchups above —
// Infinity here preserves this function's old uncapped behavior for any
// caller that doesn't pass one, e.g. existing tests).
//
// Guaranteed Upcoming Match Queue — see PROJECT.md/FEATURES.md. Skill
// balancing is a preference, not a blocker: same-skill fallback is always
// allowed here (not just in regenerateNextMatchups below) so the queue
// never sits empty just because the waiting pool isn't an even
// beginner/intermediate mix. This supersedes the queue's earlier
// strict-skill-only behavior. The fairness algorithm itself is unchanged —
// the engine still tries every balanced pairing first and only falls back
// to same-skill pairing for players a balanced pairing couldn't use, still
// scored by the same waiting-time/games-played/repeat-partner-avoidance
// rules (see BalancedRotationEngine's pairLeftovers/scorePartner) — this
// only removes skill as a hard requirement, it doesn't make pairing random.
export function refreshNextMatchups(queueIds, players, existingMatchups, engine = balancedEngine, phase = null, maxUpcoming = Infinity, matchmakingPriority = null) {
  const room = Math.max(0, maxUpcoming - existingMatchups.length);
  if (room === 0) return existingMatchups;
  const waitingIds = queueIds.filter((id) => isEligibleForMatchmaking(players[id]));
  const newMatchups = engine.generateMatchups({ waitingIds, players, existingMatchups, phase }, true);
  const ordered = sortMatchupsByPriority(newMatchups, players, matchmakingPriority);
  return [...existingMatchups, ...ordered.slice(0, room)];
}

// "Regenerate matchups": dissolves every not-locked-and-not-held upcoming
// matchup and reruns the engine over the full eligible pool (their players
// simply become available again, since queueIds already contains everyone
// waiting regardless of matchup membership). Locked AND held matchups are
// left exactly as they are, in their original relative order — Smart Queue
// Management's Hold Match requires a held matchup to "not regenerate the
// queue" (survive an explicit Regenerate the same way a locked one
// already does) and to keep its position rather than getting shuffled to
// the back. Same same-skill fallback as refreshNextMatchups above now that
// the queue is always-guaranteed — this is still useful as a deliberate,
// one-off "reshuffle everyone waiting right now" action (e.g. after a
// scorer manually dissolves a matchup), it just no longer differs from
// refreshNextMatchups in fallback behavior, only in dissolving
// unlocked/not-held matchups first.
export function regenerateNextMatchups(queueIds, players, existingMatchups, engine = balancedEngine, phase = null, maxUpcoming = Infinity, matchmakingPriority = null) {
  const protectedMatchups = existingMatchups.filter((m) => m.locked || m.held);
  const room = Math.max(0, maxUpcoming - protectedMatchups.length);
  const waitingIds = queueIds.filter((id) => isEligibleForMatchmaking(players[id]));
  const newMatchups = room === 0
    ? []
    : engine.generateMatchups({ waitingIds, players, existingMatchups: protectedMatchups, phase }, true);
  const ordered = sortMatchupsByPriority(newMatchups, players, matchmakingPriority);
  return [...protectedMatchups, ...ordered.slice(0, room)];
}

// Session Matchmaking Priority — see PROJECT.md/FEATURES.md and
// MATCHMAKING_PRIORITIES (lib/constants.js). A reusable candidate-ORDERING
// policy applied here, in the one shared choke point every rotation mode's
// generated matchups already flow through (refreshNextMatchups/
// regenerateNextMatchups above) — so Continuous, Winner Pool's general
// queue, Progressive Skill, and Adaptive Skill Rotation all get this for
// free, with zero engine-specific code and nothing added to any engine
// file. Deliberately a POST-hoc re-sort of matchups an engine has ALREADY
// fully decided (who's on which team, who's facing whom) — partner
// diversity (scorePartner), opponent diversity (scoreOpponents),
// Winner-vs-Winner, promotion/relegation, and Beginner/Intermediate
// division separation are all untouched, since none of that math is
// touched here; this only changes which of the already-built matchups ends
// up at the FRONT of the list — which matters because that's what
// determines who's dispatched first and who survives the queue-depth cap's
// slice whenever there isn't room/courts for everyone waiting. `null`
// (no priority set) returns the list completely unchanged — the exact
// order the engine itself produced, same as before this feature existed.
export function sortMatchupsByPriority(matchups, players, priority) {
  if (!priority) return matchups;
  return [...matchups].sort(
    (a, b) => matchupPriorityValue(a, players, priority) - matchupPriorityValue(b, players, priority)
  );
}

function matchupPriorityValue(matchup, players, priority) {
  const ids = [...matchup.teamA, ...matchup.teamB];
  if (priority === "leastGamesPlayed") {
    return ids.reduce((sum, id) => sum + (players[id]?.games || 0), 0) / ids.length;
  }
  if (priority === "newlyCheckedIn") {
    // most-recently-checked-in first -> negate so the sort's ascending
    // comparator still means "best/first"
    const avgCheckedInAt = ids.reduce((sum, id) => sum + (players[id]?.checkedInAt || 0), 0) / ids.length;
    return -avgCheckedInAt;
  }
  // "longestWaiting" — oldest average "since" first, same fallback
  // sinceWaiting()/WaitingTimer.jsx already use
  return ids.reduce((sum, id) => sum + sinceWaiting(players[id]), 0) / ids.length;
}

// records partner/opponent/court history on all 4 players in a just-ended
// match — feeds the rotation engine's recency scoring next time it runs.
// Win/loss/streak/points bookkeeping stays in PickleballOpenPlay.jsx's
// endMatch since that also needs the score, kept separate here from
// history that any future rotation engine would also want.
export function recordRotationHistory(players, teamA, teamB, courtNumber) {
  const next = { ...players };

  const updateFor = (id, partnerId, opponentIds) => {
    const p = next[id];
    if (!p) return;

    const partnerCounts = { ...(p.partnerCounts || {}) };
    partnerCounts[partnerId] = (partnerCounts[partnerId] || 0) + 1;
    const recentPartnerIds = [partnerId, ...(p.recentPartnerIds || [])].slice(0, 2);

    const opponentCounts = { ...(p.opponentCounts || {}) };
    opponentIds.forEach((oid) => {
      opponentCounts[oid] = (opponentCounts[oid] || 0) + 1;
    });
    const recentOpponentIds = [...opponentIds, ...(p.lastOpponentIds || [])].filter(
      (id, i, arr) => arr.indexOf(id) === i
    ).slice(0, 4);

    const courtCounts = { ...(p.courtCounts || {}) };
    if (courtNumber != null) courtCounts[courtNumber] = (courtCounts[courtNumber] || 0) + 1;

    next[id] = {
      ...p,
      partnerCounts,
      recentPartnerIds,
      opponentCounts,
      lastOpponentIds: opponentIds,
      recentOpponentIds,
      courtCounts,
      lastCourt: courtNumber ?? p.lastCourt ?? null,
    };
  };

  teamA.forEach((id) => updateFor(id, teamA.find((otherId) => otherId !== id), teamB));
  teamB.forEach((id) => updateFor(id, teamB.find((otherId) => otherId !== id), teamA));

  return next;
}

// Create Session's "Expected Playing Opportunities" estimate — a pure
// projection from session duration + court/match-duration assumptions,
// never a guarantee (actual games/player depends on real match lengths,
// no-shows, byes, etc.). Rounded to the nearest whole number for display;
// 0 whenever there aren't yet enough registered players or courts to
// divide by (rather than NaN/Infinity).
export function estimateGamesPerPlayer({ sessionDurationHours, courtsCount, registeredPlayers, avgMatchDurationMinutes }) {
  if (!sessionDurationHours || !courtsCount || !registeredPlayers || !avgMatchDurationMinutes) return 0;
  const totalCourtMinutes = sessionDurationHours * 60 * courtsCount;
  const estimatedMatches = totalCourtMinutes / avgMatchDurationMinutes;
  const totalPlayerAppearances = estimatedMatches * 4;
  return Math.round(totalPlayerAppearances / registeredPlayers);
}

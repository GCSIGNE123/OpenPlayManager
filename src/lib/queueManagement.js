import { getRotationEngine, refreshNextMatchups, regenerateNextMatchups, maxUpcomingMatchups, dissolveMatchupIfReserved, courtDisplayName } from "./utils.js";
import { progressiveSkillPhaseFor } from "./progressiveSkillPhase.js";
import { uid } from "./random.js";

// Smart Queue Management — see PROJECT.md/FEATURES.md. Every action here is
// a pure, UI-agnostic `(state, ...) => newState` function — none of them
// import React, touch `save()`, or know anything about which screen called
// them. That's deliberate: PickleballOpenPlay.jsx's own handlers are thin
// wrappers (call one of these, then save() + a facilitator-facing toast),
// but any future feature — Smart Court Dispatch, voice announcements,
// a kiosk view, an API endpoint — can call the exact same functions
// directly and get identical, already-tested behavior. Do NOT put anything
// UI-specific (confirmation dialogs, toast text, React state) in this file
// — that belongs in the caller.
//
// Every action that changes who's eligible/waiting relies on the app's
// existing single write path (PickleballOpenPlay.jsx's save()) to actually
// rebuild nextMatchups afterward — save() already calls refreshNextMatchups
// unconditionally on every state change, so "Queue Regeneration" (check-in,
// checkout, resume, skip, held-player-resume, matchup-cancelled) is
// automatic for free and isn't duplicated here. The one exception is
// `regenerate`, which is the deliberate, explicit "rebuild everything not
// protected right now" action (mirrors the existing "Regenerate matchups"
// button) — see below.

// Hold Player — temporarily excludes a player from matchmaking. Preserves
// every stat/streak/payment field untouched (only the `held` flag itself
// changes) and the player stays checked in. Dissolves any not-yet-deployed
// matchup they're currently reserved in (same mechanism moveToQueue/
// changePlayerSkill already use) so "temporarily exclude from matchmaking"
// is actually true immediately, not just from the next round onward.
//
// Held Player Reminder — see PROJECT.md/FEATURES.md — needs to know WHEN a
// player became held and how many rounds have completed since, purely to
// decide when to nudge the facilitator; `heldAt`/`heldAtRound` are set here,
// fresh, every time a player is newly held (never touched while already
// held — the existing no-op guard above already prevents a re-hold from
// resetting these mid-hold). `heldReminderLastShownAt` starts null so the
// very first reminder check for this hold period isn't gated by anything.
// None of these three fields are ever read by matchmaking/rotation
// engines — see getPlayersNeedingHeldReminder below, the only reader.
export function holdPlayer(state, playerId) {
  const p = state.players[playerId];
  if (!p || p.held) return state;
  const players = {
    ...state.players,
    [playerId]: {
      ...p,
      held: true,
      heldAt: Date.now(),
      heldAtRound: (state.matchHistory || []).length,
      heldReminderLastShownAt: null,
    },
  };
  const nextMatchups = dissolveMatchupIfReserved(state.nextMatchups, playerId);
  return { ...state, players, nextMatchups };
}

// Resume Player — the inverse of holdPlayer. Returns the player to the
// waiting queue; everything else (stats/streaks/payment/queue position) is
// untouched. Also clears the Held Player Reminder bookkeeping above, so a
// later, fresh hold starts its own reminder clock rather than inheriting a
// stale one.
export function resumePlayer(state, playerId) {
  const p = state.players[playerId];
  if (!p || !p.held) return state;
  const players = {
    ...state.players,
    [playerId]: { ...p, held: false, heldAt: null, heldAtRound: null, heldReminderLastShownAt: null },
  };
  return { ...state, players };
}

// Held Player Reminder — see PROJECT.md/FEATURES.md. Pure, UI-agnostic
// query: which currently-held players have been held long enough (by
// either configurable threshold — whichever is met first) to warrant
// reminding the facilitator, and haven't already been reminded within the
// configurable repeat interval. Returns plain data ({playerId, playerName,
// minutesHeld, roundsHeld}); the caller decides how/whether to render it.
// Deliberately reads only held/heldAt/heldAtRound/heldReminderLastShownAt —
// never touches queueIds/nextMatchups/players' skill/games/etc., so this
// can never influence matchmaking or player priority, only surface a
// reminder about a fact that's already true.
export function getPlayersNeedingHeldReminder(state, now = Date.now()) {
  const { thresholdMinutes = 20, thresholdRounds = 3, repeatIntervalMinutes = 10 } = state.heldPlayerReminderSettings || {};
  const currentRound = (state.matchHistory || []).length;
  return Object.values(state.players || {})
    .filter((p) => p.held && p.heldAt)
    .map((p) => {
      const minutesHeld = (now - p.heldAt) / 60000;
      const roundsHeld = currentRound - (p.heldAtRound ?? currentRound);
      return { p, minutesHeld, roundsHeld };
    })
    .filter(({ minutesHeld, roundsHeld }) => minutesHeld >= thresholdMinutes || roundsHeld >= thresholdRounds)
    .filter(({ p }) => {
      if (!p.heldReminderLastShownAt) return true;
      return (now - p.heldReminderLastShownAt) / 60000 >= repeatIntervalMinutes;
    })
    .map(({ p, minutesHeld, roundsHeld }) => ({
      playerId: p.id,
      playerName: p.name,
      minutesHeld: Math.floor(minutesHeld),
      roundsHeld: Math.max(0, roundsHeld),
    }));
}

// Held Player Reminder — marks a reminder as shown for one player (updates
// heldReminderLastShownAt, the repeat-interval gate getPlayersNeedingHeldReminder
// above reads) and records a Queue Activity Log entry, same shared-log
// convention as noteDissolvedHeldMatchups. A no-op (same state reference)
// if the player isn't actually held right now — same defensive precedent
// every other action in this file already follows.
export function markHeldReminderShown(state, playerId, { minutesHeld, roundsHeld }) {
  const p = state.players[playerId];
  if (!p || !p.held) return state;
  const players = { ...state.players, [playerId]: { ...p, heldReminderLastShownAt: Date.now() } };
  const entry = {
    id: uid(),
    kind: "heldPlayerReminder", // shared Queue Activity Log — see lib/courtDispatch.js's logDispatchEvent for the other kinds this same log holds
    playerId,
    playerName: p.name,
    minutesHeld,
    roundsHeld,
    reason: `Held for ${minutesHeld} min (${roundsHeld} completed round${roundsHeld === 1 ? "" : "s"})`,
    timestamp: Date.now(),
  };
  const queueActivityLog = [entry, ...(state.queueActivityLog || [])].slice(0, 50);
  return { ...state, players, queueActivityLog };
}

// Held Player Reminder (facilitator convenience) — a read-only lookup of a
// player's most recent completed match, scanning matchHistory (newest
// entries are appended, so we scan from the end) for the last record
// naming this player in either team. Returns null if the player has never
// appeared in any completed match. Pure query, no state mutation — does
// not affect getPlayersNeedingHeldReminder/markHeldReminderShown above or
// anything else; it only feeds the reminder banner's display copy.
export function getLastCourtForPlayer(state, playerId) {
  const history = state.matchHistory || [];
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.teamA.includes(playerId) || m.teamB.includes(playerId)) {
      return { court: m.court, endedAt: m.endedAt };
    }
  }
  return null;
}

// Player Payment Tracking — see PROJECT.md/FEATURES.md. Session-scoped
// only: `paymentStatus`/`paymentMethod` live on the session's own player
// record (state.players), never on the Player Database — a fresh player
// record is created at every startSession/quickAddCheckIn (see
// PickleballOpenPlay.jsx), so payment status always starts over ("unpaid",
// null) for a new session with zero extra reset logic needed here.
// Marks a player Paid with the given method, corrects an already-paid
// player's method (Cash <-> GCash) if the facilitator made a mistake, OR —
// method === "unpaid" — reverts an already-paid player back to Unpaid for
// a mis-clicked payment. One function handles all three, since they're all
// just "set paymentStatus/paymentMethod together, log what changed". A
// no-op (same state reference) if the method is invalid, or the player is
// already in exactly that state (so a repeat click, or reverting a player
// who's already unpaid, does nothing). Records one Queue Activity Log
// entry per real change — "Payment Received" for unpaid->paid,
// "Payment Updated" for any other transition (Cash <-> GCash, or paid ->
// Unpaid, each showing the specific before/after in its reason) — same
// shared-log convention as markHeldReminderShown/noteDissolvedHeldMatchups.
// Does not touch queueIds/nextMatchups/skill/games/streaks — purely
// session payment bookkeeping, cannot affect matchmaking or player
// priority.
export function setPlayerPayment(state, playerId, method) {
  const p = state.players[playerId];
  if (!p || (method !== "cash" && method !== "gcash" && method !== "unpaid")) return state;
  const wasPaid = p.paymentStatus === "paid";
  if (method === "unpaid") {
    if (!wasPaid) return state;
    const previousMethod = p.paymentMethod;
    const players = { ...state.players, [playerId]: { ...p, paymentStatus: "unpaid", paymentMethod: null } };
    const entry = {
      id: uid(),
      kind: "paymentUpdated",
      playerId,
      playerName: p.name,
      previousMethod,
      newMethod: null,
      reason: `${methodLabel(previousMethod)} → Unpaid`,
      timestamp: Date.now(),
    };
    const queueActivityLog = [entry, ...(state.queueActivityLog || [])].slice(0, 50);
    return { ...state, players, queueActivityLog };
  }
  if (wasPaid && p.paymentMethod === method) return state;
  const previousMethod = p.paymentMethod;
  const players = { ...state.players, [playerId]: { ...p, paymentStatus: "paid", paymentMethod: method } };
  const entry = wasPaid
    ? {
        id: uid(),
        kind: "paymentUpdated",
        playerId,
        playerName: p.name,
        previousMethod,
        newMethod: method,
        reason: `${methodLabel(previousMethod)} → ${methodLabel(method)}`,
        timestamp: Date.now(),
      }
    : {
        id: uid(),
        kind: "paymentReceived",
        playerId,
        playerName: p.name,
        newMethod: method,
        reason: methodLabel(method),
        timestamp: Date.now(),
      };
  const queueActivityLog = [entry, ...(state.queueActivityLog || [])].slice(0, 50);
  return { ...state, players, queueActivityLog };
}

function methodLabel(m) {
  return m === "gcash" ? "GCash" : "Cash";
}

// Player Payment Tracking — pure derivation of session-wide payment
// statistics (Paid/Unpaid counts, Cash/GCash breakdown), read fresh from
// state.players every time, never stored. Only counts checked-in players
// (a not-yet-checked-in registered player isn't part of "this session" for
// payment-reference purposes yet). Facilitator-reference only — read by
// the Scorer tab's stats panel and the Session Analytics Payment Summary,
// never by matchmaking/queue/dispatch logic.
export function derivePaymentStats(players) {
  const checkedIn = Object.values(players || {}).filter((p) => p.checkedIn);
  const paid = checkedIn.filter((p) => p.paymentStatus === "paid");
  const unpaid = checkedIn.length - paid.length;
  const cash = paid.filter((p) => p.paymentMethod === "cash").length;
  const gcash = paid.filter((p) => p.paymentMethod === "gcash").length;
  return { totalPlayers: checkedIn.length, paid: paid.length, unpaid, cash, gcash };
}

// Permanent Partner Mode ("Always Pair Players") — see PROJECT.md/
// FEATURES.md. Facilitator designation of a fixed doubles partner, stored
// as a mutual `partnerId` pointer on both player records (session-scoped
// roster data, same precedent as skill/payment fields — never read by
// anything except BalancedRotationEngine.extractFixedPartnerTeams, and
// even that only when the alwaysPairPlayers session setting is on). Never
// touches queueIds/nextMatchups/matchmaking directly — setting a partner
// mid-session doesn't retroactively change an already-built upcoming
// matchup, only future matchmaking calls.
//
// Setting a new partner for either player first clears whatever partner
// link they already had (on both sides of that old pairing too), so
// `partnerId` is always either genuinely mutual or null — never a stale,
// one-sided pointer at a player who's since paired with someone else. A
// no-op if either id is missing, they're the same player, or they're
// already each other's partner.
export function setFixedPartner(state, playerIdA, playerIdB) {
  if (!playerIdA || !playerIdB || playerIdA === playerIdB) return state;
  const a = state.players[playerIdA];
  const b = state.players[playerIdB];
  if (!a || !b) return state;
  if (a.partnerId === playerIdB && b.partnerId === playerIdA) return state;

  const players = { ...state.players };
  if (a.partnerId && players[a.partnerId]) {
    players[a.partnerId] = { ...players[a.partnerId], partnerId: null };
  }
  if (b.partnerId && players[b.partnerId]) {
    players[b.partnerId] = { ...players[b.partnerId], partnerId: null };
  }
  players[playerIdA] = { ...players[playerIdA], partnerId: playerIdB };
  players[playerIdB] = { ...players[playerIdB], partnerId: playerIdA };
  return { ...state, players };
}

// Inverse of setFixedPartner — clears the mutual link on both sides. A
// no-op if the player has no partner set.
export function clearFixedPartner(state, playerId) {
  const p = state.players[playerId];
  if (!p || !p.partnerId) return state;
  const partnerId = p.partnerId;
  const players = { ...state.players, [playerId]: { ...p, partnerId: null } };
  if (players[partnerId]) {
    players[partnerId] = { ...players[partnerId], partnerId: null };
  }
  return { ...state, players };
}

// Skip Player — a brief "let others go first" nudge (restroom, water,
// stepping away), NOT an exclusion: the player stays fully eligible for
// matchmaking the whole time, only their position in the waiting queue
// (state.queueIds — the same array order the Waiting Players panel
// displays) moves to the back. A no-op if the player isn't actually in the
// queue (e.g. already reserved in an upcoming matchup or on a court) — Skip
// only makes sense for someone genuinely waiting.
export function skipPlayer(state, playerId) {
  if (!state.players[playerId] || !state.queueIds.includes(playerId)) return state;
  const queueIds = [...state.queueIds.filter((id) => id !== playerId), playerId];
  return { ...state, queueIds };
}

// Hold Match — reserves an upcoming matchup and removes it from automatic
// court assignment (fillCourt/fillAllCourts skip held entries — see
// PickleballOpenPlay.jsx) without dissolving it or touching any other
// matchup. Deliberately does NOT rebuild nextMatchups itself ("does not
// regenerate the queue") — the caller's own save() still runs its usual
// (additive-only, cap-aware) refresh afterward, same as every other action,
// but nothing here forces an extra rebuild.
export function holdMatch(state, matchupId) {
  const nextMatchups = (state.nextMatchups || []).map((m) => (m.id === matchupId ? { ...m, held: true } : m));
  return { ...state, nextMatchups };
}

// Resume Match — the inverse of holdMatch. A plain in-place flip (no
// reordering, no dissolve/rebuild of ANY matchup), so a resumed match keeps
// exactly the array position it already had — Smart Queue Management
// requires a held match retain its original queue position rather than
// being sent to the back once resumed.
export function resumeMatch(state, matchupId) {
  const nextMatchups = (state.nextMatchups || []).map((m) => (m.id === matchupId ? { ...m, held: false } : m));
  return { ...state, nextMatchups };
}

// Cancel Match — dissolves the matchup entirely. Its players were never
// removed from state.queueIds (nextMatchups is just a reservation overlay
// on top of the queue, not a separate pool), so they're automatically back
// in the waiting queue the instant this matchup entry is gone — no other
// change needed.
export function cancelMatch(state, matchupId) {
  const nextMatchups = (state.nextMatchups || []).filter((m) => m.id !== matchupId);
  return { ...state, nextMatchups };
}

// Cancel Live Match — see PROJECT.md/FEATURES.md. The on-court equivalent
// of Cancel Match above, for a match that's already been assigned to a
// court (status "live" or "dispatching") rather than still sitting in
// nextMatchups. Facilitator use case: a player or two step away (toilet
// break, phone call) mid-match and the court needs to be freed up for
// someone else in the meantime, without losing the pairing or recording a
// result. A no-op (same state reference) if the court doesn't exist or is
// already "open" (nothing live to cancel).
//
// Deliberately does NOT touch matchHistory/games/wins/losses/streaks — no
// match result is recorded, this is a full abort, not an early finish
// (see PickleballOpenPlay.jsx's endMatch for that, a completely separate
// action). The court itself resets to "open" (status/teamA/teamB/score/
// assignmentMode/manualLocked/dispatchedAt/awaitingPair all back to their
// emptyCourt defaults) — its `number` and any custom `name` (Court
// Renaming) are preserved, since neither is match-specific.
//
// The 4 interrupted players go back into state.queueIds (fillCourt/
// fillAllCourts removed them when the court went live, so they must be
// added back — nextMatchups is only ever a reservation overlay on top of
// queueIds, never a separate pool, same invariant every other queue action
// in this file relies on) AND their exact same pairing is reinserted as a
// new entry at the very FRONT of nextMatchups — "put on next queue" — so
// when they're back, they resume the SAME match (not reshuffled by the
// rotation engine) and are first in line for the next open court. That new
// entry is a completely ordinary (not held/locked) matchup, so it behaves
// exactly like any other queued matchup afterward — including being
// editable via Fix Teams/Substitute, or dissolved via Cancel Match, same
// as one the rotation engine generated itself.
export function cancelLiveMatch(state, courtNumber) {
  const court = state.courts.find((c) => c.number === courtNumber);
  if (!court || court.status === "open") return state;
  const { teamA, teamB } = court;
  const playedIds = [...teamA, ...teamB];
  const courts = state.courts.map((c) =>
    c.number === courtNumber
      ? {
          ...c,
          status: "open",
          teamA: [],
          teamB: [],
          scoreA: 0,
          scoreB: 0,
          awaitingPair: false,
          assignmentMode: "automatic",
          manualLocked: false,
          dispatchedAt: null,
        }
      : c
  );
  const queueIds = [...playedIds.filter((id) => !state.queueIds.includes(id)), ...state.queueIds];
  const restoredMatchup = { id: uid(), teamA, teamB };
  const nextMatchups = [restoredMatchup, ...(state.nextMatchups || [])];
  const teamANames = teamA.map((id) => state.players[id]?.name || "Unknown player");
  const teamBNames = teamB.map((id) => state.players[id]?.name || "Unknown player");
  const entry = {
    id: uid(),
    kind: "liveMatchCancelled", // shared Queue Activity Log — see lib/courtDispatch.js's logDispatchEvent for the other kinds this same log holds
    courtNumber,
    courtLabel: courtDisplayName(court), // Court Renaming — resolved once, now, from the court BEFORE its reset above — see logDispatchEvent's own courtLabel for the same "frozen snapshot" precedent
    teamA: teamANames,
    teamB: teamBNames,
    reason: "Match cancelled — players returned to the front of the queue",
    timestamp: Date.now(),
  };
  const queueActivityLog = [entry, ...(state.queueActivityLog || [])].slice(0, 50);
  return { ...state, courts, queueIds, nextMatchups, queueActivityLog };
}

// Held Match dissolution notice — see PROJECT.md/FEATURES.md. Whenever a
// matchup that was `held` at the time of `before` no longer exists in
// `after` (its last remaining player was pulled out from underneath it —
// checked out, changed skill division, substituted, moved to queue,
// removed, or held themselves), records one facilitator-visible activity-
// log entry so a deliberately reserved match disappearing is never silent
// — and, per Sprint 2.1, records the FULL matchup context (which teams,
// not just a player's name) so a facilitator can immediately recognize
// which match vanished, not just who caused it.
//
// `players` must be the player map as it existed BEFORE whatever mutation
// is being applied (i.e. the caller's own pre-action `state.players`, not
// the already-updated `next.players`) — this is deliberate: some callers
// (removePlayer) delete the responsible player's record as part of the
// very same action, so resolving names from an already-mutated map could
// silently lose them. Team names are resolved and stored as plain strings
// right now, at dissolution time — per explicit instruction, this
// function never tries to reconstruct a dissolved matchup's roster
// afterward from ids alone (a deleted or since-renamed player would make
// that unreliable); the log entry is a frozen snapshot.
//
// A no-op (returns `state` unchanged, same reference) if no HELD matchup
// was actually dissolved — dissolving an ordinary, not-held matchup is
// already expected, unremarkable behavior and isn't logged here. Callers
// can detect whether anything was logged by comparing
// `result.queueActivityLog !== state.queueActivityLog` (a new array is
// only ever created when an entry was actually added), the same
// reference-equality precedent this file's no-op returns already use.
//
// Deliberately rotation-mode-agnostic: nothing here reads state.rotationMode
// or any engine-specific field — this works identically under Continuous,
// Winner Pool, Progressive Skill, or Adaptive Skill Rotation, since Hold
// Match itself is a queue-management concept, not a rotation-engine one.
export function noteDissolvedHeldMatchups(state, before, after, reason, { players, affectedPlayer = null } = {}) {
  const afterIds = new Set((after || []).map((m) => m.id));
  const dissolvedHeld = (before || []).filter((m) => m.held && !afterIds.has(m.id));
  if (dissolvedHeld.length === 0) return state;
  const resolveNames = (ids) => (ids || []).map((id) => players?.[id]?.name || "Unknown player");
  const entries = dissolvedHeld.map((m) => ({
    id: uid(),
    kind: "heldMatchDissolved", // shared Queue Activity Log — see lib/courtDispatch.js's logDispatchEvent for the other kinds this same log now holds
    matchupId: m.id,
    teamA: resolveNames(m.teamA),
    teamB: resolveNames(m.teamB),
    reason,
    affectedPlayer,
    timestamp: Date.now(),
  }));
  const queueActivityLog = [...entries, ...(state.queueActivityLog || [])].slice(0, 50);
  return { ...state, queueActivityLog };
}

// Regenerate — the explicit, deliberate "rebuild every not-locked-and-not-
// held matchup from scratch right now" action (what the "Regenerate
// matchups" button calls). Resolves the session's active rotation
// engine/phase/queue-depth cap itself so every caller (today's button,
// any future Smart Court Dispatch/automation) rebuilds exactly the same
// way without repeating that boilerplate.
export function regenerate(state) {
  const engine = getRotationEngine(state.rotationMode);
  const phase = progressiveSkillPhaseFor(
    state.rotationMode,
    state.players,
    state.expectedGamesPerPlayer,
    state.progressiveSkillThresholds
  );
  const cap = maxUpcomingMatchups(state.courts);
  const nextMatchups = regenerateNextMatchups(state.queueIds, state.players, state.nextMatchups || [], engine, phase, cap, state.alwaysPairPlayers);
  return { ...state, nextMatchups };
}

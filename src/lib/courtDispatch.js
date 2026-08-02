import { uid } from "./random.js";

// Smart Court Dispatch — see PROJECT.md/FEATURES.md. A reusable,
// UI-agnostic, rotation-agnostic dispatch SERVICE: it reacts to "a court is
// open and there's an eligible upcoming matchup," not to any single
// action. PickleballOpenPlay.jsx's save() runs dispatchAvailableCourts on
// every state change, the same way it already runs refreshNextMatchups —
// so any action that frees a court (a completed match, an unlocked manual
// court, an undone round, ...) triggers dispatch consideration, without
// this module needing to know which action caused it.
//
// Dispatch sits strictly ABOVE Queue Management: it never sets
// player.held/status or reorders nextMatchups itself — it only ever READS
// those already-computed facts to decide whether an existing,
// already-built matchup is safe to place on a court. It never builds,
// edits, or regenerates a matchup — matchmaking stays entirely the
// rotation engines'/Queue Management's job (lib/utils.js's
// refreshNextMatchups/regenerateNextMatchups, called separately and
// unmodified). Nothing here reads state.rotationMode or any engine-
// specific field, so this works identically under Continuous, Progressive
// Skill, Adaptive Skill, Winner Pool, or any future rotation mode (King of
// the Court, Fixed Partner Rotation, ...).

// Dispatch Safety — a belt-and-suspenders re-check that an upcoming
// matchup is actually safe to place on a court right now. In practice
// Queue Management's own invariants already guarantee held/checked-out
// players never remain reserved in nextMatchups (holdPlayer/checkoutPlayer
// both dissolve their reservation immediately — see
// lib/queueManagement.js), so this is never a new source of truth, only a
// defensive re-check of existing flags.
export function isDispatchEligible(matchup, players) {
  if (!matchup || matchup.held) return false;
  const ids = [...(matchup.teamA || []), ...(matchup.teamB || [])];
  if (ids.length !== 4) return false; // incomplete or already-dissolved
  return ids.every((id) => {
    const p = players[id];
    return Boolean(p) && !p.held && p.status !== "CHECKED_OUT";
  });
}

// Selects the highest-priority (frontmost) eligible matchup, leaving every
// OTHER matchup — including any it skips over — in its exact original
// relative order. Never mutates, reorders, or rebuilds nextMatchups; the
// caller is responsible for actually removing the chosen matchup once it
// commits to deploying it. Shared by manual dispatch (Assign match / Fill
// all open courts / Generate remaining courts, see PickleballOpenPlay.jsx)
// and automatic dispatch below — one definition of "what's next" for the
// whole app, so manual and automatic dispatch can never disagree.
export function selectNextDispatchableMatchup(nextMatchups, players) {
  const list = nextMatchups || [];
  const index = list.findIndex((m) => isDispatchEligible(m, players));
  if (index === -1) return { matchup: null, rest: list };
  return { matchup: list[index], rest: list.filter((_, i) => i !== index) };
}

// Automatic Court Dispatch. Scans every currently-open, automatic,
// not-reserved court and fills as many as it can from the front of
// nextMatchups, using the exact same selection manual dispatch uses. A
// no-op (courts/nextMatchups/queueIds returned completely unchanged,
// dispatched: []) when `autoFillCourts` is off or no eligible matchup
// exists for a given open court — that court is simply left open; nothing
// is created or regenerated.
//
// Bug fix — this is deliberately an ITERATIVE loop over every open,
// automatic, not-reserved court (not a single pass that only considers the
// first one): each iteration selects and removes the next dispatchable
// matchup, so court 2's dispatch never "sees" the matchup court 1 already
// took. The loop keeps going until either no automatic court remains open,
// or selectNextDispatchableMatchup can't find another eligible matchup
// (insufficient players/none left) — never regenerating or reordering
// anything itself. (The root cause of "only Court 1 gets dispatched" was
// actually one level up, in maxUpcomingMatchups — the queue's depth cap
// was collapsing to 0 the moment even one court became occupied, starving
// this loop of matchups to hand out to the other open courts. That's fixed
// there; this loop was already correctly structured to drain multiple
// matchups per call once given enough of them.)
//
// Each dispatched court is set to "dispatching" — a dedicated court status
// (see constants.js's emptyCourt), never "live" yet — so it stays visible
// as "Calling Players..." until the caller later confirms it (see
// confirmCourtLive below). This function itself is synchronous and has no
// notion of announcements, timers, or Auto Start Match — those are
// entirely the caller's concern (PickleballOpenPlay.jsx); Dispatch's own
// job here is only detect + select + assign.
export function dispatchAvailableCourts({ courts, nextMatchups, queueIds, players, autoFillCourts, isCourtReserved }) {
  if (autoFillCourts === false) {
    return { courts, nextMatchups, queueIds, dispatched: [] };
  }
  let remainingMatchups = nextMatchups || [];
  let remainingIds = queueIds || [];
  const dispatched = [];
  const nextCourts = [...(courts || [])];

  for (let i = 0; i < nextCourts.length; i++) {
    const c = nextCourts[i];
    if (c.status !== "open" || c.assignmentMode === "manual") continue;
    if (isCourtReserved && isCourtReserved(c.number)) continue;

    const { matchup, rest } = selectNextDispatchableMatchup(remainingMatchups, players);
    if (!matchup) continue; // no eligible matchup right now — leave this (and any later) open court alone, try again next save()

    remainingMatchups = rest;
    const consumed = new Set([...matchup.teamA, ...matchup.teamB]);
    remainingIds = remainingIds.filter((id) => !consumed.has(id));
    dispatched.push({
      courtNumber: c.number,
      matchupId: matchup.id,
      teamA: matchup.teamA,
      teamB: matchup.teamB,
      // resolved once, right now, at dispatch time — never reconstructed
      // later, same precedent Sprint 2.1's noteDissolvedHeldMatchups set
      teamANames: matchup.teamA.map((id) => players[id]?.name || "Unknown player"),
      teamBNames: matchup.teamB.map((id) => players[id]?.name || "Unknown player"),
    });
    nextCourts[i] = {
      ...c,
      status: "dispatching",
      teamA: matchup.teamA,
      teamB: matchup.teamB,
      scoreA: 0,
      scoreB: 0,
      dispatchedAt: Date.now(),
    };
  }

  return { courts: nextCourts, nextMatchups: remainingMatchups, queueIds: remainingIds, dispatched };
}

// Confirms a dispatched court is actually starting — flips it from
// "dispatching" to "live". A no-op (same court array reference behavior as
// every other action in this app) if the targeted court isn't currently
// "dispatching" — e.g. it was already started (manually, or by an earlier
// auto-confirm), or reverted by Undo in the meantime.
export function confirmCourtLive(state, courtNumber) {
  const courts = (state.courts || []).map((c) =>
    c.number === courtNumber && c.status === "dispatching" ? { ...c, status: "live" } : c
  );
  return { ...state, courts };
}

// Queue Activity Log helper — appends one entry for a dispatch/
// announcement event, reusing state.queueActivityLog (the exact same log
// Queue Management's noteDissolvedHeldMatchups already writes to — one
// shared, generic log, not a parallel one). Always includes the court
// number and both teams' player names, not just a prose description, per
// Sprint 3's explicit requirement.
export function logDispatchEvent(state, { kind, courtNumber, teamANames, teamBNames, reason }) {
  const entry = {
    id: uid(),
    kind,
    courtNumber,
    teamA: teamANames || [],
    teamB: teamBNames || [],
    reason,
    timestamp: Date.now(),
  };
  const queueActivityLog = [entry, ...(state.queueActivityLog || [])].slice(0, 50);
  return { ...state, queueActivityLog };
}

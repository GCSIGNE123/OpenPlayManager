// Organizer Alerts — see FEATURES.md ("Organizer Alerts (notification
// bell)"). Pure, React-free: computeAlerts(state, now) derives, from the
// session record alone, the list of things the organizer asked to be told
// about. Nothing is stored — the alerts are recomputed on every render /
// 30-second tick, and the bell (components/AlertBell.jsx) only remembers
// which alert ids it has already shown so it can ring once per NEW alert.
//
// The four alerts (organizer direction, 13 Nov 2026):
//   1. longWait      — a player has been waiting 15+ minutes (same
//                      lastMatchEndAt ?? checkedInAt clock WaitingTimer and
//                      the rotation engine use). One alert per player.
//   2. repeatFoursome— an upcoming matchup is the SAME FOUR players as a
//                      match already played this session (any split).
//                      Skipped when the organizer set it deliberately: a
//                      locked or held matchup.
//   3. pairSplit     — a fixed pair is not together in an upcoming matchup
//                      (only one of them is in it, or they are on opposite
//                      teams). Locked / held matchups are skipped the same
//                      way. In a Skill Divisions session only same-division
//                      pairs count (a cross-division pair can never be
//                      teamed — lib/fixedPairRules.js).
//   4. gamesBehind   — a WAITING player has 2+ fewer games than someone who
//                      is on court or already in an upcoming matchup (the
//                      "someone is being left behind" fairness alert).
//
// Every alert has a stable `id` that identifies the SITUATION, not the
// moment: it stays the same while the situation persists (so the bell
// doesn't re-ring every tick) and disappears when it resolves.
import { getPlayerQueueStatus, courtDisplayName } from "./utils.js";
import { QUEUE_STATUSES } from "./constants.js";
import { fixedPairBlockReason } from "./fixedPairRules.js";

export const ALERT_LONG_WAIT_MINUTES = 15;
export const ALERT_GAMES_BEHIND = 2;

export const ALERT_KINDS = {
  longWait: { label: "Long wait", severity: "warn" },
  repeatFoursome: { label: "Same four again", severity: "info" },
  pairSplit: { label: "Fixed pair split", severity: "warn" },
  gamesBehind: { label: "Games behind", severity: "warn" },
};

const sameFour = (a, b) => a.length === 4 && b.length === 4 && [...a].sort().join("|") === [...b].sort().join("|");
const idsOf = (m) => [...(m?.teamA || []), ...(m?.teamB || [])];
const nameOf = (players, id) => players?.[id]?.name || "Player";

export function waitMinutesFor(player, now) {
  const since = player?.lastMatchEndAt ?? player?.checkedInAt ?? null;
  if (since === null || since === undefined) return 0;
  return Math.max(0, Math.floor((now - since) / 60000));
}

export function computeAlerts(state, now = Date.now()) {
  const players = state?.players || {};
  const courts = state?.courts || [];
  const nextMatchups = state?.nextMatchups || [];
  const history = state?.matchHistory || [];
  const alerts = [];

  // Who is where, using the same taxonomy every panel uses.
  const statusOf = {};
  for (const p of Object.values(players)) statusOf[p.id] = getPlayerQueueStatus(p, state);
  const waitingIds = Object.keys(players).filter((id) => statusOf[id] === QUEUE_STATUSES.WAITING || statusOf[id] === QUEUE_STATUSES.UPCOMING);
  const pureWaitingIds = Object.keys(players).filter((id) => statusOf[id] === QUEUE_STATUSES.WAITING);
  const onCourtIds = courts.filter((c) => c.status !== "open").flatMap((c) => idsOf(c).map((id) => ({ id, court: c })));
  const queuedIds = nextMatchups.flatMap((m) => idsOf(m));

  // 1. long wait — every waiting player (incl. one already in an upcoming
  //    matchup: they haven't played yet, and the organizer may still want
  //    to dispatch sooner).
  for (const id of waitingIds) {
    const mins = waitMinutesFor(players[id], now);
    if (mins >= ALERT_LONG_WAIT_MINUTES) {
      alerts.push({
        id: `longWait:${id}`,
        kind: "longWait",
        severity: ALERT_KINDS.longWait.severity,
        title: `${nameOf(players, id)} has waited ${mins} min`,
        detail: statusOf[id] === QUEUE_STATUSES.UPCOMING ? "Already in an upcoming matchup — dispatch it when a court frees up." : "Not yet in an upcoming matchup.",
        playerIds: [id],
        minutes: mins,
      });
    }
  }

  // 2. same four again — organizer-set (locked / held) matchups are skipped.
  for (const m of nextMatchups) {
    if (m.locked || m.held) continue;
    const ids = idsOf(m);
    if (ids.length !== 4) continue;
    const earlier = history.filter((h) => sameFour(idsOf(h), ids));
    if (earlier.length === 0) continue;
    const last = earlier[earlier.length - 1];
    alerts.push({
      id: `repeatFoursome:${m.id}`,
      kind: "repeatFoursome",
      severity: ALERT_KINDS.repeatFoursome.severity,
      title: `Same four players queued again: ${ids.map((id) => nameOf(players, id)).join(", ")}`,
      detail: `They already played together${last?.round ? ` in round ${last.round}` : ""}${earlier.length > 1 ? ` (${earlier.length} times)` : ""}. Regenerate or substitute if you want a fresh mix.`,
      playerIds: ids,
      matchupId: m.id,
    });
  }

  // 3. fixed pair split in an upcoming matchup.
  const seenPairs = new Set();
  for (const p of Object.values(players)) {
    const q = p.partnerId ? players[p.partnerId] : null;
    if (!q || q.partnerId !== p.id) continue;
    const key = [p.id, q.id].sort().join("|");
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    if (fixedPairBlockReason(state, p, q)) continue; // cross-division pair can never be teamed — not a queue problem
    for (const m of nextMatchups) {
      if (m.locked || m.held) continue;
      const inA = (id) => (m.teamA || []).includes(id);
      const inB = (id) => (m.teamB || []).includes(id);
      const pIn = inA(p.id) || inB(p.id);
      const qIn = inA(q.id) || inB(q.id);
      if (!pIn && !qIn) continue;
      const together = (inA(p.id) && inA(q.id)) || (inB(p.id) && inB(q.id));
      if (together) continue;
      const opposite = pIn && qIn;
      alerts.push({
        id: `pairSplit:${m.id}:${key}`,
        kind: "pairSplit",
        severity: ALERT_KINDS.pairSplit.severity,
        title: `Fixed pair ${p.name} & ${q.name} not together in an upcoming matchup`,
        detail: opposite ? "They are on opposite teams." : `${pIn ? p.name : q.name} is queued without ${pIn ? q.name : p.name}.`,
        playerIds: [p.id, q.id],
        matchupId: m.id,
      });
    }
  }

  // 4. a waiting player is 2+ games behind someone on court / already queued.
  const ahead = [
    ...onCourtIds.map(({ id, court }) => ({ id, where: `on ${courtDisplayName(court)}` })),
    ...queuedIds.map((id) => ({ id, where: "in an upcoming matchup" })),
  ];
  for (const id of pureWaitingIds) {
    const games = players[id]?.games || 0;
    const most = ahead.filter((a) => a.id !== id).reduce((best, a) => ((players[a.id]?.games || 0) > (players[best?.id]?.games || -1) ? a : best), null);
    if (!most) continue;
    const gap = (players[most.id]?.games || 0) - games;
    if (gap >= ALERT_GAMES_BEHIND) {
      alerts.push({
        id: `gamesBehind:${id}:${games}`,
        kind: "gamesBehind",
        severity: ALERT_KINDS.gamesBehind.severity,
        title: `${nameOf(players, id)} is ${gap} games behind (${games} vs ${players[most.id].games})`,
        detail: `${nameOf(players, most.id)} is ${most.where} with ${players[most.id].games} games while ${nameOf(players, id)} waits with ${games}.`,
        playerIds: [id, most.id],
        gap,
      });
    }
  }

  // warn before info, then longest wait / biggest gap first, then title
  const sev = { warn: 0, info: 1 };
  return alerts.sort((a, b) => sev[a.severity] - sev[b.severity] || (b.minutes || b.gap || 0) - (a.minutes || a.gap || 0) || a.title.localeCompare(b.title));
}

// Which of `alerts` the bell hasn't shown yet (by id).
export function unseenAlerts(alerts, seenIds) {
  const seen = new Set(seenIds || []);
  return (alerts || []).filter((a) => !seen.has(a.id));
}

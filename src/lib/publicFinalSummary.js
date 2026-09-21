// Public Final Summary — the compact, PUBLIC-ONLY record a fresh
// https://picklekingplayer.vercel.app/live/{sessionCode} load reads AFTER a
// session (Open Play or Tournament) has ended, so the public viewer can still
// show the final results without scanning session reports (the saved report is
// keyed by a random id, and scanning reports would break the egress rules).
//
// STORAGE — a small dedicated row, one per ended session, keyed by the
// session code: `opl-public-final-{sessionCode}` (PUBLIC_FINAL_PREFIX). It is
// deliberately NOT a field on the session-index record: Player's Open Play
// discovery (liveSessionApi.js fetchAllLiveSessions, Phase 1) reads EVERY
// opl-session-index-* row's full value on every call, so any bulk added to the
// index would be re-downloaded by every player, for every ended session, on
// every discovery — exactly the egress regression the index exists to avoid.
// A separate exact-key row is read only by someone opening that one ended
// session's /live link (one exact-key read), and is invisible to every prefix
// scan (its prefix does not start with opl-session-).
//
// PRIVACY — only what a spectator may see: display names, W/L/diff, team
// labels, scores, stage, champion. Never player ids / Player Database ids /
// auth ids, photos, payment fields, skill labels, ratings, partner links,
// queue/dispatch logs or any admin field. The builders below construct the
// summary from scratch (an allow-list), never by copying a session/player
// object.
import { PUBLIC_FINAL_PREFIX } from "./constants.js";
import { buildStandingsRows } from "./performanceRating.js";
import { RoundRobinStandingsService } from "../engines/RoundRobinStandingsService.js";
import { fetchTournament } from "./tournamentModel.js";

export const PUBLIC_FINAL_VERSION = 1;
export const MAX_OPEN_PLAY_STANDINGS = 30;
export const MAX_POOL_STANDINGS_ROWS = 32;
export const MAX_SUMMARY_BYTES = 40 * 1024; // hard ceiling; a bracket is dropped before a summary this big is written

const standingsService = new RoundRobinStandingsService();
const arr = (x) => (Array.isArray(x) ? x : []);
const labelOf = (x) => (typeof x === "string" ? x : x?.label ?? null);

export function buildOpenPlayFinalSummary(state, { sessionCode = null, endedAt = Date.now() } = {}) {
  const players = state?.players || {};
  const standings = buildStandingsRows(players)
    .slice(0, MAX_OPEN_PLAY_STANDINGS)
    .map((r, i) => ({ rank: i + 1, name: r.name, wins: r.wins, losses: r.losses, diff: r.diff }));
  return {
    v: PUBLIC_FINAL_VERSION,
    kind: "openPlay",
    sessionCode,
    name: (state?.venue || "").trim() || "Open Play",
    endedAt,
    playerCount: Object.values(players).filter((p) => p.checkedIn).length,
    matchCount: arr(state?.matchHistory).length,
    standings,
  };
}

// ---- tournament (mirrors the public viewer's own derivation) ----
const teamLine = (team) => (team ? { label: team.label || "TBD", seed: team.seed ?? null } : null);
function winnerSide(m) {
  if (m?.winner == null) return null;
  const a = m.teamA && (m.teamA.id ?? m.teamA.participantId);
  const b = m.teamB && (m.teamB.id ?? m.teamB.participantId);
  return m.winner === a ? "A" : m.winner === b ? "B" : null;
}
function bracketMatch(m) {
  return { a: teamLine(m.teamA), b: teamLine(m.teamB), status: m.status || "pending", winner: winnerSide(m), scoreA: m.score?.teamA ?? 0, scoreB: m.score?.teamB ?? 0 };
}
const roundView = (r) => ({ name: r.name, matches: arr(r.matches).filter((m) => !m.isBye).map(bracketMatch) });

export function summarizeBracket(t) {
  const de = t?.doubleEliminationBracket;
  if (de) {
    const gf = de.grandFinal || {};
    return {
      kind: "double",
      winners: arr(de.winnersBracket?.rounds).map(roundView),
      losers: arr(de.losersBracket?.rounds).map(roundView),
      grandFinal: [gf.game1, gf.game2].filter(Boolean).map(bracketMatch),
      champion: labelOf(gf.champion),
      runnerUp: labelOf(gf.runnerUp),
      complete: gf.status === "completed" || Boolean(gf.champion),
    };
  }
  if (t?.bracket) {
    const b = t.bracket;
    return {
      kind: "single",
      rounds: arr(b.rounds).map(roundView),
      bronze: b.bronzeMatch ? bracketMatch(b.bronzeMatch) : null,
      champion: labelOf(b.champion),
      runnerUp: labelOf(b.runnerUp),
      complete: b.status === "completed",
    };
  }
  return null;
}

export function tournamentStage(t) {
  if (t?.doubleEliminationBracket && t.format === "doubleElimination") {
    const gf = t.doubleEliminationBracket.grandFinal;
    return gf?.status === "completed" || gf?.champion ? "Champion Crowned" : "Double Elimination";
  }
  if (!t?.bracket && !t?.doubleEliminationBracket) return t?.status === "completed" ? "Pool Play Complete" : "Pool Play";
  const b = summarizeBracket(t);
  if (b?.complete) return "Champion Crowned";
  if (b?.kind === "single") {
    const active = b.rounds.find((r) => r.matches.some((m) => m.status !== "completed"));
    return `Playoffs — ${active?.name ?? b.rounds[0]?.name ?? ""}`.trim();
  }
  return "Playoffs — Double Elimination";
}

function progressOf(t) {
  const matches = [];
  for (const pool of arr(t?.pools)) for (const round of arr(pool.rounds)) for (const m of arr(round.matches)) if (!m.isBye) matches.push(m);
  const seated = (m) => m.teamA || m.teamB;
  for (const round of arr(t?.bracket?.rounds)) for (const m of arr(round.matches)) if (seated(m)) matches.push(m);
  if (t?.bracket?.bronzeMatch && seated(t.bracket.bronzeMatch)) matches.push(t.bracket.bronzeMatch);
  const de = t?.doubleEliminationBracket;
  if (de) {
    for (const round of arr(de.winnersBracket?.rounds)) for (const m of arr(round.matches)) if (!m.isBye && seated(m)) matches.push(m);
    for (const round of arr(de.losersBracket?.rounds)) for (const m of arr(round.matches)) if (!m.isBye && seated(m)) matches.push(m);
    if (de.grandFinal?.game1 && seated(de.grandFinal.game1)) matches.push(de.grandFinal.game1);
    if (de.grandFinal?.game2 && seated(de.grandFinal.game2)) matches.push(de.grandFinal.game2);
  }
  return { completed: matches.filter((m) => m.status === "completed").length, total: matches.length };
}

export function buildTournamentFinalSummary(state, tournament, { sessionCode = null, endedAt = Date.now() } = {}) {
  if (!tournament) return null;
  const bracket = summarizeBracket(tournament);
  const standings = arr(tournament.pools).map((pool) => ({
    label: pool.label,
    rows: standingsService.updateAfterMatch(pool).slice(0, MAX_POOL_STANDINGS_ROWS).map((r) => ({ rank: r.rank, label: r.label, wins: r.wins, losses: r.losses, pointDiff: r.pointDiff })),
  }));
  const complete = bracket ? bracket.complete : tournament.status === "completed";
  const summary = {
    v: PUBLIC_FINAL_VERSION,
    kind: "tournament",
    sessionCode,
    name: tournament.name || "Tournament",
    eventName: (state?.venue || "").trim() || null,
    mode: tournament.mode === "doubles" ? "Doubles" : tournament.mode === "singles" ? "Singles" : null,
    endedAt,
    stage: tournamentStage(tournament),
    complete,
    champion: bracket?.complete ? bracket.champion : null,
    runnerUp: bracket?.complete ? bracket.runnerUp : null,
    progress: progressOf(tournament),
    standings,
    bracket,
  };
  // size guard: a pathological bracket is trimmed to its result before the summary is refused
  if (JSON.stringify(summary).length > MAX_SUMMARY_BYTES && summary.bracket) {
    summary.bracket = { kind: summary.bracket.kind, champion: summary.bracket.champion, runnerUp: summary.bracket.runnerUp, complete: summary.bracket.complete, rounds: [], winners: [], losers: [], grandFinal: [], bronze: null };
  }
  return summary;
}

export function buildPublicFinalSummary(state, tournament = null, opts = {}) {
  if (!state || typeof state !== "object") return null;
  if (state.sessionType === "tournament") return buildTournamentFinalSummary(state, tournament, opts);
  return buildOpenPlayFinalSummary(state, opts);
}

// Best-effort, NEVER throws, never blocks ending a session: called while the
// live state is still in hand (before the live row is deleted). A tournament
// session needs its tournament record — ONE exact-key read at end time.
export async function recordPublicFinalSummary(sessionCode, liveState, { endedAt = Date.now() } = {}) {
  try {
    if (!sessionCode || !liveState) return null;
    const tournament = liveState.sessionType === "tournament" ? await fetchTournament(liveState.tournamentId) : null;
    const summary = buildPublicFinalSummary(liveState, tournament, { sessionCode, endedAt });
    if (!summary) return null;
    const json = JSON.stringify(summary);
    if (json.length > MAX_SUMMARY_BYTES) return null;
    await window.storage.set(`${PUBLIC_FINAL_PREFIX}${sessionCode}`, json, true);
    return summary;
  } catch (e) {
    return null;
  }
}

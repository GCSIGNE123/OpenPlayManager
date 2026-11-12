// Running Podium — see FEATURES.md ("Running Podium"). Pure, React-free,
// UI-agnostic: the ONE place "who is champion / runner-up / third right
// now" is decided, so the Live Board, TV Mode, the Standings tab, the
// Session Analytics report and the public final summary can never
// disagree with each other or with the Standings table.
//
// Rules (organizer direction, Nov 2026):
//   - UNLOCK BY TIME, not by games: the podium appears once the session has
//     been running `podiumUnlockMinutes` (default 60) measured from
//     sessionStartedAt. Before that the UI shows a "unlocks at 60 min — N
//     min to go" motivator instead. A games-based unlock was rejected
//     because players who go home early would block it forever.
//   - ORDER = the Standings table: buildStandingsRows (rating -> wins ->
//     point differential -> name), reused verbatim — never a second ranking.
//   - MIN GAMES guard: a player needs `podiumMinGames` (default 2) completed
//     games to stand on the podium, so a 1-0 latecomer at the 60-minute
//     mark can't show as running champion over people with five games.
//   - EARLY LEAVERS stay: a checked-out player keeps their place (tagged
//     `out` for the UI) — going home early never erases a 5-0.
//   - FINAL: finalPodium() is the same computation with the time gate
//     forced open, taken once at End Session for the saved report and the
//     public final summary.
import { buildStandingsRows } from "./performanceRating.js";

export const DEFAULT_PODIUM_UNLOCK_MINUTES = 60;
export const DEFAULT_PODIUM_MIN_GAMES = 2;

export const PODIUM_PLACES = [
  { rank: 1, label: "Champion", short: "1st" },
  { rank: 2, label: "Runner-up", short: "2nd" },
  { rank: 3, label: "3rd Place", short: "3rd" },
];

const positiveIntOr = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
};

// Session settings with safe fallbacks (a session saved before these fields
// existed simply gets the defaults — never NaN, never 0).
export function podiumSettings(state) {
  return {
    unlockMinutes: positiveIntOr(state?.podiumUnlockMinutes, DEFAULT_PODIUM_UNLOCK_MINUTES),
    minGames: positiveIntOr(state?.podiumMinGames, DEFAULT_PODIUM_MIN_GAMES),
  };
}

export function isCheckedOut(player) {
  return player?.status === "CHECKED_OUT";
}

function placesFrom(rows, minGames) {
  return rows
    .filter((r) => (r.gp || 0) >= minGames)
    .slice(0, PODIUM_PLACES.length)
    .map((r, i) => ({
      rank: PODIUM_PLACES[i].rank,
      label: PODIUM_PLACES[i].label,
      playerId: r.id,
      name: r.name,
      photo: r.photo || null,
      wins: r.wins,
      losses: r.losses,
      games: r.gp,
      winPct: r.performance.winPct,
      diff: r.diff,
      rating: r.performance.rating,
      out: isCheckedOut(r),
    }));
}

// The live view. `now` is injectable so the UI's minute ticker and the
// verify scripts can drive it deterministically.
export function computePodium(state, now = Date.now()) {
  const { unlockMinutes, minGames } = podiumSettings(state);
  const startedAt = typeof state?.sessionStartedAt === "number" ? state.sessionStartedAt : null;
  const elapsedMinutes = startedAt ? Math.max(0, (now - startedAt) / 60000) : 0;
  const unlocked = startedAt !== null && elapsedMinutes >= unlockMinutes;
  const rows = buildStandingsRows(state?.players || {});
  const places = placesFrom(rows, minGames);
  return {
    final: false,
    unlocked,
    unlockMinutes,
    minGames,
    elapsedMinutes: Math.floor(elapsedMinutes),
    minutesToGo: startedAt === null ? unlockMinutes : Math.max(0, Math.ceil(unlockMinutes - elapsedMinutes)),
    places,
    eligibleCount: rows.filter((r) => (r.gp || 0) >= minGames).length,
  };
}

// End-of-session snapshot: same ranking, same min-games guard, time gate
// forced open. Returned places carry no photos (the report and the public
// summary must stay small and photo-free — see publicFinalSummary.js's
// privacy allow-list).
export function finalPodium(state) {
  const { minGames } = podiumSettings(state);
  const rows = buildStandingsRows(state?.players || {});
  return placesFrom(rows, minGames).map(({ photo, ...place }) => place);
}

// Public allow-list for the spectator-facing final summary: display name
// and results only — never player ids, Player Database ids, photos,
// ratings, skill or payment fields.
export function publicPodium(places) {
  return (places || []).map((p) => ({
    rank: p.rank,
    label: p.label,
    name: p.name,
    wins: p.wins,
    losses: p.losses,
    games: p.games,
    winPct: Math.round((p.winPct || 0) * 100) / 100,
    out: Boolean(p.out),
  }));
}

// One-line status copy shared by every surface, so the wording is identical
// on the Live Board, Standings, TV Mode and the spectator page.
export function podiumStatusText(podium) {
  if (!podium) return "";
  if (podium.final) return "Final podium";
  if (!podium.unlocked) {
    return podium.minutesToGo <= 1
      ? `Running podium unlocks any minute now (at ${podium.unlockMinutes} min of play).`
      : `Running podium unlocks at ${podium.unlockMinutes} min of play — ${podium.minutesToGo} min to go.`;
  }
  if (podium.places.length === 0) {
    return `Running podium — no one has ${podium.minGames}+ completed games yet.`;
  }
  return `Running podium — updates after every result (${podium.minGames}+ games to qualify).`;
}

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
//   - DIVISION PODIUMS (organizer direction, 13 Nov 2026): in a Skill
//     Divisions session there is one podium PER DIVISION — a Beginner
//     champion / runner-up / 3rd and an Intermediate champion / runner-up /
//     3rd — replacing the single overall podium (comparing a beginner's
//     record with an intermediate's isn't meaningful when they never meet
//     on court). Same unlock, same min-games guard, same ordering, applied
//     to each division's rows. A player stands in the division they are in
//     NOW (a mid-session promotion carries their record with them). Every
//     other rotation mode keeps the single podium. computePodiums /
//     finalPodiums return the list of podiums a surface should show;
//     computePodium / finalPodium remain the single-podium primitives.
import { buildStandingsRows, standingsOrderFor } from "./performanceRating.js";
import { DIVISIONS, divisionOf, divisionLabel, sessionHasDivisions } from "./divisions.js";

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

// One podium per division in Skill Divisions sessions, otherwise one.
export const podiumIsDivided = (state) => sessionHasDivisions(state);

// ORGANIZERS ARE NOT PODIUM-ELIGIBLE (organizer direction, 13 Nov 2026): a
// player marked "Organizer" in the Payment tab (paymentStatus "paid" +
// paymentMethod "organizer" — lib/queueManagement.js's setPlayerPayment) is
// left off every podium, Beginner, Intermediate and the single overall one,
// live and final. They still play, still appear in the Standings table with
// their real record, and the next eligible player takes the place. Unmarking
// them in the Payment tab makes them eligible again immediately.
export const isOrganizerPlayer = (player) => player?.paymentStatus === "paid" && player?.paymentMethod === "organizer";

const rowsFor = (state, division) => {
  const players = state?.players || {};
  // standingsOrderFor: Roulette sessions rank by win percentage, so their
  // podium does too — the podium is always the top of the Standings table.
  const rows = buildStandingsRows(players, { order: standingsOrderFor(state) }).filter((r) => !isOrganizerPlayer(players[r.id]));
  if (!division) return rows;
  return rows.filter((r) => divisionOf(players[r.id] || r) === division);
};

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
// verify scripts can drive it deterministically. `division` (optional,
// "beginner" | "intermediate") restricts the ranking to that division's
// players — the podium then carries `division` / `divisionLabel` so the UI
// can title it.
export function computePodium(state, now = Date.now(), { division = null } = {}) {
  const { unlockMinutes, minGames } = podiumSettings(state);
  const startedAt = typeof state?.sessionStartedAt === "number" ? state.sessionStartedAt : null;
  const elapsedMinutes = startedAt ? Math.max(0, (now - startedAt) / 60000) : 0;
  // Roulette: once every round has been played the standings are final, so
  // the podium opens (and reads "Final Podium") without waiting for the
  // time gate. Read straight off the record to keep this module free of a
  // lib/roulette.js import.
  const rouletteComplete = state?.rotationMode === "roulette" && state?.roulette?.phase === "complete";
  const unlocked = rouletteComplete || (startedAt !== null && elapsedMinutes >= unlockMinutes);
  const rows = rowsFor(state, division);
  const places = placesFrom(rows, minGames);
  return {
    final: rouletteComplete,
    division,
    divisionLabel: division ? divisionLabel(division) : null,
    unlocked,
    unlockMinutes,
    minGames,
    elapsedMinutes: Math.floor(elapsedMinutes),
    minutesToGo: startedAt === null ? unlockMinutes : Math.max(0, Math.ceil(unlockMinutes - elapsedMinutes)),
    places,
    eligibleCount: rows.filter((r) => (r.gp || 0) >= minGames).length,
  };
}

// What a live surface shows: [Beginner podium, Intermediate podium] in a
// Skill Divisions session, [the single podium] otherwise. The unlock
// countdown is shared, so a surface renders the locked banner once.
export function computePodiums(state, now = Date.now()) {
  if (!podiumIsDivided(state)) return [computePodium(state, now)];
  return DIVISIONS.map((d) => computePodium(state, now, { division: d.key }));
}

// End-of-session snapshot: same ranking, same min-games guard, time gate
// forced open. Returned places carry no photos (the report and the public
// summary must stay small and photo-free — see publicFinalSummary.js's
// privacy allow-list).
export function finalPodium(state, { division = null } = {}) {
  const { minGames } = podiumSettings(state);
  return placesFrom(rowsFor(state, division), minGames).map(({ photo, ...place }) => place);
}

// The saved-report / public-summary shape: one group per podium —
// [{ division: "beginner", label: "Beginner", places }, { division:
// "intermediate", ... }] in a Skill Divisions session, [{ division: null,
// label: null, places }] otherwise.
export function finalPodiums(state) {
  if (!podiumIsDivided(state)) return [{ division: null, label: null, places: finalPodium(state) }];
  return DIVISIONS.map((d) => ({ division: d.key, label: d.label, places: finalPodium(state, { division: d.key }) }));
}

// playerId -> podium rank (1..3) across every podium a surface shows, so a
// standings table can put the medal on the same people the podium(s) show
// — with division podiums, a Beginner champion wears gold even when an
// Intermediate sits above them in the overall table.
export function podiumMedalRanks(podiums) {
  const ranks = {};
  for (const podium of podiums || []) {
    for (const place of podium?.places || []) {
      if (place.playerId) ranks[place.playerId] = place.rank;
    }
  }
  return ranks;
}

// Turns a saved group list (finalPodiums) back into the panel shape
// PodiumPanel / PodiumBoard render. Also accepts the pre-division report
// field (a bare places array) so reports saved earlier still render.
export function finalPodiumsForDisplay(groupsOrPlaces) {
  if (!groupsOrPlaces || groupsOrPlaces.length === 0) return [];
  const groups = Array.isArray(groupsOrPlaces[0]?.places) ? groupsOrPlaces : [{ division: null, label: null, places: groupsOrPlaces }];
  return groups.map((g) => ({
    final: true,
    unlocked: true,
    division: g.division || null,
    divisionLabel: g.division ? g.label || divisionLabel(g.division) : null,
    places: g.places || [],
  }));
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

// Division podiums for the public summary. The division name is the one
// deliberate addition to the spectator allow-list (organizer direction:
// champions are declared per category, so the public page shows the
// Beginner and Intermediate podiums by name) — still no ids, photos,
// ratings or payment fields, and nothing about players who are not on a
// podium.
export function publicPodiums(groups) {
  return (groups || []).map((g) => ({
    division: g.division || null,
    label: g.division ? g.label || divisionLabel(g.division) : null,
    places: publicPodium(g.places),
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
    return podium.divisionLabel
      ? `No ${podium.divisionLabel} player has ${podium.minGames}+ completed games yet.`
      : `Running podium — no one has ${podium.minGames}+ completed games yet.`;
  }
  return `Running podium — updates after every result (${podium.minGames}+ games to qualify).`;
}

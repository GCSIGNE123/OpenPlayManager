// League Management data model + storage — see PROJECT.md's League
// Management section.
//
// The central reuse decision: a LeagueSeason is built via the EXISTING
// makeTournament() factory (format: "league", playoffEnabled: false so
// RoundRobinEngine's bracket auto-generation step never fires — playoffs
// are explicitly out of scope for this task, not just left unbuilt) with a
// few league-only fields layered on (leagueId, season, startDate, endDate,
// matchDay, matchTime). Each division is a TournamentPool, reused as-is —
// a division's entrants/schedule/standings work exactly like a Tournament
// pool's already do, since RoundRobinStandingsService/RoundRobinEngine/
// CourtAssignmentService only ever read `.entrants`/`.rounds`/`.pools`,
// never a format discriminant. Stored under its own prefix
// (opl-league-season-, not opl-tournament-) so League Seasons don't show
// up in the Tournament Manager's own list, but internally duck-typing as a
// Tournament is what lets this entire feature reuse the scheduling/scoring
// engines instead of reimplementing them.
import { uid } from "./random.js";
import { LEAGUE_PREFIX, LEAGUE_SEASON_PREFIX } from "./constants.js";
import { makeTournament, makeCourt, computeRoundStatus } from "./tournamentModel.js";
import { defaultEligibilityRequirements } from "../engines/TournamentSettings.js";

// League = { id, name, clubId, venueId, createdAt, updatedAt } — a
// recurring club-level container; a single League can run many
// LeagueSeasons over time (e.g. "Tuesday Night League" → Fall 2026,
// Winter 2027, ...). `clubId` predates the Venue entity and has never
// been wired to anything real; `venueId` (Phase 0: Multi-Tenant
// Foundation, see lib/venueModel.js) is the new, real ownership hook —
// both are kept, nullable, architecture-only.
export function makeLeague({ name, clubId = null, venueId = null }) {
  const now = Date.now();
  return { id: uid(), name: name.trim(), clubId, venueId, createdAt: now, updatedAt: now };
}

export async function fetchAllLeagues() {
  const { keys } = await window.storage.list(LEAGUE_PREFIX, true);
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

export async function saveLeague(league) {
  const stamped = { ...league, updatedAt: Date.now() };
  await window.storage.set(`${LEAGUE_PREFIX}${league.id}`, JSON.stringify(stamped), true);
  return stamped;
}

// LeagueWeek — exactly a TournamentRound (roundNumber/status/courtAssignments/
// matches, via lib/tournamentModel.js's makeRound) plus one added field,
// matchDate. Kept as a genuinely distinct factory (not just calling
// makeRound directly) so the League-specific concept has its own name and
// doc comment, per the spec's architecture list — the shape underneath is
// deliberately identical so computeRoundStatus/computePoolStatus/findMatch
// (all format-agnostic already) work on it with zero changes.
export function makeLeagueWeek(roundNumber, matches, matchDate) {
  return {
    roundNumber,
    weekNumber: roundNumber, // same value, alias so League UI code can say "week" without renaming the field computeRoundStatus/findMatch key off
    matchDate,
    status: computeRoundStatus(matches),
    courtAssignments: matches.filter((m) => !m.isBye).map((m) => m.court),
    matches,
  };
}

// LeagueMatch — a documented alias of makeMatch (lib/tournamentModel.js),
// the same "same shape, different domain name" precedent makeEntrant
// already is for makeParticipant. There is no separate League match shape
// — reusing the Tournament one exactly is what lets match start/score
// entry/court assignment all reuse their existing services unmodified.
export { makeMatch as makeLeagueMatch } from "./tournamentModel.js";

// Maps a weekday name ("Tuesday") + a season start date to the actual
// calendar date of week N — the first occurrence of that weekday on or
// after startDate, then +7 days per additional week. Pure function, no
// storage; used once per week when a season's schedule is generated.
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function computeWeekDate(startDate, matchDay, weekNumber) {
  const targetDow = WEEKDAYS.indexOf(matchDay);
  const start = new Date(startDate);
  const startDow = start.getDay();
  const daysUntilFirst = (targetDow - startDow + 7) % 7;
  const first = new Date(start);
  first.setDate(first.getDate() + daysUntilFirst);
  const target = new Date(first);
  target.setDate(target.getDate() + (weekNumber - 1) * 7);
  return target.getTime();
}

// LeagueSeason = a Tournament-shaped record (see file header) plus:
//   leagueId, season (free label, e.g. "Fall 2026"), startDate, endDate
//   (ms epoch), matchDay ('Sunday'..'Saturday'), matchTime (free string,
//   e.g. "6:00 PM") — display-only, nothing computes with it.
// `pools` here are the season's divisions — see buildAndSaveLeagueSeason
// in lib/league.js for how they're built (one TournamentPool per
// division, its `rounds` actually being LeagueWeeks).
export function makeLeagueSeason({
  leagueId,
  name,
  season,
  startDate,
  endDate,
  matchDay,
  matchTime,
  courtsCount,
  mode,
  pools,
  eligibilityRequirements = null,
}) {
  const tournament = makeTournament({
    name,
    format: "league",
    mode,
    courtsCount,
    poolCount: pools.length,
    assignmentMethod: "random",
    pools,
    playoffEnabled: false, // playoffs are explicitly out of scope for League Management
  });
  return {
    ...tournament,
    leagueId,
    season,
    startDate,
    endDate,
    matchDay,
    matchTime,
    // Membership Management's eligibility hook — see PROJECT.md. Same
    // captured shape TournamentSettings.defaultEligibilityRequirements
    // defines; League Manager's division player picker is where this task
    // actually enforces it live (Tournament Manager only captures it).
    eligibilityRequirements: eligibilityRequirements ?? defaultEligibilityRequirements(),
  };
}

export async function saveLeagueSeason(season) {
  const stamped = { ...season, updatedAt: Date.now() };
  await window.storage.set(`${LEAGUE_SEASON_PREFIX}${season.id}`, JSON.stringify(stamped), true);
  return stamped;
}

export async function fetchLeagueSeason(id) {
  if (!id) return null;
  try {
    const res = await window.storage.get(`${LEAGUE_SEASON_PREFIX}${id}`, true);
    return JSON.parse(res.value);
  } catch (e) {
    return null;
  }
}

export async function fetchSeasonsForLeague(leagueId) {
  const { keys } = await window.storage.list(LEAGUE_SEASON_PREFIX, true);
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
  return records.filter((s) => s && s.leagueId === leagueId);
}

export { makeCourt };

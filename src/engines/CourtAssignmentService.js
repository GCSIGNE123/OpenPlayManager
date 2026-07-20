// Live court management + match queue for a running tournament — see
// PROJECT.md's Tournament Court Assignment & Match Queue section.
//
// Deliberately a single concrete class, not a Strategy-pattern hierarchy
// like TournamentStandingsService/QualificationService/BracketGeneratorService
// — the spec asks for one reusable service, not per-format implementations.
// It's generic by construction instead: getPlayableMatches walks
// tournament.pools (if present) and tournament.bracket (if present),
// wherever a format happens to keep its matches. That already covers Round
// Robin and Round Robin + Playoffs; a future standalone Single/Double
// Elimination format would naturally reuse the same bracket-shaped record
// PlayoffEngine already works with, so this walk covers those too without
// changes here later.
//
// Court occupancy is derived, not a separately persisted field — a court is
// "occupied" exactly when some non-completed match has
// `match.court === court.number`. This is the same "pure derived data"
// pattern Standings/Qualification/the bracket preview already use, and it's
// what makes "free the court when a match finishes" and "refresh the Court
// Board automatically" require zero new code: freeing happens as a side
// effect of RoundRobinEngine/PlayoffEngine's existing status transitions,
// and the board is just recomputed fresh from current tournament state.
// Exported for the Court Assignment & Match Queue Engine's other services
// (CourtPriorityService/CourtQueueService) — reused rather than duplicated a
// fourth time (TournamentReportService and PlayerPortalService each already
// keep their own private copy of this exact walk, for reasons specific to
// those older tasks; this one's a genuine sibling of CourtAssignmentService
// itself, so it shares this module's copy directly instead).
export function collectMatches(tournament) {
  const matches = [];
  for (const pool of tournament.pools || []) {
    for (const round of pool.rounds) {
      for (const match of round.matches) {
        if (!match.isBye) matches.push({ match, source: "pool", sourceLabel: pool.label });
      }
    }
  }
  if (tournament.bracket) {
    for (const round of tournament.bracket.rounds) {
      for (const match of round.matches) {
        matches.push({ match, source: "bracket", sourceLabel: round.name });
      }
    }
    // Bronze Medal Match — a sibling field, not a round inside
    // tournament.bracket.rounds (see PlayoffBracketGenerator's header
    // comment for why), so it needs its own explicit inclusion here for
    // court assignment/queue/occupancy to see it at all.
    if (tournament.bracket.bronzeMatch) {
      matches.push({ match: tournament.bracket.bronzeMatch, source: "bracket", sourceLabel: "Bronze Medal Match" });
    }
  }
  // Consolation & Placement Brackets — a sibling of tournament.bracket, same
  // rounds/bronzeMatch shape, so it walks identically — just its own
  // sourceLabel so the Court Board/queue can tell the two apart.
  if (tournament.consolationBracket) {
    for (const round of tournament.consolationBracket.rounds) {
      for (const match of round.matches) {
        matches.push({ match, source: "consolationBracket", sourceLabel: round.name });
      }
    }
    if (tournament.consolationBracket.bronzeMatch) {
      matches.push({ match: tournament.consolationBracket.bronzeMatch, source: "consolationBracket", sourceLabel: "7th Place Match" });
    }
  }
  return matches;
}

function findMatchEntry(tournament, matchId) {
  return collectMatches(tournament).find((entry) => entry.match.id === matchId) || null;
}

// A court is occupied when some non-completed match already claims its
// number — "non-completed" (not just "inProgress") so a court an organizer
// assigned but hasn't hit Start Match on yet still reads as occupied,
// rather than falsely available for a second match.
function isCourtOccupied(tournament, courtNumber) {
  return collectMatches(tournament).some((entry) => entry.match.court === courtNumber && entry.match.status !== "completed");
}

function currentMatchForCourt(tournament, courtNumber) {
  return collectMatches(tournament).find((entry) => entry.match.court === courtNumber && entry.match.status !== "completed")?.match ?? null;
}

// Writes `updater(match)` onto whichever pool/bracket match has this id,
// returning a new Tournament (never mutates the one passed in). A tiny,
// self-contained find-and-replace — CourtAssignmentService only ever needs
// to flip `court`/`status`, never validate scores or advance winners (that
// stays RoundRobinEngine/PlayoffEngine's job), so it doesn't reach into
// their internals for this.
function updateMatchIn(tournament, matchId, updater) {
  const pools = (tournament.pools || []).map((pool) => ({
    ...pool,
    rounds: pool.rounds.map((round) => ({
      ...round,
      matches: round.matches.map((m) => (m.id === matchId ? updater(m) : m)),
    })),
  }));
  const updateBracketRecord = (bracket) =>
    bracket
      ? {
          ...bracket,
          rounds: bracket.rounds.map((round) => ({
            ...round,
            matches: round.matches.map((m) => (m.id === matchId ? updater(m) : m)),
          })),
          bronzeMatch: bracket.bronzeMatch && bracket.bronzeMatch.id === matchId ? updater(bracket.bronzeMatch) : bracket.bronzeMatch,
        }
      : bracket;
  const bracket = updateBracketRecord(tournament.bracket);
  const consolationBracket = updateBracketRecord(tournament.consolationBracket);
  return { ...tournament, pools, bracket, consolationBracket };
}

export class CourtAssignmentService {
  // returns: Court[] — not in maintenance/disabled, and not currently occupied
  getAvailableCourts(tournament) {
    return (tournament.courts || []).filter(
      (c) => c.status !== "maintenance" && c.status !== "disabled" && !isCourtOccupied(tournament, c.number)
    );
  }

  // returns: { match, source: "pool"|"bracket", sourceLabel }[] — every
  // match that's pending, has both participants known, and hasn't been
  // assigned a court yet. A bracket match's teams stay null until
  // PlayoffEngine.advanceWinner fills them in, so "feeder matches complete"
  // is already satisfied by that existing null-until-advanced design —
  // there's nothing extra to check here for it.
  getPlayableMatches(tournament) {
    return collectMatches(tournament).filter(
      (entry) => entry.match.status === "pending" && entry.match.teamA && entry.match.teamB && entry.match.court === null
    );
  }

  // Sets match.court — does not change match status. Assigning a court and
  // starting a match stay independent actions; the existing Start Match
  // flow on the Schedule/Bracket tabs still works exactly as before,
  // whether or not a court's been assigned first.
  assignMatchToCourt(tournament, matchId, courtNumber) {
    const court = (tournament.courts || []).find((c) => c.number === courtNumber);
    if (!court) throw new Error("Court not found.");
    if (court.status === "maintenance") throw new Error("This court is under maintenance and can't take a match.");
    if (court.status === "disabled") throw new Error("This court is disabled and can't take a match.");
    if (isCourtOccupied(tournament, courtNumber)) throw new Error("This court already has a match on it.");

    const entry = findMatchEntry(tournament, matchId);
    if (!entry) throw new Error("Match not found.");
    if (entry.match.status !== "pending") throw new Error("Only a pending match can be assigned to a court.");
    if (!entry.match.teamA || !entry.match.teamB) throw new Error("Both teams must be known before this match can be assigned a court.");
    if (entry.match.court !== null) throw new Error("This match is already assigned to a court.");

    return updateMatchIn(tournament, matchId, (m) => ({ ...m, court: courtNumber }));
  }

  // Finds whatever non-completed match currently occupies `courtNumber`
  // and returns it to the queue: clears its court, and reverts
  // inProgress -> pending if it had been started — "remove a match from a
  // court and return it to the queue." A no-op if the court has no current
  // match (e.g. it already finished and freed itself).
  releaseCourt(tournament, courtNumber) {
    const current = currentMatchForCourt(tournament, courtNumber);
    if (!current) return tournament;
    return updateMatchIn(tournament, current.id, (m) => ({
      ...m,
      court: null,
      status: m.status === "inProgress" ? "pending" : m.status,
    }));
  }

  // Pure aggregate — the exact data the Court Board renders. Nothing here
  // is persisted; it's recomputed fresh from tournament.courts/pools/
  // bracket every time it's called, which is what makes the board "refresh
  // automatically" — there's no cache to invalidate.
  refreshQueue(tournament) {
    const courts = (tournament.courts || []).map((court) => {
      const currentMatch = currentMatchForCourt(tournament, court.number);
      return {
        ...court,
        currentMatch,
        derivedStatus:
          court.status === "maintenance" || court.status === "disabled" ? court.status : currentMatch ? "occupied" : "available",
      };
    });
    return { courts, queue: this.getPlayableMatches(tournament) };
  }
}

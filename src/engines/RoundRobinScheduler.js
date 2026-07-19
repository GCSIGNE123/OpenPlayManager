// Round Robin scheduling — the classic "circle method" (a.k.a. polygon
// method): fix one entrant, rotate every other entrant around it one step
// per round. This guarantees every pair of entrants meets in exactly one
// round, using the minimum possible number of rounds, without ever needing
// to search/backtrack for a valid pairing.
//
// This intentionally does NOT extend RotationEngine (src/engines/) — that
// base class's interface is "generate the next matchup from a live,
// continuously-changing waiting queue" (Open Play). This is a fundamentally
// different problem: generate the *entire* schedule up front, once, from a
// fixed, known list of entrants. Living in src/engines/ alongside the
// rotation strategies is a placement choice, not a shared interface.
//
// An "entrant" (see lib/tournamentModel.js's makeEntrant) is generic — a
// single player for Singles, or a pre-formed 2-player team for Doubles.
// This module never looks inside playerIds; team formation happens
// upstream, in lib/tournament.js.
import { makeMatch, makeRound } from "../lib/tournamentModel.js";

const BYE = { id: "__bye__", label: "BYE", playerIds: [] };

// keeps index 0 fixed, rotates every other seat by one position — the one
// rule the circle method depends on for correctness
function rotate(arr) {
  const [fixed, ...rest] = arr;
  rest.unshift(rest.pop());
  return [fixed, ...rest];
}

// Generates every round of a round-robin schedule for `entrants`. If
// `entrants.length` is odd, a synthetic BYE is added so the circle method's
// even-count requirement is met — the real entrant paired against it that
// round gets a recorded bye match (isBye: true) rather than being silently
// dropped, and the circle method's own symmetry guarantees each real
// entrant draws the BYE in exactly one round.
//
// As of Tournament Court Assignment & Match Queue, matches no longer come
// out of here with a court pre-assigned (the old cycling 1..courtsCount is
// gone) — every real match starts with court: null. Court assignment is
// now a live, explicit organizer action via CourtAssignmentService, not
// something baked into schedule generation; `courtsCount` is kept as a
// parameter purely for API compatibility with existing callers (it's
// unused here now).
export function generateRoundRobinSchedule({ entrants, courtsCount }) {
  if (entrants.length < 2) return [];

  const seats = entrants.length % 2 === 0 ? [...entrants] : [...entrants, BYE];
  const totalRounds = seats.length - 1;
  const half = seats.length / 2;

  let arrangement = seats;
  const rounds = [];

  for (let roundNumber = 1; roundNumber <= totalRounds; roundNumber++) {
    const roundMatches = [];

    for (let i = 0; i < half; i++) {
      const left = arrangement[i];
      const right = arrangement[seats.length - 1 - i];
      const isBye = left.id === BYE.id || right.id === BYE.id;
      const teamA = left.id === BYE.id ? right : left;
      const teamB = right.id === BYE.id ? left : right; // only meaningful when !isBye

      if (isBye) {
        roundMatches.push(makeMatch({ round: roundNumber, court: null, teamA, teamB: null, isBye: true }));
      } else {
        roundMatches.push(makeMatch({ round: roundNumber, court: null, teamA, teamB }));
      }
    }

    rounds.push(makeRound(roundNumber, roundMatches));
    arrangement = rotate(arrangement);
  }

  return rounds;
}

// Doubles-only: pairs a roster into 2-player teams by simple sequential
// order (not seeded — "Seeding" is its own later feature, see FEATURES.md).
// Throws if the roster can't be evenly split into teams, since silently
// dropping a leftover player would mean deciding who doesn't get to play,
// which isn't this function's call to make.
export function pairIntoTeams(players) {
  if (players.length % 2 !== 0) {
    throw new Error("Doubles needs an even number of players to form complete teams.");
  }
  const teams = [];
  for (let i = 0; i < players.length; i += 2) {
    teams.push([players[i], players[i + 1]]);
  }
  return teams;
}

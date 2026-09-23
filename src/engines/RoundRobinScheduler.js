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

// Doubles-only: pairs a roster into 2-player teams. Throws if the roster
// can't be evenly split into teams, since silently dropping a leftover
// player would mean deciding who doesn't get to play, which isn't this
// function's call to make.
//
// Fixed Partner Mode (Tournament Safety Audit, Saturday prep) — REAL
// pickleball doubles tournaments almost always have pre-registered
// partnerships, but this function used to pair players by pure
// check-in-order regardless (players[i]+players[i+1]), with no way for an
// organizer to specify "Alice + Bob are a team" at all — getting the
// check-in order wrong for even one pair would silently produce a wrong
// team with no warning anywhere. Fixed by reusing the EXISTING Fixed
// Partner Mode feature (queueManagement.js's setFixedPartner/
// clearFixedPartner — already used for Open Play matchmaking, a mutual
// `partnerId` pointer, always either genuinely reciprocal or null) rather
// than inventing a new pairing mechanism: any player with a fixed partner
// who is ALSO in this roster is paired with them first, in roster order;
// everyone else (no fixed partner, or their partner isn't checked into
// this specific session) falls through to the exact same sequential
// pairing this function always did — so a session with no fixed partners
// set at all (every existing caller/test before this fix) behaves
// identically to before.
export function pairIntoTeams(players) {
  if (players.length % 2 !== 0) {
    throw new Error("Doubles needs an even number of players to form complete teams.");
  }
  const byId = new Map(players.map((p) => [p.id, p]));
  const used = new Set();
  const teams = [];

  for (const p of players) {
    if (used.has(p.id)) continue;
    const partner = p.partnerId ? byId.get(p.partnerId) : null;
    // partner.partnerId === p.id re-checks the mutual link rather than
    // trusting p.partnerId alone — setFixedPartner's own invariant says
    // this is always already true, but a fixed-partner link pointing at
    // someone who turns out not to reciprocate (shouldn't happen) falls
    // through to sequential pairing below instead of silently trusting a
    // one-sided pointer.
    if (partner && !used.has(partner.id) && partner.partnerId === p.id) {
      teams.push([p, partner]);
      used.add(p.id);
      used.add(partner.id);
    }
  }

  const remaining = players.filter((p) => !used.has(p.id));
  for (let i = 0; i < remaining.length; i += 2) {
    teams.push([remaining[i], remaining[i + 1]]);
  }
  return teams;
}

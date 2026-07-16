import { emptyCourt } from "./constants.js";
import { WinnerPoolRotationEngine } from "../engines/WinnerPoolRotationEngine.js";

const defaultEngine = new WinnerPoolRotationEngine();

// Courts pair up by fixed, adjacent position: (1,2), (3,4), (5,6), ... A
// court's pair partner is always the other court in its pair — court 1's
// partner is court 2, court 3's is court 4, and so on. Returns null for the
// odd court out when the courts array has an odd length (e.g. court 5 with
// only 5 courts total) — see resolveWinnerPoolMatch's handling of that case.
export function getPairPartnerIndex(courts, courtIdx) {
  const pairBase = courtIdx - (courtIdx % 2);
  const partnerIdx = pairBase === courtIdx ? courtIdx + 1 : courtIdx - 1;
  return partnerIdx >= 0 && partnerIdx < courts.length ? partnerIdx : null;
}

// Called right after a court's match is confirmed ended (stats/history
// already recorded elsewhere — see PickleballOpenPlay.jsx's endMatch). Holds
// a finished court until its pair partner also finishes, then pools both
// courts' winners into one new match and both courts' losers into another —
// see WinnerPoolRotationEngine for how those new teams get built. The
// winner pool's match goes on the pair's lower-numbered court, the loser
// pool's on the higher-numbered one.
//
// Returns { courts, requeueIds } — requeueIds is only non-empty for the odd
// court out (no pair partner), which just falls back to requeuing its
// players normally rather than pooling, per the spec's "handle gracefully"
// note for odd numbers of courts.
export function resolveWinnerPoolMatch(courts, players, courtIdx, engine = defaultEngine) {
  const thisCourt = courts[courtIdx];
  const partnerIdx = getPairPartnerIndex(courts, courtIdx);

  if (partnerIdx === null) {
    const requeueIds = [...thisCourt.teamA, ...thisCourt.teamB];
    const newCourts = courts.map((c, i) => (i === courtIdx ? emptyCourt(c.number) : c));
    return { courts: newCourts, requeueIds };
  }

  const partnerCourt = courts[partnerIdx];
  const markedThis = { ...thisCourt, awaitingPair: true };

  if (!partnerCourt.awaitingPair) {
    // partner hasn't finished yet — hold this court's final score and wait
    const newCourts = courts.map((c, i) => (i === courtIdx ? markedThis : c));
    return { courts: newCourts, requeueIds: [] };
  }

  // both courts in the pair are done — pool winners and losers, then
  // rebuild fresh teams for each pool
  const winners = [];
  const losers = [];
  for (const c of [markedThis, partnerCourt]) {
    const aWon = c.scoreA > c.scoreB;
    const bWon = c.scoreB > c.scoreA;
    winners.push(...(aWon ? c.teamA : bWon ? c.teamB : c.teamA));
    losers.push(...(aWon ? c.teamB : bWon ? c.teamA : c.teamB));
  }

  const winnerMatch = engine.buildPoolMatchup(winners, players);
  const loserMatch = engine.buildPoolMatchup(losers, players);

  const lowerIdx = Math.min(courtIdx, partnerIdx);
  const higherIdx = Math.max(courtIdx, partnerIdx);

  const newCourts = courts.map((c, i) => {
    if (i === lowerIdx && winnerMatch) {
      return {
        ...c,
        status: "live",
        teamA: winnerMatch.teamA,
        teamB: winnerMatch.teamB,
        scoreA: 0,
        scoreB: 0,
        awaitingPair: false,
      };
    }
    if (i === higherIdx && loserMatch) {
      return {
        ...c,
        status: "live",
        teamA: loserMatch.teamA,
        teamB: loserMatch.teamB,
        scoreA: 0,
        scoreB: 0,
        awaitingPair: false,
      };
    }
    return c;
  });

  return { courts: newCourts, requeueIds: [] };
}

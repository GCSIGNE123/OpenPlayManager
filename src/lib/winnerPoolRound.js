import { emptyCourt } from "./constants.js";
import { uid } from "./random.js";
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

// Whether pooling (courts pair up 1&2/3&4/..., winners pool together,
// losers pool together, see resolveWinnerPoolMatch below) should apply to
// the court that just finished. True for the standalone "Winner Pool
// Rotation" mode, and also for Progressive Skill Rotation while it's in the
// Mentorship phase — the spec for that phase calls for the same pairwise
// pooling mechanic (still built on BalancedRotationEngine's beginner+
// intermediate/recency scoring via WinnerPoolRotationEngine, same as
// standalone Winner Pool Rotation). Transition and Competitive stay on the
// normal per-court continuous-queue lifecycle.
export function isPoolingRotation(rotationMode, phase) {
  return rotationMode === "winnerPool" || (rotationMode === "progressiveSkill" && phase === "mentorship");
}

// Called right after a court's match is confirmed ended (stats/history
// already recorded elsewhere — see PickleballOpenPlay.jsx's endMatch). Holds
// a finished court until its pair partner also finishes, then pools both
// courts' winners into one new match and both courts' losers into another —
// see WinnerPoolRotationEngine for how those new teams get built.
//
// The freshly-pooled teams do NOT go straight back onto courts 1/2 — both
// courts in the pair open up instead, and the new teams join the BACK of
// the waiting queue (as pre-built matchups) so anyone else who's been
// waiting gets first crack at the now-open courts. Otherwise the same 8
// players on courts 1&2 would just keep replaying each other forever while
// everyone else sat out.
//
// Returns { courts, requeueIds, newMatchups }:
//   - requeueIds: player ids to append to the back of queueIds
//   - newMatchups: pre-built matchup objects to append to the back of
//     nextMatchups (empty unless both courts in the pair just resolved)
// requeueIds is also how the odd court out (no pair partner) gets handled —
// it just requeues its players normally rather than pooling, per the
// spec's "handle gracefully" note for odd numbers of courts.
export function resolveWinnerPoolMatch(courts, players, courtIdx, engine = defaultEngine) {
  const thisCourt = courts[courtIdx];
  const partnerIdx = getPairPartnerIndex(courts, courtIdx);

  if (partnerIdx === null) {
    const requeueIds = [...thisCourt.teamA, ...thisCourt.teamB];
    const newCourts = courts.map((c, i) => (i === courtIdx ? emptyCourt(c.number) : c));
    return { courts: newCourts, requeueIds, newMatchups: [] };
  }

  const partnerCourt = courts[partnerIdx];
  const markedThis = { ...thisCourt, awaitingPair: true };

  if (!partnerCourt.awaitingPair) {
    // partner hasn't finished yet — hold this court's final score and wait
    const newCourts = courts.map((c, i) => (i === courtIdx ? markedThis : c));
    return { courts: newCourts, requeueIds: [], newMatchups: [] };
  }

  // both courts in the pair are done — pool winners and losers, rebuild
  // fresh teams for each pool, open up both courts, and send the new teams
  // to the back of the queue instead of straight back onto court/partner
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
  const newCourts = courts.map((c, i) => (i === lowerIdx || i === higherIdx ? emptyCourt(c.number) : c));

  const newMatchups = [];
  if (winnerMatch) newMatchups.push({ id: uid(), teamA: winnerMatch.teamA, teamB: winnerMatch.teamB });
  if (loserMatch) newMatchups.push({ id: uid(), teamA: loserMatch.teamA, teamB: loserMatch.teamB });

  return { courts: newCourts, requeueIds: [...winners, ...losers], newMatchups };
}

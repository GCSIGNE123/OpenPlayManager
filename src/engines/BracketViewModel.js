// BracketViewModel — see PROJECT.md's Live Playoff Bracket & Match
// Operations section. Pure derivation over an already-generated Bracket:
// everything the Live Bracket View's navigation features (current-round
// jump, advancement-path highlight, waiting/next match lists) need,
// computed fresh every call — same "no cache to invalidate" pattern this
// app's other live-view derivations already use. Never mutates the
// bracket, never persists anything.
import { PlayoffEngine } from "./PlayoffEngine.js";

const playoffEngine = new PlayoffEngine();

// Every match id that sits on matchId's advancement path: the match itself,
// its two feeder matches (the previous round's matches that fill its
// teamA/teamB), and the next match it feeds into (if any) — one round in
// each direction, not a full recursive trace to the championship. Matches
// this task's own "highlight the advancement path" ask (relative to
// whichever match is currently selected) without building a bigger
// multi-round path visualization the spec doesn't ask for.
export function getAdvancementPathMatchIds(bracket, matchId) {
  const ids = new Set([matchId]);
  let roundIndex = -1;
  let match = null;
  for (let i = 0; i < bracket.rounds.length; i++) {
    const found = bracket.rounds[i].matches.find((m) => m.id === matchId);
    if (found) {
      roundIndex = i;
      match = found;
      break;
    }
  }
  if (!match) return ids;

  // Feeder matches: the previous round's matches whose winner could have
  // filled this one's two slots (matchNumber*2-1 and matchNumber*2).
  if (roundIndex > 0) {
    const feederRound = bracket.rounds[roundIndex - 1];
    for (const m of feederRound.matches) {
      if (m.matchNumber === match.matchNumber * 2 - 1 || m.matchNumber === match.matchNumber * 2) ids.add(m.id);
    }
  }
  // Next match this one's winner advances into.
  if (roundIndex < bracket.rounds.length - 1) {
    const nextMatchNumber = Math.ceil(match.matchNumber / 2);
    const nextMatch = bracket.rounds[roundIndex + 1].matches.find((m) => m.matchNumber === nextMatchNumber);
    if (nextMatch) ids.add(nextMatch.id);
  }
  return ids;
}

// The full enriched view a Live Bracket View renders directly:
//   currentRoundNumber — for "jump to current round"
//   waitingMatches — ready (both known, not started) matches across the
//     whole bracket, per the Live Tournament Dashboard's "Waiting Matches"
//   nextMatches — same set, just the earliest round's worth (what's most
//     imminent), for the dashboard's "Next Matches"
//   rounds — bracket.rounds, each match enriched with `state`
//     (PlayoffEngine.getMatchState) and, when selectedMatchId is given,
//     `onAdvancementPath` (bool)
export function buildBracketViewModel(bracket, selectedMatchId = null) {
  const currentRound = playoffEngine.getCurrentRound(bracket);
  const allMatches = bracket.rounds.flatMap((r) => r.matches);
  const waitingMatches = allMatches.filter((m) => playoffEngine.getMatchState(m) === "ready");
  const earliestWaitingRound = bracket.rounds.find((r) => r.matches.some((m) => playoffEngine.getMatchState(m) === "ready"));
  const nextMatches = earliestWaitingRound ? earliestWaitingRound.matches.filter((m) => playoffEngine.getMatchState(m) === "ready") : [];
  const pathIds = selectedMatchId ? getAdvancementPathMatchIds(bracket, selectedMatchId) : new Set();

  return {
    currentRoundNumber: currentRound.roundNumber,
    waitingMatches,
    nextMatches,
    rounds: bracket.rounds.map((r) => ({
      ...r,
      isCurrentRound: r.roundNumber === currentRound.roundNumber,
      matches: r.matches.map((m) => ({
        ...m,
        state: playoffEngine.getMatchState(m),
        onAdvancementPath: pathIds.has(m.id),
      })),
    })),
    // Bronze Medal Match — a sibling field, not a round inside
    // bracket.rounds (see PlayoffBracketGenerator's header comment for
    // why), enriched the same way every round match is so the Bracket
    // view can render it with BracketMatchCard unchanged. null when
    // disabled or not applicable.
    bronzeMatch: bracket.bronzeMatch ? { ...bracket.bronzeMatch, state: playoffEngine.getMatchState(bracket.bronzeMatch), onAdvancementPath: false } : null,
  };
}

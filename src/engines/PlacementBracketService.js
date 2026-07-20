// Consolation & Placement Brackets — see PROJECT.md. The core insight this
// whole file leans on: a Consolation Bracket is STRUCTURALLY IDENTICAL to
// the championship bracket (the exact same { rounds, bronzeMatch, champion,
// runnerUp, thirdPlace, fourthPlace } shape) — it's just fed by the
// championship's own first-round LOSERS instead of pool qualifiers, and its
// champion/runnerUp/thirdPlace/fourthPlace mean 5th/6th/7th/8th place
// instead of 1st-4th. That reuse is what lets PlayoffEngine's existing
// startMatch/updateBracket/bronze-match logic operate on
// tournament.consolationBracket completely unchanged (see lib/tournament.js)
// — this file only ever builds the initial (empty) structure and seats
// losers into it, mirroring PlayoffBracketGenerator's own division of labor
// (it builds once, PlayoffEngine owns everything that happens after).
import { uid } from "../lib/random.js";

export class PlacementBracketService {
  // size: the championship bracket's own first-round match count (= number
  // of first-round losers). Builds an EMPTY skeleton — every round,
  // INCLUDING round 1 (unlike the championship bracket, whose round 1
  // starts with real seeded teams) — by calling
  // PlayoffBracketGenerator.createRounds() with `size` null placeholders:
  // createRounds' round-count/match-count logic only cares how many teams
  // there are, never what they actually contain, so every match it builds
  // for a null-filled input already comes out with teamA/teamB null — no
  // new round-building logic needed here at all.
  generateConsolationBracket(size, bracketGenerator, includePlacementMatch = true) {
    if (size < 2 || (size & (size - 1)) !== 0) return null;
    const rounds = bracketGenerator.createRounds(new Array(size).fill(null));
    const consolationBracket = {
      id: uid(),
      size,
      status: "ready",
      completedAt: null,
      champion: null, // 5th place, once decided
      runnerUp: null, // 6th place
      rounds,
      generatedAt: Date.now(),
    };
    // The consolation bracket's OWN "bronze match" — same reasoning Bronze
    // Medal Match already established, just one placement tier down: fed
    // by the consolation bracket's semifinal-equivalent losers, decides
    // 7th/8th. Only meaningful once there's a real round before its own
    // final (rounds.length >= 2), same guard PlayoffBracketGenerator uses.
    if (includePlacementMatch && rounds.length >= 2) {
      consolationBracket.bronzeMatch = bracketGenerator.createBronzeMatch();
      consolationBracket.thirdPlace = null; // 7th place
      consolationBracket.fourthPlace = null; // 8th place
    }
    return consolationBracket;
  }

  // The orchestrator PlayoffBracketGenerator.generateBracket calls right
  // after building the championship bracket. Reads tournament.
  // placementMatches to decide whether to build anything at all;
  // "consolationBracket" and "fullPlacement" currently produce the
  // identical structure (5th-8th only) since 9th-16th place isn't
  // implemented this milestone — see TournamentSettings.js's own comment
  // on PLACEMENT_MATCHES_METHODS for why that's not hidden from the
  // organizer, just honestly documented. Requires a real round before the
  // semifinal (rounds.length >= 3, e.g. Quarterfinals-or-earlier) to have
  // any first-round losers to draw from at all — a 4-team championship
  // bracket's "first round" IS the semifinal, which is Bronze Medal
  // Match's territory, not a consolation bracket's.
  generatePlacementBracket(tournament, championshipBracket, bracketGenerator) {
    const method = tournament.placementMatches ?? "disabled";
    if (method !== "consolationBracket" && method !== "fullPlacement") return null;
    if (!championshipBracket || championshipBracket.rounds.length < 3) return null;
    const firstRoundLoserCount = championshipBracket.rounds[0].matches.length;
    return this.generateConsolationBracket(firstRoundLoserCount, bracketGenerator, true);
  }

  // Seats a championship FIRST-ROUND loser into the consolation bracket's
  // round 1 — reuses PlayoffAdvancementService.populateNextMatch exactly as
  // advanceWinner itself does for real advancement, just targeting round
  // index 0 of a DIFFERENT bracket object (the same matchNumber ->
  // ceil(matchNumber/2) / odd-teamA/even-teamB adjacency applies, since the
  // championship's first round and the consolation bracket's first round
  // have exactly the same match count by construction). A no-op when
  // there's no consolation bracket to seat into.
  seatConsolationParticipant(consolationBracket, championshipMatchNumber, loserTeam, advancementService) {
    if (!consolationBracket) return consolationBracket;
    const nextMatchNumber = Math.ceil(championshipMatchNumber / 2);
    const slot = championshipMatchNumber % 2 === 1 ? "teamA" : "teamB";
    const rounds = advancementService.populateNextMatch(consolationBracket, 0, nextMatchNumber, slot, loserTeam);
    return { ...consolationBracket, rounds };
  }

  // Pure aggregation — nothing persisted, recomputed fresh from
  // tournament.bracket + tournament.consolationBracket every call, same
  // "derive, don't persist" precedent every other live-status calculation
  // in this app already follows. Returns only the placements that are
  // actually decided yet (a still-in-progress consolation bracket simply
  // contributes fewer rows) — callers render what's there, not "—" filler.
  determineFinalPlacings(tournament) {
    const placings = [];
    const championship = tournament.bracket;
    if (championship?.champion) placings.push({ place: 1, label: "Champion", team: championship.champion });
    if (championship?.runnerUp) placings.push({ place: 2, label: "Runner-up", team: championship.runnerUp });
    if (championship?.thirdPlace) placings.push({ place: 3, label: "Third Place", team: championship.thirdPlace });
    if (championship?.fourthPlace) placings.push({ place: 4, label: "Fourth Place", team: championship.fourthPlace });
    const consolation = tournament.consolationBracket;
    if (consolation?.champion) placings.push({ place: 5, label: "Fifth Place", team: consolation.champion });
    if (consolation?.runnerUp) placings.push({ place: 6, label: "Sixth Place", team: consolation.runnerUp });
    if (consolation?.thirdPlace) placings.push({ place: 7, label: "Seventh Place", team: consolation.thirdPlace });
    if (consolation?.fourthPlace) placings.push({ place: 8, label: "Eighth Place", team: consolation.fourthPlace });
    return placings;
  }

  // "Prevent: duplicate participants / multiple placement assignments /
  // inconsistent final rankings" — one real, callable check across the
  // aggregated list. By construction (championship and consolation brackets
  // partition participants — a first-round loser leaves the championship
  // bracket for good the moment they're seated into consolation) this
  // should never actually fire, but it's a real defensive check per the
  // spec's explicit ask, same precedent PoolQualificationService.
  // validateQualificationResult already set for an analogous "shouldn't
  // happen, but verify" invariant.
  validatePlacings(placings) {
    const ids = placings.map((p) => p.team.participantId);
    const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    return {
      valid: duplicates.length === 0,
      errors: duplicates.length > 0 ? [`Participant(s) assigned more than one final placement: ${duplicates.join(", ")}.`] : [],
    };
  }
}

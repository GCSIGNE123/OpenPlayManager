// Double Elimination — see PROJECT.md / FEATURES.md. Two ways a bracket
// gets built: (1) STANDALONE — a Double Elimination tournament
// (tournament.format === "doubleElimination") seeded directly from
// registered/checked-in entrants, no pool stage at all (see
// lib/tournament.js's buildAndSaveDoubleEliminationTournament); or (2) as
// the PLAYOFF stage after a Round Robin pool stage (tournament.bracketFormat
// === "doubleElimination", a sibling of PlayoffBracketGenerator/single-
// elimination — see TournamentSettings.js's BRACKET_FORMATS). Both paths
// build and progress the exact same tournament.doubleEliminationBracket
// shape via this one engine, so completing it here makes both real at once.
//
// Full progression, real elimination: every Winners Bracket loser is
// actually seated into its Losers Bracket destination (not just a
// placeholder descriptor); Losers Bracket matches advance their winner and
// eliminate their loser (no further seat exists for them anywhere — the
// same "elimination is implicit in bracket shape" precedent the existing
// single-elimination bracket already established, deliberately not a
// stored boolean); the Grand Final seats both brackets' champions the
// moment they're both known and implements the standard "bracket reset"
// rule (see updateGrandFinal below).
import { TournamentEngine } from "./TournamentEngine.js";
import { PlayoffBracketGenerator, makeBracketMatch } from "./PlayoffBracketGenerator.js";
import { PoolQualificationService } from "./PoolQualificationService.js";
import { WinnersBracketAdvancementService } from "./WinnersBracketAdvancementService.js";
import { LosersBracketAdvancementService } from "./LosersBracketAdvancementService.js";
import { uid } from "../lib/random.js";

const NOT_IMPLEMENTED = { implemented: false, message: "Double Elimination is not implemented yet — architecture only (Tournament Engine Foundation)." };

const qualificationService = new PoolQualificationService();
const bracketGenerator = new PlayoffBracketGenerator();
const winnersAdvancementService = new WinnersBracketAdvancementService();
const losersAdvancementService = new LosersBracketAdvancementService();

const NOT_READY = { ready: false, reason: "not_ready", size: 0, winnersBracket: null, losersBracket: null, grandFinal: null };

// Winners Bracket round names read by distance from the FINAL round, not by
// team count — this is what makes "Winners Round 1" (rather than
// "Winners Round of 16") show up for any bracket with more than 4 rounds,
// exactly matching the spec's literal Winners Round 1 / Winners
// Quarterfinals / Winners Semifinals / Winners Final catalog. A 4-round
// (16-team) bracket uses all four; smaller brackets just don't reach the
// earlier labels (a 3-round/8-team bracket never has a "Winners Round 1" —
// its first round IS the Quarterfinals), the same "not every stage name
// applies to every size" precedent playoffStages.js already set.
function winnersRoundName(indexFromStart, totalRounds) {
  const fromEnd = totalRounds - 1 - indexFromStart;
  if (fromEnd === 0) return "Winners Final";
  if (fromEnd === 1) return "Winners Semifinals";
  if (fromEnd === 2) return "Winners Quarterfinals";
  return `Winners Round ${indexFromStart + 1}`;
}

// Same distance-from-final naming, but with the Losers Bracket's own
// (spec-literal, singular) tail labels — Losers Quarterfinal / Losers
// Semifinal / Losers Final — falling back to "Losers Round N" for earlier
// rounds, same as Winners Bracket above.
function losersRoundName(indexFromStart, totalRounds) {
  const fromEnd = totalRounds - 1 - indexFromStart;
  if (fromEnd === 0) return "Losers Final";
  if (fromEnd === 1) return "Losers Semifinal";
  if (fromEnd === 2) return "Losers Quarterfinal";
  return `Losers Round ${indexFromStart + 1}`;
}

export class DoubleEliminationEngine extends TournamentEngine {
  generateSchedule(participants, courtsCount) {
    return NOT_IMPLEMENTED;
  }

  updateMatchResult(tournament, matchId, result) {
    return NOT_IMPLEMENTED;
  }

  getStandings(tournament) {
    return NOT_IMPLEMENTED;
  }

  getNextMatches(tournament) {
    return NOT_IMPLEMENTED;
  }

  // Winners Bracket — structurally identical to the existing single-
  // elimination bracket (reuses PlayoffBracketGenerator.seedParticipants +
  // .createRounds completely unchanged: round 1 seeded with real qualified
  // teams, every later round pre-built with empty teamA/teamB placeholders
  // — no advancement happens until a later sprint). Only the round NAMES
  // and each match's `matchType` ("winnersBracket" instead of "playoff")
  // differ, applied as a thin rename pass after createRounds builds the
  // real pairing structure — zero duplicated bracket-building logic.
  // returns: TournamentRound[] (same shape createRounds always returns).
  createWinnersBracket(qualifiedTeams, seedingMethod, context) {
    const seeds = bracketGenerator.seedParticipants(qualifiedTeams, seedingMethod, context);
    const rounds = bracketGenerator.createRounds(seeds, { matchType: "winnersBracket" });
    rounds.forEach((round, i) => {
      round.name = winnersRoundName(i, rounds.length);
    });
    return rounds;
  }

  // Losers Bracket — an empty skeleton, same "feed createRounds() a
  // null-filled array" trick PlacementBracketService already established
  // for the Consolation Bracket (createRounds' round/match-count logic
  // only cares how many "team" entries there are, never what they
  // contain). Sized to the real double-elimination match-count formula so
  // later progression sprints don't need to rebuild this shape: for a
  // `wbRounds`-round Winners Bracket, the Losers Bracket has
  // `2 * (wbRounds - 1)` rounds, alternating "round of WB-round-k losers
  // arriving" / "survivors play the winner" pairs — round pair k (1-based)
  // has `size / 2^(k+1)` matches each. Verified against the well-known
  // 8-team shape (LR1: 2, LR2: 2, LR3: 1, LR4/Final: 1) and the 4-team
  // shape (LR1: 1, LR2/Final: 1).
  createLosersBracket(size) {
    const wbRounds = Math.log2(size);
    const rounds = [];
    let roundNumber = 1;
    for (let k = 1; k <= wbRounds - 1; k++) {
      const matchCount = size / 2 ** (k + 1);
      for (let sub = 0; sub < 2; sub++) {
        const matches = Array.from({ length: matchCount }, (_, i) =>
          makeBracketMatch({ round: roundNumber, matchNumber: i + 1, matchType: "losersBracket" })
        );
        rounds.push({ roundNumber, name: "", status: "pending", matches });
        roundNumber += 1;
      }
    }
    rounds.forEach((round, i) => {
      round.name = losersRoundName(i, rounds.length);
    });
    return rounds;
  }

  // Grand Final — a small container (not a single match) since standard
  // Double Elimination rules require a CONDITIONAL second game: `game1`
  // always exists (empty until both bracket champions are known — see
  // populateGrandFinal); `game2` stays null unless the Losers Bracket
  // champion wins game1, in which case a fresh, empty second match is
  // created (see updateGrandFinal) — the "bracket reset," since the
  // Winners Bracket champion entering with zero losses now has exactly one,
  // same as the Losers Bracket champion, so a single decisive game is
  // needed. `status` mirrors a bracket's own ('pending' until game1 has
  // both teams, 'running' once game1 starts, 'completed' once a true
  // champion is decided — either game1 outright, or game2 if it exists).
  createGrandFinal() {
    return {
      id: uid(),
      status: "pending",
      game1: makeBracketMatch({ round: "grandFinal", matchNumber: 1, matchType: "grandFinal" }),
      game2: null,
      resetTriggered: false,
      champion: null,
      runnerUp: null,
      completedAt: null,
    };
  }

  // Seats both bracket champions into Grand Final Game 1 the moment both
  // are known (winnersBracket.champion enters with 0 losses, losersBracket.
  // champion with 1 — team A/B order is purely cosmetic, the actual
  // 0-loss-vs-1-loss logic lives in updateGrandFinal below, not in seat
  // order). A no-op (returns grandFinal unchanged) if either champion isn't
  // decided yet, or Game 1 is already seated — safe to call after every
  // Winners/Losers Bracket match result without the caller needing to
  // track "did this already happen."
  populateGrandFinal(grandFinal, winnersChampion, losersChampion) {
    if (!winnersChampion || !losersChampion) return grandFinal;
    if (grandFinal.game1.teamA && grandFinal.game1.teamB) return grandFinal;
    return {
      ...grandFinal,
      status: "ready",
      game1: { ...grandFinal.game1, teamA: winnersChampion, teamB: losersChampion },
    };
  }

  // Grand Final result handling — see PROJECT.md's explicit ruleset:
  //   - Game 1 won by the Winners Bracket champion (teamA) -> tournament
  //     ends immediately, no reset. teamA both entered AND left with 0
  //     losses; teamB (Losers Bracket champion) takes their second loss
  //     and is eliminated, same as any other Losers Bracket elimination.
  //   - Game 1 won by the Losers Bracket champion (teamB) -> that's the
  //     Winners Bracket champion's FIRST loss, so both sides now have
  //     exactly one — a single deciding game ("Grand Final Reset" / Game 2,
  //     same two teams) is created. Never created when teamA wins Game 1.
  //   - Game 2 (if it exists) is winner-takes-all — whoever wins it is the
  //     tournament champion, regardless of which side they were.
  // matchId must be either grandFinal.game1.id or grandFinal.game2.id.
  // Returns the updated grandFinal (never mutates the one passed in).
  updateGrandFinal(grandFinal, matchId, result) {
    const isGame1 = grandFinal.game1.id === matchId;
    const isGame2 = grandFinal.game2 && grandFinal.game2.id === matchId;
    if (!isGame1 && !isGame2) {
      throw new Error("Invalid Grand Final mapping — this match doesn't belong to this Grand Final.");
    }
    if (grandFinal.status === "completed") {
      throw new Error("The Grand Final is already completed — no further edits are allowed.");
    }
    const targetGame = isGame1 ? grandFinal.game1 : grandFinal.game2;
    if (targetGame.status === "completed") {
      throw new Error("This game already has a recorded result — advancing it again would decide the champion twice.");
    }
    if (!targetGame.teamA || !targetGame.teamB) {
      throw new Error("Both teams must be known before this game can be played.");
    }

    const { scoreA, scoreB, winnerId } = result;
    if (scoreA === "" || scoreB === "" || scoreA == null || scoreB == null) {
      throw new Error("Enter a score for both teams.");
    }
    const numA = Number(scoreA);
    const numB = Number(scoreB);
    if (!Number.isFinite(numA) || !Number.isFinite(numB) || numA < 0 || numB < 0) {
      throw new Error("Scores can't be negative.");
    }
    if (winnerId !== targetGame.teamA.participantId && winnerId !== targetGame.teamB.participantId) {
      throw new Error("Winner must be one of this match's two teams.");
    }

    const winnerTeam = winnerId === targetGame.teamA.participantId ? targetGame.teamA : targetGame.teamB;
    const loserTeam = winnerTeam === targetGame.teamA ? targetGame.teamB : targetGame.teamA;
    const completedGame = {
      ...targetGame,
      score: { teamA: numA, teamB: numB },
      winner: winnerId,
      status: "completed",
      completedAt: Date.now(),
    };

    if (isGame1) {
      const winnersChampionWon = winnerId === grandFinal.game1.teamA.participantId;
      if (winnersChampionWon) {
        // no reset — the Winners Bracket champion wins the whole tournament
        return {
          ...grandFinal,
          game1: completedGame,
          status: "completed",
          champion: winnerTeam,
          runnerUp: loserTeam,
          completedAt: Date.now(),
        };
      }
      // Losers Bracket champion won Game 1 — bracket reset, same two teams,
      // fresh empty Game 2, tournament not yet decided
      return {
        ...grandFinal,
        game1: completedGame,
        status: "running",
        resetTriggered: true,
        game2: makeBracketMatch({
          round: "grandFinalReset",
          matchNumber: 2,
          teamA: grandFinal.game1.teamA,
          teamB: grandFinal.game1.teamB,
          matchType: "grandFinal",
        }),
      };
    }

    // Game 2 (the reset) — winner-takes-all, decides the champion outright
    return {
      ...grandFinal,
      game2: completedGame,
      status: "completed",
      champion: winnerTeam,
      runnerUp: loserTeam,
      completedAt: Date.now(),
    };
  }

  // Same two-tier validation precedent PlayoffBracketGenerator established:
  // this is the rich, separately-callable { valid, errors[] } check (every
  // rule at once, for a caller that wants the full picture); generateBracket
  // below keeps its own inline checks for its stable hot-path {ready,
  // reason, size} contract, mirroring that file's own header comment on
  // why the two don't share one implementation.
  validateBracket(tournament, engine) {
    const errors = [];

    if (tournament.doubleEliminationBracket) {
      errors.push("A Double Elimination bracket has already been generated for this tournament.");
      return { valid: false, errors };
    }

    const qualification = qualificationService.determineQualifiers(tournament, engine);
    const incompletePools = qualification.pools.filter((p) => !p.complete);
    if (incompletePools.length > 0) {
      errors.push(`All pools must be complete — still in progress: ${incompletePools.map((p) => p.poolLabel).join(", ")}.`);
    }
    if (!qualification.ready) {
      errors.push("Qualification has not been finalized yet.");
    }

    if (qualification.ready) {
      const size = qualification.qualifiedTeams.length;
      // Double Elimination needs a real Losers Bracket, which needs at
      // least two Winners Bracket rounds to draw losers from — a 2-team
      // bracket has nowhere for a Losers Bracket to exist at all, so the
      // minimum here is stricter than single elimination's "just needs to
      // be a power of two."
      if (size < 4) {
        errors.push(`Double Elimination requires at least 4 qualified teams to form both a Winners and Losers Bracket — currently ${size}.`);
      } else if ((size & (size - 1)) !== 0) {
        errors.push(`Qualified team count (${size}) must be a power of two (4, 8, 16, ...) to generate a Double Elimination bracket.`);
      }
      const participantIds = qualification.qualifiedTeams.map((t) => t.participantId);
      const duplicates = participantIds.filter((id, i) => participantIds.indexOf(id) !== i);
      if (duplicates.length > 0) {
        errors.push("Duplicate participants found among qualified teams — a participant can only qualify once.");
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // tournament: Tournament; engine: TournamentEngine for tournament.format
  // (passed straight through to PoolQualificationService, same contract
  // PlayoffBracketGenerator.generateBracket already uses); context: passed
  // straight through to seedParticipants (Rating/Manual seeding only).
  // returns: { ready: false, reason, size } when not ready/unsupported, or
  // the full persistable structure ({ ready: true, id, status: "ready",
  // completedAt: null, winnersBracket, losersBracket, grandFinal }) once
  // qualification is ready and the size is valid.
  generateBracket(tournament, engine, context) {
    const qualification = qualificationService.determineQualifiers(tournament, engine);
    if (!qualification.ready) return NOT_READY;

    const size = qualification.qualifiedTeams.length;
    if (size < 4 || (size & (size - 1)) !== 0) {
      return { ready: false, reason: "unsupported_size", size, winnersBracket: null, losersBracket: null, grandFinal: null };
    }

    const winnersRounds = this.createWinnersBracket(qualification.qualifiedTeams, tournament.seedingMethod, context);
    const losersRounds = this.createLosersBracket(size);
    const grandFinal = this.createGrandFinal();

    return {
      ready: true,
      id: uid(),
      status: "ready",
      completedAt: null,
      winnersBracket: { id: uid(), size, status: "pending", rounds: winnersRounds, champion: null, runnerUp: null },
      losersBracket: { id: uid(), size, status: "pending", rounds: losersRounds },
      grandFinal,
    };
  }

  // Winners Bracket Progression — the Winners Bracket equivalent of
  // PlayoffEngine.updateBracket: records a result, advances the winner into
  // the next Winners Bracket match, and — the piece that used to be a
  // placeholder — actually SEATS the loser into their real Losers Bracket
  // destination (LosersBracketAdvancementService.seatWinnersBracketLoser).
  // winnersBracket.champion/runnerUp are stamped the moment the Winners
  // Final completes; once BOTH champions are known, Grand Final Game 1 is
  // populated automatically (same "populate on completion" precedent
  // RoundRobinEngine.updateMatchResult already uses for the single-
  // elimination bracket).
  // winnersBracket/losersBracket/grandFinal: the sub-records of
  // tournament.doubleEliminationBracket; result: { scoreA, scoreB, winnerId }
  // returns: { winnersBracket, losersBracket, grandFinal } — all three,
  // since seating a loser writes into losersBracket and a completed
  // Winners Final may populate grandFinal — never mutates any of the
  // objects passed in.
  updateWinnersBracket(winnersBracket, losersBracket, grandFinal, matchId, result) {
    const validation = winnersAdvancementService.validateAdvancement(winnersBracket, matchId, result);
    if (!validation.valid) {
      throw new Error(validation.errors.join(" "));
    }

    let found = null;
    for (let roundIndex = 0; roundIndex < winnersBracket.rounds.length; roundIndex++) {
      const match = winnersBracket.rounds[roundIndex].matches.find((m) => m.id === matchId);
      if (match) {
        found = { match, roundIndex };
        break;
      }
    }

    // Same inline score/winner checks PlayoffEngine.updateBracket already
    // applies for the championship bracket — validateAdvancement above
    // covers the Validation section's four named rules (no winner,
    // duplicate advancement, invalid mapping, completed-tournament edits);
    // these are the same basic data-integrity checks every other match-
    // result save path in this app applies before persisting a score.
    const { scoreA, scoreB, winnerId } = result;
    if (scoreA === "" || scoreB === "" || scoreA == null || scoreB == null) {
      throw new Error("Enter a score for both teams.");
    }
    const numA = Number(scoreA);
    const numB = Number(scoreB);
    if (!Number.isFinite(numA) || !Number.isFinite(numB) || numA < 0 || numB < 0) {
      throw new Error("Scores can't be negative.");
    }
    if (winnerId !== found.match.teamA.participantId && winnerId !== found.match.teamB.participantId) {
      throw new Error("Winner must be one of this match's two teams.");
    }
    const winnerTeam = winnerId === found.match.teamA.participantId ? found.match.teamA : found.match.teamB;
    const loserTeam = winnerTeam === found.match.teamA ? found.match.teamB : found.match.teamA;

    const updatedMatch = {
      ...winnersAdvancementService.updateMatchStatus(found.match, "completed"),
      score: { teamA: numA, teamB: numB },
      winner: winnerId,
      completedAt: Date.now(),
      loserDestination: winnersAdvancementService.recordLoserDestination(winnersBracket, losersBracket, matchId),
    };

    let rounds = winnersBracket.rounds.map((r, i) => {
      if (i !== found.roundIndex) return r;
      const matches = r.matches.map((m) => (m.id === updatedMatch.id ? updatedMatch : m));
      return { ...r, matches };
    });
    rounds = winnersAdvancementService.advanceWinner({ rounds }, matchId, winnerTeam);

    let nextWinnersBracket = { ...winnersBracket, rounds };
    const finalRound = rounds[rounds.length - 1];
    if (winnersAdvancementService.isRoundComplete(finalRound) && found.roundIndex === rounds.length - 1) {
      nextWinnersBracket = { ...nextWinnersBracket, champion: winnerTeam, runnerUp: loserTeam };
    }

    const allMatches = rounds.flatMap((r) => r.matches);
    if (allMatches.every((m) => m.status === "completed")) {
      nextWinnersBracket = { ...nextWinnersBracket, status: "completed", completedAt: Date.now() };
    } else {
      nextWinnersBracket = { ...nextWinnersBracket, status: allMatches.some((m) => m.status === "inProgress" || m.status === "completed") ? "running" : "ready" };
    }

    // Real seating — every Winners Bracket loser (not just Round 1's) is
    // now actually written into their computed Losers Bracket slot, never
    // left as a placeholder.
    const nextLosersBracket = losersAdvancementService.seatWinnersBracketLoser(losersBracket, winnersBracket, matchId, loserTeam);

    const nextGrandFinal = this.populateGrandFinal(grandFinal, nextWinnersBracket.champion, nextLosersBracket?.champion ?? null);

    return { winnersBracket: nextWinnersBracket, losersBracket: nextLosersBracket, grandFinal: nextGrandFinal };
  }

  // Losers Bracket Progression — records a result, advances the winner
  // into the next Losers Bracket round (or, on the Losers Final, stamps
  // losersBracket.champion), and eliminates the loser structurally: they're
  // simply never written into any further match, anywhere — the same
  // "elimination is implicit in bracket shape" precedent the existing
  // single-elimination bracket already established. Once losersBracket.
  // champion is known, populates Grand Final Game 1 if the Winners Bracket
  // champion is also already known (same auto-populate precedent
  // updateWinnersBracket above uses).
  // returns: { losersBracket, grandFinal } (never mutates the objects passed in).
  updateLosersBracket(losersBracket, winnersBracket, grandFinal, matchId, result) {
    const validation = losersAdvancementService.validateAdvancement(losersBracket, matchId, result);
    if (!validation.valid) {
      throw new Error(validation.errors.join(" "));
    }

    let found = null;
    for (let roundIndex = 0; roundIndex < losersBracket.rounds.length; roundIndex++) {
      const match = losersBracket.rounds[roundIndex].matches.find((m) => m.id === matchId);
      if (match) {
        found = { match, roundIndex };
        break;
      }
    }

    const { scoreA, scoreB, winnerId } = result;
    if (scoreA === "" || scoreB === "" || scoreA == null || scoreB == null) {
      throw new Error("Enter a score for both teams.");
    }
    const numA = Number(scoreA);
    const numB = Number(scoreB);
    if (!Number.isFinite(numA) || !Number.isFinite(numB) || numA < 0 || numB < 0) {
      throw new Error("Scores can't be negative.");
    }
    if (winnerId !== found.match.teamA.participantId && winnerId !== found.match.teamB.participantId) {
      throw new Error("Winner must be one of this match's two teams.");
    }
    const winnerTeam = winnerId === found.match.teamA.participantId ? found.match.teamA : found.match.teamB;
    const loserTeam = winnerTeam === found.match.teamA ? found.match.teamB : found.match.teamA;
    // loserTeam is deliberately unused beyond this point — a Losers Bracket
    // loss is a second loss, so this team is eliminated: no destination, no
    // further seat, anywhere. That omission IS the elimination.

    const updatedMatch = {
      ...losersAdvancementService.updateMatchStatus(found.match, "completed"),
      score: { teamA: numA, teamB: numB },
      winner: winnerId,
      completedAt: Date.now(),
    };

    let rounds = losersBracket.rounds.map((r, i) => {
      if (i !== found.roundIndex) return r;
      const matches = r.matches.map((m) => (m.id === updatedMatch.id ? updatedMatch : m));
      return { ...r, matches };
    });
    rounds = losersAdvancementService.advanceWinner({ rounds }, matchId, winnerTeam);

    let nextLosersBracket = { ...losersBracket, rounds };
    const finalRound = rounds[rounds.length - 1];
    if (losersAdvancementService.isRoundComplete(finalRound) && found.roundIndex === rounds.length - 1) {
      nextLosersBracket = { ...nextLosersBracket, champion: winnerTeam, runnerUp: loserTeam };
    }

    const allMatches = rounds.flatMap((r) => r.matches);
    if (allMatches.every((m) => m.status === "completed")) {
      nextLosersBracket = { ...nextLosersBracket, status: "completed", completedAt: Date.now() };
    } else {
      nextLosersBracket = { ...nextLosersBracket, status: allMatches.some((m) => m.status === "inProgress" || m.status === "completed") ? "running" : "ready" };
    }

    const nextGrandFinal = this.populateGrandFinal(grandFinal, winnersBracket?.champion ?? null, nextLosersBracket.champion);

    return { losersBracket: nextLosersBracket, grandFinal: nextGrandFinal };
  }

  // A team's elimination is structural (no seat exists for them anywhere
  // once they take their second loss — see this file's header comment), so
  // this is a pure, on-demand DERIVATION for display purposes only (the
  // Bracket tab's "Eliminated" badge — see TournamentBracketView.jsx),
  // never a stored field and never consulted by any advancement/seating
  // logic above. Counts recorded losses per participant across every
  // completed Winners Bracket, Losers Bracket, and Grand Final (game1 +
  // game2) match — eliminated the moment a participant reaches 2. Returns
  // a Set<participantId>.
  getEliminatedParticipants(deBracket) {
    const losses = new Map();
    const tally = (match) => {
      if (!match || match.status !== "completed" || !match.teamA || !match.teamB || !match.winner) return;
      const loserId = match.winner === match.teamA.participantId ? match.teamB.participantId : match.teamA.participantId;
      losses.set(loserId, (losses.get(loserId) || 0) + 1);
    };
    deBracket.winnersBracket.rounds.forEach((r) => r.matches.forEach(tally));
    deBracket.losersBracket.rounds.forEach((r) => r.matches.forEach(tally));
    tally(deBracket.grandFinal.game1);
    tally(deBracket.grandFinal.game2);
    const eliminated = new Set();
    for (const [participantId, count] of losses) {
      if (count >= 2) eliminated.add(participantId);
    }
    return eliminated;
  }
}

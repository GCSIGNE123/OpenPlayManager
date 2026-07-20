// The one real QualificationService implementation — see
// QualificationService.js for the shared interface this conforms to.
// Deliberately format-agnostic despite living next to the Round Robin
// engines: it never re-derives a ranking itself, it only asks the given
// `engine` for each pool's already-computed standings (engine.getStandings
// (tournament, poolId), the same call the Standings tab makes) and slices
// off the top N. Any future pooled format reuses this unchanged as long as
// its engine implements getStandings the same way.
//
// Pool Qualification Engine — see PROJECT.md. Qualification is finalized
// PER POOL, independent of sibling pools: a pool's own rows read
// "qualified"/"eliminated" the moment THAT pool completes, even while a
// sibling pool is still mid-match and reads "pending". The aggregate
// `qualifiedTeams`/`playoffSize` (what bracket generation actually
// consumes) still requires every pool done — a cross-pool bracket seed
// list isn't meaningful until every pool's numbers are final — so `ready`
// keeps its pre-existing meaning/contract for that one consumer
// (PlayoffBracketGenerator.generateBracket), unchanged.
import { QualificationService } from "./QualificationService.js";
import { exactStageName } from "./playoffStages.js";

export class PoolQualificationService extends QualificationService {
  // "A pool is considered complete only when every scheduled match has
  // been completed" — reuses the pool's own `status` field (already
  // computed by lib/tournamentModel.js's computePoolStatus off real match
  // statuses; not re-derived here) rather than re-walking matches itself.
  isPoolComplete(pool) {
    return pool.status === "completed";
  }

  // standings: StandingsRow[] (from engine.getStandings — ranking/tie-break
  // logic lives there, never duplicated here). Returns the same rows with
  // a qualificationStatus tag: "pending" whenever the pool itself isn't
  // done yet (a provisional "top N" could still change), otherwise
  // "qualified"/"eliminated" by rank vs. qualifiersPerPool.
  getQualificationStatus(pool, standings, qualifiersPerPool) {
    if (!this.isPoolComplete(pool)) {
      return standings.map((row) => ({ ...row, qualificationStatus: "pending", qualified: false }));
    }
    return standings.map((row) => {
      const qualified = row.rank <= qualifiersPerPool;
      return { ...row, qualificationStatus: qualified ? "qualified" : "eliminated", qualified };
    });
  }

  // Every row across every pool currently marked "qualified" — real
  // (finalized) results only, since a pool still "pending" never produces
  // a qualified row in the first place.
  getQualifiedParticipants(tournament, engine) {
    return this.determineQualifiers(tournament, engine).pools.flatMap((p) => p.rows.filter((r) => r.qualificationStatus === "qualified"));
  }

  getEliminatedParticipants(tournament, engine) {
    return this.determineQualifiers(tournament, engine).pools.flatMap((p) => p.rows.filter((r) => r.qualificationStatus === "eliminated"));
  }

  // Validates a proposed qualifiers-per-pool value against the tournament's
  // actual pools — reused at both tournament creation (buildAndSave
  // RoundRobinTournament) and Settings-update time (TournamentRulesService),
  // rather than each call site re-deriving these same two rules.
  validateQualifiers(pools, qualifiersPerPool, playoffEnabled = true) {
    if (playoffEnabled && !(qualifiersPerPool >= 1)) {
      throw new Error("At least one qualifier per pool is required when playoffs are enabled.");
    }
    const smallestPool = Math.min(...pools.map((p) => p.entrants.length));
    if (qualifiersPerPool > smallestPool) {
      throw new Error(`Qualifiers Per Pool (${qualifiersPerPool}) can't exceed the smallest pool's size (${smallestPool}).`);
    }
  }

  // The full picture: every pool's own standings+status, plus the
  // aggregate cross-pool qualifiedTeams list (only populated once every
  // pool is complete — see file header). `ready` is that same "all pools
  // done" flag, kept under its pre-existing name for
  // PlayoffBracketGenerator's existing `!qualification.ready`
  // check.
  determineQualifiers(tournament, engine) {
    const qualifiersPerPool = tournament.advancesPerPool ?? 1;
    const pools = tournament.pools.map((pool) => {
      const standings = engine.getStandings(tournament, pool.id);
      const rows = this.getQualificationStatus(pool, standings, qualifiersPerPool);
      return { poolId: pool.id, poolLabel: pool.label, complete: this.isPoolComplete(pool), rows };
    });

    const ready = pools.every((p) => p.complete);
    const qualifiedTeams = ready
      ? pools.flatMap((p) =>
          p.rows
            .filter((r) => r.qualificationStatus === "qualified")
            .map((r) => ({ poolId: p.poolId, poolLabel: p.poolLabel, rank: r.rank, participantId: r.participantId, label: r.label }))
        )
      : [];

    return { ready, pools, qualifiedTeams, playoffSize: ready ? this.calculatePlayoffSize(qualifiedTeams.length) : null };
  }

  // Maps a qualifier count onto the bracket size it implies. Counts that
  // aren't one of the four called-out sizes still get a usable label
  // (a generic "N-Team Playoff") rather than nothing — Custom "teams
  // advancing" values won't always land on a power of two.
  calculatePlayoffSize(qualifiedCount) {
    return { count: qualifiedCount, stage: exactStageName(qualifiedCount) ?? `${qualifiedCount}-Team Playoff` };
  }

  getQualifiedTeams(tournament, engine) {
    return this.determineQualifiers(tournament, engine).qualifiedTeams;
  }
}

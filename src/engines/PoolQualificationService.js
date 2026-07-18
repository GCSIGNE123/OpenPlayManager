// The one real QualificationService implementation — see
// QualificationService.js for the shared interface this conforms to.
// Deliberately format-agnostic despite living next to the Round Robin
// engines: it never re-derives a ranking itself, it only asks the given
// `engine` for each pool's already-computed standings (engine.getStandings
// (tournament, poolId), the same call the Standings tab makes) and slices
// off the top N. Any future pooled format reuses this unchanged as long as
// its engine implements getStandings the same way.
import { QualificationService } from "./QualificationService.js";

const STAGE_BY_COUNT = {
  2: "Championship Match",
  4: "Semifinals",
  8: "Quarterfinals",
  16: "Round of 16",
};

const NOT_READY = { ready: false, pools: [], qualifiedTeams: [], playoffSize: null };

export class PoolQualificationService extends QualificationService {
  // Qualified teams only mean anything once every pool has actually
  // finished — with a pool still in progress, "top N" would be provisional
  // and could still change, so this returns an explicit "not ready" shape
  // rather than a misleading partial answer.
  determineQualifiers(tournament, engine) {
    if (tournament.status !== "completed") return NOT_READY;

    const advancesPerPool = tournament.advancesPerPool ?? 1;
    const pools = tournament.pools.map((pool) => {
      const standings = engine.getStandings(tournament, pool.id);
      const rows = standings.map((row) => ({ ...row, qualified: row.rank <= advancesPerPool }));
      return { poolId: pool.id, poolLabel: pool.label, rows };
    });

    const qualifiedTeams = pools.flatMap((p) =>
      p.rows
        .filter((r) => r.qualified)
        .map((r) => ({ poolId: p.poolId, poolLabel: p.poolLabel, rank: r.rank, participantId: r.participantId, label: r.label }))
    );

    return { ready: true, pools, qualifiedTeams, playoffSize: this.calculatePlayoffSize(qualifiedTeams.length) };
  }

  // Maps a qualifier count onto the bracket size it implies. Counts that
  // aren't one of the four called-out sizes still get a usable label
  // (a generic "N-Team Playoff") rather than nothing — Custom "teams
  // advancing" values won't always land on a power of two.
  calculatePlayoffSize(qualifiedCount) {
    return { count: qualifiedCount, stage: STAGE_BY_COUNT[qualifiedCount] ?? `${qualifiedCount}-Team Playoff` };
  }

  getQualifiedTeams(tournament, engine) {
    return this.determineQualifiers(tournament, engine).qualifiedTeams;
  }
}

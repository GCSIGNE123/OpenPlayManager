import { styles } from "../styles.js";
import { getTournamentEngine } from "../lib/tournament.js";

const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

const COLUMNS = [
  { key: "matchesPlayed", label: "MP" },
  { key: "wins", label: "W" },
  { key: "losses", label: "L" },
  { key: "winPct", label: "WIN %", format: (v) => `${Math.round(v * 100)}%` },
  { key: "pointsFor", label: "PF" },
  { key: "pointsAgainst", label: "PA" },
];

// One pool's own standings table — pure derived data, recomputed from that
// pool's own rounds on every render (see RoundRobinStandingsService), so
// nothing here needs local state or a manual refresh: a match result saved
// anywhere in the Dashboard flows straight through as a new `tournament`
// (and thus `pool`) prop. Standings are never combined across pools — each
// pool is a fully independent Round Robin.
function PoolStandingsTable({ tournament, pool, showHeading }) {
  const standings = getTournamentEngine(tournament.format).getStandings(tournament, pool.id);
  // Medals only mean something once at least one match has actually been
  // decided — with zero matches played, ranks 1-3 are just insertion order
  // (everyone tied at 0), not a real podium.
  const anyMatchesPlayed = standings.some((r) => r.matchesPlayed > 0);
  // Once a pool is completed, no further results can be recorded for it
  // (see RoundRobinEngine.updateMatchResult's per-pool lock), so its
  // standings are already final — "frozen" simply falls out of that
  // validation, nothing extra to do here beyond labeling it.
  const isComplete = pool.status === "completed";

  return (
    <div style={styles.poolScheduleBlock}>
      <div style={styles.standingsHeaderRow}>
        {showHeading && <h3 style={styles.tSubheading}>{pool.label}</h3>}
        {isComplete && <span style={styles.tCompleteBadge}>{showHeading ? "Pool Complete" : "Tournament Complete"}</span>}
      </div>
      <div style={styles.tTableScroll}>
        <table style={styles.tTable}>
          <thead>
            <tr style={styles.tTableHeadRow}>
              <th style={styles.tTableHeadCell}>#</th>
              <th style={{ ...styles.tTableHeadCell, textAlign: "left" }}>
                {tournament.mode === "doubles" ? "Team" : "Player"}
              </th>
              {COLUMNS.map((c) => (
                <th key={c.key} style={styles.tTableHeadCell}>
                  {c.label}
                </th>
              ))}
              <th style={styles.tTableHeadCell}>+/-</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => (
              <tr key={row.participantId} style={styles.tTableRow(anyMatchesPlayed ? row.rank : 99)}>
                <td style={styles.tTableCell}>{row.rank}</td>
                <td style={styles.tTableNameCell}>
                  {anyMatchesPlayed && MEDALS[row.rank] && <span aria-hidden="true">{MEDALS[row.rank]}</span>}
                  {row.label}
                </td>
                {COLUMNS.map((c) => (
                  <td key={c.key} style={styles.tTableCell}>
                    {c.format ? c.format(row[c.key]) : row[c.key]}
                  </td>
                ))}
                <td style={styles.tTableDiffCell(row.pointDiff)}>
                  {row.pointDiff > 0 ? `+${row.pointDiff}` : row.pointDiff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Standings tab for Tournament-type sessions — see PROJECT.md's Round Robin
// Standings / Round Robin Pool Support sections. `selectedPool` ('all' |
// poolId, owned by the parent Dashboard so it stays in sync with the
// Schedule tab's pool filter) picks whether one pool's table renders or
// every pool's table stacks in sequence. Applies to Round Robin only, per
// Round Robin Standings' original scope — other formats don't have ranking
// logic yet.
export default function TournamentStandingsView({ tournament, loading, selectedPool }) {
  if (loading) return <p style={styles.tControlHint}>Loading tournament…</p>;
  if (!tournament) {
    return <div style={styles.tEmptyState}>Generate a schedule from the Schedule tab to see standings here.</div>;
  }
  if (tournament.format !== "roundRobin") {
    return <div style={styles.tEmptyState}>Standings aren't available for this tournament format yet.</div>;
  }

  const pools = tournament.pools;
  const visiblePools = selectedPool === "all" ? pools : pools.filter((p) => p.id === selectedPool);

  return (
    <div>
      <div style={styles.standingsHeaderRow}>
        <h2 style={styles.tSectionHeading}>Standings</h2>
        {pools.length > 1 && tournament.status === "completed" && (
          <span style={styles.tCompleteBadge}>Tournament Complete</span>
        )}
      </div>
      {visiblePools.map((pool) => (
        <PoolStandingsTable key={pool.id} tournament={tournament} pool={pool} showHeading={pools.length > 1} />
      ))}
      <p style={styles.tControlHint}>
        Ranked by Wins, then Win %, then Point Differential, then Points For. Matches still pending or in progress
        don't count toward a record yet.
      </p>
    </div>
  );
}

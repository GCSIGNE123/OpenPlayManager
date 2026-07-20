import { styles } from "../styles.js";
import { getTournamentEngine } from "../lib/tournament.js";
import { PoolQualificationService } from "../engines/PoolQualificationService.js";
import SectionLabel from "./SectionLabel.jsx";

const qualificationService = new PoolQualificationService();

const STATUS_ICONS = { qualified: "🟢", eliminated: "🔴", pending: "⏳" };
const STATUS_LABELS = { qualified: "Qualified", eliminated: "Eliminated", pending: "Pending" };

// Qualification tab — see PROJECT.md's Pool Qualification Engine section.
// PoolQualificationService is format-agnostic (any tournament with a
// `pools` array works), but this view is only wired up for Round Robin so
// far, matching the Standings tab's own scope. Qualification is pure
// derived data recomputed on every render (same pattern as Standings) —
// nothing here is persisted, so there's nothing to keep in sync.
//
// Every pool renders live, independently of its siblings — a pool that's
// already finished shows real Qualified/Eliminated the moment IT completes,
// even while another pool is still mid-match and shows Pending. The
// Overall Qualifiers/Playoff Stage summary only appears once every pool is
// done (result.ready), since a cross-pool seed list isn't meaningful until
// then.
export default function TournamentQualificationView({ tournament, loading }) {
  if (loading) return <p style={styles.editHint}>Loading tournament…</p>;
  if (!tournament) {
    return <div style={styles.placeholderCard}>Generate a schedule from the Schedule tab to see qualification here.</div>;
  }
  if (tournament.format !== "roundRobin") {
    return <div style={styles.placeholderCard}>Qualification isn't available for this tournament format yet.</div>;
  }

  const engine = getTournamentEngine(tournament.format);
  const result = qualificationService.determineQualifiers(tournament, engine);

  return (
    <div>
      <SectionLabel>Qualification</SectionLabel>

      {result.ready ? (
        <div style={styles.sessionInfoCard}>
          <div style={styles.sessionInfoItem}>
            <span style={styles.sessionInfoLabel}>Teams Advancing Per Pool</span>
            <span style={styles.sessionInfoValue}>{tournament.advancesPerPool ?? 1}</span>
          </div>
          <div style={styles.sessionInfoItem}>
            <span style={styles.sessionInfoLabel}>Qualified Teams</span>
            <span style={styles.sessionInfoValue}>{result.playoffSize.count}</span>
          </div>
          <div style={styles.sessionInfoItem}>
            <span style={styles.sessionInfoLabel}>Playoff Stage</span>
            <span style={styles.sessionInfoValue}>{result.playoffSize.stage}</span>
          </div>
        </div>
      ) : (
        <p style={styles.editHint}>
          Qualifiers finalize pool by pool as each one finishes — a pool still in progress shows ⏳ Pending until then.
        </p>
      )}

      {result.pools.map((pool) => (
        <div key={pool.poolId} style={styles.poolScheduleBlock}>
          <h3 style={styles.poolHeading}>
            {pool.poolLabel} {pool.complete ? "" : "— in progress"}
          </h3>
          <div style={styles.tournamentStandingsScroll}>
            <table style={styles.tournamentStandingsTable}>
              <thead>
                <tr style={styles.tournamentStandingsHeadRow}>
                  <th style={styles.tournamentStandingsHeadCell}>Rank</th>
                  <th style={{ ...styles.tournamentStandingsHeadCell, textAlign: "left" }}>
                    {tournament.mode === "doubles" ? "Team" : "Player"}
                  </th>
                  <th style={styles.tournamentStandingsHeadCell}>Qualification Status</th>
                </tr>
              </thead>
              <tbody>
                {pool.rows.map((row) => (
                  <tr key={row.participantId} style={styles.tournamentStandingsRow(row.qualified ? row.rank : 99)}>
                    <td style={styles.tournamentStandingsCell}>{row.rank}</td>
                    <td style={styles.tournamentStandingsNameCell}>{row.label}</td>
                    <td style={styles.tournamentStandingsCell}>
                      <span style={styles.qualificationTag(row.qualificationStatus)}>
                        {STATUS_ICONS[row.qualificationStatus]} {STATUS_LABELS[row.qualificationStatus]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {result.ready && (
        <>
          <h3 style={styles.poolHeading}>Overall Qualifiers</h3>
          <ul style={styles.qualifiersList}>
            {result.qualifiedTeams.map((q) => (
              <li key={q.participantId} style={styles.qualifiersListItem}>
                <span>{q.label}</span>
                <span style={styles.qualifiersListPool}>
                  {q.poolLabel} · Rank {q.rank}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

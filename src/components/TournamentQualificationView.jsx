import { styles } from "../styles.js";
import { getTournamentEngine } from "../lib/tournament.js";
import { PoolQualificationService } from "../engines/PoolQualificationService.js";
import SectionLabel from "./SectionLabel.jsx";

const qualificationService = new PoolQualificationService();

// Qualification tab — see PROJECT.md's Playoff Qualification section.
// PoolQualificationService is format-agnostic (any tournament with a
// `pools` array works), but this view is only wired up for Round Robin so
// far, matching the Standings tab's own scope. Qualified teams are pure
// derived data recomputed on every render (same pattern as Standings) —
// nothing here is persisted, so there's nothing to keep in sync.
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

  if (!result.ready) {
    return (
      <div>
        <SectionLabel>Qualification</SectionLabel>
        <div style={styles.placeholderCard}>
          Qualified teams are determined once every pool has finished. Play out the remaining matches on the Schedule tab
          to see who advances.
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionLabel>Qualification</SectionLabel>
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

      {result.pools.map((pool) => (
        <div key={pool.poolId} style={styles.poolScheduleBlock}>
          <h3 style={styles.poolHeading}>{pool.poolLabel}</h3>
          <div style={styles.tournamentStandingsScroll}>
            <table style={styles.tournamentStandingsTable}>
              <thead>
                <tr style={styles.tournamentStandingsHeadRow}>
                  <th style={styles.tournamentStandingsHeadCell}>Rank</th>
                  <th style={{ ...styles.tournamentStandingsHeadCell, textAlign: "left" }}>
                    {tournament.mode === "doubles" ? "Team" : "Player"}
                  </th>
                  <th style={styles.tournamentStandingsHeadCell}>Result</th>
                </tr>
              </thead>
              <tbody>
                {pool.rows.map((row) => (
                  <tr key={row.participantId} style={styles.tournamentStandingsRow(row.qualified ? row.rank : 99)}>
                    <td style={styles.tournamentStandingsCell}>{row.rank}</td>
                    <td style={styles.tournamentStandingsNameCell}>{row.label}</td>
                    <td style={styles.tournamentStandingsCell}>
                      <span style={styles.qualificationTag(row.qualified)}>{row.qualified ? "Qualified" : "Eliminated"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

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
    </div>
  );
}

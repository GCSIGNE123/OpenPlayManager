import { styles } from "../styles.js";
import { getTournamentEngine } from "../lib/tournament.js";
import SectionLabel from "./SectionLabel.jsx";

const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

const COLUMNS = [
  { key: "matchesPlayed", label: "MP" },
  { key: "wins", label: "W" },
  { key: "losses", label: "L" },
  { key: "winPct", label: "WIN %", format: (v) => `${Math.round(v * 100)}%` },
  { key: "pointsFor", label: "PF" },
  { key: "pointsAgainst", label: "PA" },
];

// Live Round Robin standings — pure derived data, recomputed from
// `tournament` on every render (see RoundRobinStandingsService), so this
// component needs no state of its own and no manual refresh: a match
// result saved anywhere in the Dashboard flows straight through as a new
// `tournament` prop. Applies to Round Robin only, per Round Robin
// Standings' scope — other formats don't have ranking logic yet.
export default function TournamentStandingsView({ tournament, loading }) {
  if (loading) return <p style={styles.editHint}>Loading tournament…</p>;
  if (!tournament) {
    return <div style={styles.placeholderCard}>Generate a schedule from the Schedule tab to see standings here.</div>;
  }
  if (tournament.format !== "roundRobin") {
    return <div style={styles.placeholderCard}>Standings aren't available for this tournament format yet.</div>;
  }

  const standings = getTournamentEngine(tournament.format).getStandings(tournament);
  // Medals only mean something once at least one match has actually been
  // decided — with zero matches played, ranks 1-3 are just insertion order
  // (everyone tied at 0), not a real podium.
  const anyMatchesPlayed = standings.some((r) => r.matchesPlayed > 0);

  return (
    <div>
      <SectionLabel>Standings</SectionLabel>
      <div style={styles.tournamentStandingsScroll}>
        <table style={styles.tournamentStandingsTable}>
          <thead>
            <tr style={styles.tournamentStandingsHeadRow}>
              <th style={styles.tournamentStandingsHeadCell}>#</th>
              <th style={{ ...styles.tournamentStandingsHeadCell, textAlign: "left" }}>
                {tournament.mode === "doubles" ? "Team" : "Player"}
              </th>
              {COLUMNS.map((c) => (
                <th key={c.key} style={styles.tournamentStandingsHeadCell}>
                  {c.label}
                </th>
              ))}
              <th style={styles.tournamentStandingsHeadCell}>+/-</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => (
              <tr key={row.participantId} style={styles.tournamentStandingsRow(anyMatchesPlayed ? row.rank : 99)}>
                <td style={styles.tournamentStandingsCell}>{row.rank}</td>
                <td style={styles.tournamentStandingsNameCell}>
                  {anyMatchesPlayed && MEDALS[row.rank] && <span aria-hidden="true">{MEDALS[row.rank]}</span>}
                  {row.label}
                </td>
                {COLUMNS.map((c) => (
                  <td key={c.key} style={styles.tournamentStandingsCell}>
                    {c.format ? c.format(row[c.key]) : row[c.key]}
                  </td>
                ))}
                <td style={styles.tournamentStandingsDiffCell(row.pointDiff)}>
                  {row.pointDiff > 0 ? `+${row.pointDiff}` : row.pointDiff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={styles.standingsNote}>
        Ranked by Wins, then Win %, then Point Differential, then Points For. Matches still pending or in progress
        don't count toward a record yet.
      </p>
    </div>
  );
}

import { styles } from "../styles.js";
import SectionLabel from "./SectionLabel.jsx";

// Participants tab — see PROJECT.md/FEATURES.md. Read-only roster of every
// entrant currently in the tournament, one row per Participant (a single
// player for Singles, a pre-formed 2-player team for Doubles — see
// tournamentModel.js's makeParticipant). Purely a display of data that
// already exists (pool.entrants for Round Robin, tournament.entrants for
// standalone Double Elimination) — no editing here; adding/removing players
// happens via Check In, same as before this tab existed.
function EntrantRow({ entrant, index, mode, players }) {
  return (
    <tr style={styles.tournamentStandingsRow(99)}>
      <td style={styles.tournamentStandingsCell}>{index + 1}</td>
      <td style={styles.tournamentStandingsNameCell}>{entrant.label}</td>
      <td style={styles.tournamentStandingsCell}>
        {entrant.playerIds.map((id) => (
          <span key={id} style={{ marginRight: 4 }}>
            <span style={styles.skillTag(players[id]?.skill)}>{players[id]?.skill === "intermediate" ? "INT" : "BEG"}</span>
          </span>
        ))}
      </td>
      <td style={styles.tournamentStandingsCell}>{entrant.seed ?? "—"}</td>
    </tr>
  );
}

function EntrantTable({ entrants, mode, players, showHeading, heading }) {
  return (
    <div style={styles.poolScheduleBlock}>
      {showHeading && <h3 style={styles.poolHeading}>{heading}</h3>}
      <p style={styles.editHint}>
        {entrants.length} {mode === "doubles" ? "team" : "player"}
        {entrants.length === 1 ? "" : "s"}.
      </p>
      <div style={styles.tournamentStandingsScroll}>
        <table style={styles.tournamentStandingsTable}>
          <thead>
            <tr style={styles.tournamentStandingsHeadRow}>
              <th style={styles.tournamentStandingsHeadCell}>#</th>
              <th style={{ ...styles.tournamentStandingsHeadCell, textAlign: "left" }}>
                {mode === "doubles" ? "Team" : "Player"}
              </th>
              <th style={styles.tournamentStandingsHeadCell}>Skill</th>
              <th style={styles.tournamentStandingsHeadCell}>Seed</th>
            </tr>
          </thead>
          <tbody>
            {entrants.map((entrant, i) => (
              <EntrantRow key={entrant.id} entrant={entrant} index={i} mode={mode} players={players} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// `state` (for state.players — name/skill lookup by id) is threaded in the
// same way TournamentScheduleView already receives it. Round Robin (and any
// tournament with pools) shows one table per pool; standalone Double
// Elimination (no pools — see tournamentModel.js's makeTournament `entrants`
// field) shows its single flat entrant list instead.
export default function TournamentParticipantsView({ state, tournament, loading }) {
  if (loading) return <p style={styles.editHint}>Loading tournament…</p>;
  if (!tournament) {
    return <div style={styles.placeholderCard}>Generate a schedule from the Schedule tab to see participants here.</div>;
  }

  const players = state.players || {};

  if (tournament.format === "doubleElimination") {
    const entrants = tournament.entrants || [];
    return (
      <div>
        <SectionLabel>Participants</SectionLabel>
        <EntrantTable entrants={entrants} mode={tournament.mode} players={players} showHeading={false} />
      </div>
    );
  }

  const pools = tournament.pools || [];
  return (
    <div>
      <SectionLabel>Participants</SectionLabel>
      {pools.map((pool) => (
        <EntrantTable
          key={pool.id}
          entrants={pool.entrants}
          mode={tournament.mode}
          players={players}
          showHeading={pools.length > 1}
          heading={pool.label}
        />
      ))}
    </div>
  );
}

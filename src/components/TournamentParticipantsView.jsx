import { styles } from "../styles.js";
import TeamSetupPanel from "./TeamSetupPanel.jsx";

// Participants tab — see PROJECT.md/FEATURES.md. Read-only roster of every
// entrant currently in the tournament, one row per Participant (a single
// player for Singles, a pre-formed 2-player team for Doubles — see
// tournamentModel.js's makeParticipant). Purely a display of data that
// already exists (pool.entrants for Round Robin, tournament.entrants for
// standalone Double Elimination) — no editing here; adding/removing players
// happens via Check In, same as before this tab existed.
function EntrantRow({ entrant, index, mode, players }) {
  return (
    <tr style={styles.tTableRow(99)}>
      <td style={styles.tTableCell}>{index + 1}</td>
      <td style={styles.tTableNameCell}>{entrant.label}</td>
      <td style={styles.tTableCell}>
        {entrant.playerIds.map((id) => (
          <span key={id} style={{ marginRight: 4 }}>
            <span style={styles.tSkillTag(players[id]?.skill)}>{players[id]?.skill === "intermediate" ? "INT" : "BEG"}</span>
          </span>
        ))}
      </td>
      <td style={styles.tTableCell}>{entrant.seed ?? "—"}</td>
    </tr>
  );
}

function EntrantTable({ entrants, mode, players, showHeading, heading }) {
  return (
    <div style={styles.poolScheduleBlock}>
      {showHeading && <h3 style={styles.tSubheading}>{heading}</h3>}
      <p style={styles.tControlHint}>
        {entrants.length} {mode === "doubles" ? "team" : "player"}
        {entrants.length === 1 ? "" : "s"}.
      </p>
      <div style={styles.tTableScroll}>
        <table style={styles.tTable}>
          <thead>
            <tr style={styles.tTableHeadRow}>
              <th style={styles.tTableHeadCell}>#</th>
              <th style={{ ...styles.tTableHeadCell, textAlign: "left" }}>
                {mode === "doubles" ? "Team" : "Player"}
              </th>
              <th style={styles.tTableHeadCell}>Skill</th>
              <th style={styles.tTableHeadCell}>Seed</th>
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
// Custom Doubles Team Assignment — see PROJECT.md/FEATURES.md and
// TeamSetupPanel.jsx's own header comment. `mode` here is the ORGANIZER'S
// currently-selected Schedule-tab mode (Singles/Doubles, before Generate has
// run) — TournamentScheduleView already owns that toggle; it's threaded
// through so this tab's empty-state can show team pairing UI only when
// Doubles is selected, without duplicating the toggle itself.
export default function TournamentParticipantsView({ state, tournament, loading, mode, onSetPartner, onClearPartner }) {
  if (loading) return <p style={styles.tControlHint}>Loading tournament…</p>;
  if (!tournament) {
    if (mode === "doubles") {
      return <TeamSetupPanel players={state.players} state={state} onSetPartner={onSetPartner} onClearPartner={onClearPartner} />;
    }
    return <div style={styles.tEmptyState}>Generate a schedule from the Schedule tab to see participants here.</div>;
  }

  const players = state.players || {};

  if (tournament.format === "doubleElimination") {
    const entrants = tournament.entrants || [];
    return (
      <div>
        <h2 style={styles.tSectionHeading}>Participants</h2>
        <EntrantTable entrants={entrants} mode={tournament.mode} players={players} showHeading={false} />
      </div>
    );
  }

  const pools = tournament.pools || [];
  return (
    <div>
      <h2 style={styles.tSectionHeading}>Participants</h2>
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

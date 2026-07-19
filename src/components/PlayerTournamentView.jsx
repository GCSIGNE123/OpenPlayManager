import { styles } from "../styles.js";
import SectionLabel from "./SectionLabel.jsx";

function formatCompletionTime(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const STATUS_LABELS = { pending: "Pending", inProgress: "In Progress", completed: "Completed" };

function MatchRow({ match }) {
  return (
    <div style={styles.queueItem}>
      <span style={styles.queueName}>
        {match.round} · vs {match.opponent}
      </span>
      <span style={styles.editHint}>{match.court != null ? `Court ${match.court}` : "Court TBD"}</span>
      <span style={styles.matchStatusBadge(match.status)}>{STATUS_LABELS[match.status] ?? match.status}</span>
      {match.score && <span style={styles.queueGames}>{match.score}</span>}
    </div>
  );
}

// Renders one participant's read-only Player Portal view — My Tournament /
// My Matches / My Results / Live Bracket — see PROJECT.md's Player Portal
// section. Every prop here is already-derived data from
// PlayerPortalService; this component itself never imports a single
// save*/mutate function, same "read-only by construction" precedent
// TournamentDisplayView already set.
export default function PlayerTournamentView({ summary, matches, results, bracketPath }) {
  return (
    <div>
      <SectionLabel>My Tournament</SectionLabel>
      <div style={styles.sessionInfoCard}>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Tournament Name</span>
          <span style={styles.sessionInfoValue}>{summary.tournamentName}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Event</span>
          <span style={styles.sessionInfoValue}>{summary.event}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Current Status</span>
          <span style={styles.sessionInfoValue}>{summary.status}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Current Pool</span>
          <span style={styles.sessionInfoValue}>{summary.poolLabel}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Current Rank</span>
          <span style={styles.sessionInfoValue}>{summary.rank ?? "—"}</span>
        </div>
      </div>

      <SectionLabel>My Matches</SectionLabel>
      <p style={styles.editHint}>Upcoming</p>
      {matches.upcoming.length === 0 ? (
        <p style={styles.emptyQueue}>No upcoming matches right now.</p>
      ) : (
        <ul style={styles.queueList}>
          {matches.upcoming.map((m) => (
            <MatchRow key={m.id} match={m} />
          ))}
        </ul>
      )}
      <p style={{ ...styles.editHint, marginTop: 10 }}>Completed</p>
      {matches.completed.length === 0 ? (
        <p style={styles.emptyQueue}>No completed matches yet.</p>
      ) : (
        <ul style={styles.queueList}>
          {matches.completed.map((m) => (
            <MatchRow key={m.id} match={m} />
          ))}
        </ul>
      )}

      <SectionLabel>My Results</SectionLabel>
      <div style={styles.sessionInfoCard}>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Wins</span>
          <span style={styles.sessionInfoValue}>{results.wins}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Losses</span>
          <span style={styles.sessionInfoValue}>{results.losses}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Point Differential</span>
          <span style={styles.sessionInfoValue}>{results.pointDiff > 0 ? `+${results.pointDiff}` : results.pointDiff}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Standing</span>
          <span style={styles.sessionInfoValue}>
            {results.standing} of {results.poolSize}
          </span>
        </div>
      </div>

      {bracketPath && (
        <>
          <SectionLabel>Live Bracket</SectionLabel>
          {bracketPath.isChampion && <p style={styles.confirmMsg}>🥇 Champion!</p>}
          {bracketPath.isRunnerUp && <p style={styles.editHint}>🥈 Runner-up</p>}
          {bracketPath.nextOpponent && (
            <p style={styles.confirmMsg}>Next opponent: {bracketPath.nextOpponent}</p>
          )}
          <ul style={styles.queueList}>
            {bracketPath.path.map((leg, i) => (
              <li key={i} style={styles.queueItem}>
                <span style={styles.queueName}>
                  {leg.roundName} · vs {leg.opponent}
                </span>
                <span style={styles.editHint}>{leg.court != null ? `Court ${leg.court}` : "Court TBD"}</span>
                <span style={styles.matchStatusBadge(leg.status)}>{STATUS_LABELS[leg.status] ?? leg.status}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

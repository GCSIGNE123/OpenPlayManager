import { styles } from "../styles.js";
import { buildQueueMatchups } from "../lib/utils.js";
import Avatar from "./Avatar.jsx";
import PlayerChip from "./PlayerChip.jsx";

export default function QueueList({ waitingPlayers }) {
  if (waitingPlayers.length === 0) {
    return <p style={styles.emptyQueue}>No one waiting right now — check in to join.</p>;
  }

  const { matchups, leftover } = buildQueueMatchups(waitingPlayers);

  return (
    <div>
      {matchups.map((m, i) => (
        <div key={i} style={styles.matchupCard(i === 0)}>
          <div style={styles.matchupHeader(i === 0)}>{i === 0 ? "Next up" : `Then · matchup ${i + 1}`}</div>
          <div style={styles.matchupTeams}>
            <div style={styles.matchupTeam}>
              {m.teamA.map((p) => (
                <PlayerChip key={p.id} player={p} />
              ))}
            </div>
            <span style={styles.matchupVs}>VS</span>
            <div style={styles.matchupTeam}>
              {m.teamB.map((p) => (
                <PlayerChip key={p.id} player={p} />
              ))}
            </div>
          </div>
        </div>
      ))}
      {leftover.length > 0 && (
        <>
          <div style={styles.matchupHeader(false)}>
            Waiting for {4 - leftover.length} more player{4 - leftover.length === 1 ? "" : "s"}
          </div>
          <ol style={styles.queueList}>
            {leftover.map((p, i) => (
              <li key={p.id} style={styles.queueItem}>
                <span style={styles.queueNum}>{i + 1}</span>
                <Avatar player={p} size={22} />
                <span style={styles.queueName}>{p.name}</span>
                {p.lastResult && (
                  <span style={styles.resultTag(p.lastResult)}>{p.lastResult === "win" ? "W" : "L"}</span>
                )}
                <span style={styles.queueGames}>
                  {p.games} game{p.games === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

import { Pause, Play, X } from "lucide-react";
import { styles } from "../styles.js";
import Avatar from "./Avatar.jsx";
import SectionLabel from "./SectionLabel.jsx";

// Manual roster controls for players not yet locked into an upcoming
// matchup: sit a player out (skipped — excluded from matchmaking but still
// visible and still counted as "waiting") or remove them from the session
// entirely. Players already in a next matchup aren't listed here — use
// Substitute on that matchup first to free them up.
export default function WaitingPlayersPanel({ players, onToggleSkip, onRemove }) {
  if (players.length === 0) return null;

  return (
    <>
      <SectionLabel>Waiting players ({players.length})</SectionLabel>
      <ul style={styles.rosterList}>
        {players.map((p) => (
          <li key={p.id} style={styles.rosterItem}>
            <Avatar player={p} size={26} />
            <span style={styles.queueName}>{p.name}</span>
            {p.skill && <span style={styles.skillTag(p.skill)}>{p.skill === "intermediate" ? "INT" : "BEG"}</span>}
            <button style={styles.skipToggleBtn(p.skipped)} onClick={() => onToggleSkip(p.id)}>
              {p.skipped ? <Play size={11} strokeWidth={2.5} /> : <Pause size={11} strokeWidth={2.5} />}
              {p.skipped ? "Sitting out" : "Skip"}
            </button>
            <button style={styles.rosterRemoveBtn} onClick={() => onRemove(p.id)} aria-label={`remove ${p.name}`}>
              <X size={11} strokeWidth={3} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

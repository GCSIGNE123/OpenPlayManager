import { Repeat, Undo2 } from "lucide-react";
import { styles } from "../styles.js";
import Avatar from "./Avatar.jsx";

export default function PlayerChip({ player, highlight, onSubClick, onMoveToQueueClick }) {
  if (!player) return null;
  return (
    <div style={styles.playerChip}>
      <Avatar player={player} />
      <span style={{ ...styles.teamName, ...(highlight ? { color: "var(--ink)" } : {}) }}>
        {player.name}
      </span>
      {player.skill && (
        <span style={styles.skillTag(player.skill)}>{player.skill === "intermediate" ? "INT" : "BEG"}</span>
      )}
      {onMoveToQueueClick && (
        <button
          style={styles.moveToQueueBtn}
          onClick={onMoveToQueueClick}
          aria-label={`move ${player.name} to queue`}
          title="Move to Queue — pull this player out of this matchup and back into the waiting queue"
        >
          <Undo2 size={11} strokeWidth={2.5} />
        </button>
      )}
      {onSubClick && (
        <button style={styles.subBtn} onClick={onSubClick} aria-label={`substitute ${player.name}`}>
          <Repeat size={11} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

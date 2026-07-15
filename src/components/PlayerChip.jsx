import { Repeat } from "lucide-react";
import { styles } from "../styles.js";
import Avatar from "./Avatar.jsx";

export default function PlayerChip({ player, highlight, onSubClick }) {
  if (!player) return null;
  return (
    <div style={styles.playerChip}>
      <Avatar player={player} />
      <span style={{ ...styles.teamName, ...(highlight ? { color: "var(--ink)" } : {}) }}>
        {player.name}
      </span>
      {onSubClick && (
        <button style={styles.subBtn} onClick={onSubClick} aria-label={`substitute ${player.name}`}>
          <Repeat size={11} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

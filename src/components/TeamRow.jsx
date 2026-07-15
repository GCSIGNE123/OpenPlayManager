import { Minus, Plus } from "lucide-react";
import { styles } from "../styles.js";
import PlayerChip from "./PlayerChip.jsx";

export default function TeamRow({ ids, players, score, onMinus, onPlus, readOnly, leading, onRequestSub }) {
  return (
    <div style={styles.teamRow}>
      <div style={styles.teamPlayers}>
        {ids.map((id) => (
          <PlayerChip
            key={id}
            player={players[id]}
            highlight={leading}
            onSubClick={onRequestSub ? () => onRequestSub(id) : null}
          />
        ))}
      </div>
      <div style={styles.scoreControl}>
        {!readOnly && (
          <button style={styles.scoreBtn} onClick={onMinus} aria-label="decrease score">
            <Minus size={14} strokeWidth={3} />
          </button>
        )}
        <span style={styles.scoreDigit}>{score}</span>
        {!readOnly && (
          <button style={styles.scoreBtn} onClick={onPlus} aria-label="increase score">
            <Plus size={14} strokeWidth={3} />
          </button>
        )}
      </div>
    </div>
  );
}

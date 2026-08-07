import { Minus, Plus, Trophy } from "lucide-react";
import { styles } from "../styles.js";
import PlayerChip from "./PlayerChip.jsx";

export default function TeamRow({ ids, players, score, onMinus, onPlus, readOnly, leading, onRequestSub, onDeclareWinner, onRequestCheckout, hideAvatar, hidePayment, startIndex }) {
  return (
    <div style={styles.teamRow}>
      <div style={styles.teamPlayers}>
        {ids.map((id, i) => (
          <PlayerChip
            key={id}
            player={players[id]}
            highlight={leading}
            onSubClick={onRequestSub ? () => onRequestSub(id) : null}
            onCheckoutClick={onRequestCheckout ? () => onRequestCheckout(id) : null}
            hideAvatar={hideAvatar}
            hidePayment={hidePayment}
            index={typeof startIndex === "number" ? startIndex + i : undefined}
          />
        ))}
      </div>
      {onDeclareWinner && (
        <button
          style={styles.declareWinnerBtn}
          onClick={onDeclareWinner}
          title="Skip point-by-point scoring — mark this team the winner, 11-0"
        >
          <Trophy size={12} strokeWidth={2.5} />
          Won
        </button>
      )}
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

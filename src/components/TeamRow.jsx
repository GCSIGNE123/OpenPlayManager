import { Minus, Plus, Trophy } from "lucide-react";
import { styles } from "../styles.js";
import PlayerChip, { scorerInfoFor } from "./PlayerChip.jsx";

// `showInfo` (Scorer tab only — CourtCard passes it alongside hideAvatar)
// adds the games-played badge and fixed-pair tag to each chip; every other
// caller leaves it unset and renders exactly as before.
export default function TeamRow({ ids, players, score, onMinus, onPlus, readOnly, leading, onRequestSub, onDeclareWinner, onRequestCheckout, hideAvatar, hidePayment, startIndex, showInfo }) {
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
            info={showInfo ? scorerInfoFor(players[id], players) : undefined}
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

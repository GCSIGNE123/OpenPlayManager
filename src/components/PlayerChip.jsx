import { LogOut, Repeat, Undo2 } from "lucide-react";
import { styles } from "../styles.js";
import Avatar from "./Avatar.jsx";

export default function PlayerChip({ player, highlight, onSubClick, onMoveToQueueClick, onCheckoutClick, hideAvatar, index }) {
  if (!player) return null;
  return (
    <div style={styles.playerChip}>
      {hideAvatar ? (
        typeof index === "number" && <span style={styles.playerChipIndex}>{index + 1}</span>
      ) : (
        <Avatar player={player} />
      )}
      <span style={{ ...styles.teamName, ...(hideAvatar ? styles.teamNameProminent : {}), ...(highlight ? { color: "var(--ink)" } : {}) }}>
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
      {onCheckoutClick && (
        // Player Checkout During Open Play — see PROJECT.md. Lets the
        // organizer check a player out WHILE they're on a live court: the
        // current match is left completely untouched (still plays out
        // normally to completion) — only their eligibility for whatever
        // comes after this match ends.
        <button
          style={styles.subBtn}
          onClick={onCheckoutClick}
          aria-label={`check out ${player.name}`}
          title="Check out — this match continues; no future matches will be generated for them"
        >
          <LogOut size={11} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

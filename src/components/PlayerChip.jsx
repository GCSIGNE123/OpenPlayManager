import { Link2, LogOut, Repeat, Undo2 } from "lucide-react";
import { styles } from "../styles.js";
import Avatar from "./Avatar.jsx";
import PaymentBadge from "./PaymentBadge.jsx";

// Scorer Player Info — the two facts a facilitator kept asking for beside
// every player on the Scorer tab: games played this session, and who their
// fixed partner is (Partner Requests, `partnerId`). Computed from data that
// already exists on the session record; nothing new is stored. Callers
// outside the Scorer (Live Board, TV, tournament courts) never pass `info`,
// so their chips are byte-for-byte unchanged.
export function scorerInfoFor(player, players) {
  if (!player) return null;
  const partner = player.partnerId ? players?.[player.partnerId] : null;
  return { games: player.games || 0, partnerName: partner?.name || null };
}

export function PlayerInfoBadges({ info }) {
  if (!info) return null;
  return (
    <>
      <span style={styles.gpBadge} title={`${info.games} game${info.games === 1 ? "" : "s"} played this session`}>
        GP {info.games}
      </span>
      {info.partnerName && (
        <span style={styles.pairTag} title={`Fixed partner — always teamed with ${info.partnerName}`}>
          <Link2 size={10} strokeWidth={2.5} />
          {info.partnerName}
        </span>
      )}
    </>
  );
}

export default function PlayerChip({ player, highlight, onSubClick, onMoveToQueueClick, onCheckoutClick, hideAvatar, hidePayment, index, info }) {
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
      <PlayerInfoBadges info={info} />
      {/* Dedicated Payment tab — see PROJECT.md/FEATURES.md. Payment
          management moved entirely to its own tab; hidePayment (passed by
          every Scorer-tab caller of this shared component) suppresses this
          badge there while leaving it exactly as-is for BoardView/
          TournamentCourtsView, which never pass it. */}
      {!hidePayment && player.checkedIn && <PaymentBadge player={player} />}
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

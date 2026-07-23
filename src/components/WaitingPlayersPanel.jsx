import { useState } from "react";
import { LogOut, Pause, Play, X } from "lucide-react";
import { styles } from "../styles.js";
import { calculatePerformanceRating } from "../lib/performanceRating.js";
import Avatar from "./Avatar.jsx";
import SectionLabel from "./SectionLabel.jsx";
import CheckoutConfirmDialog from "./CheckoutConfirmDialog.jsx";

function formatCheckoutTime(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// Manual roster controls for players not yet locked into an upcoming
// matchup: sit a player out (skipped — excluded from matchmaking but still
// visible and still counted as "waiting"), check them out (permanent for
// the rest of the session — excluded from all future match generation,
// but never deleted, see checkoutPlayer in PickleballOpenPlay.jsx), or
// remove them from the session entirely. Players already in a next
// matchup aren't listed here — use Substitute on that matchup first to
// free them up.
export default function WaitingPlayersPanel({ players, onToggleSkip, onRemove, onCheckout, checkedOutPlayers = [] }) {
  const [confirmingPlayer, setConfirmingPlayer] = useState(null);

  if (players.length === 0 && checkedOutPlayers.length === 0) return null;

  return (
    <>
      {players.length > 0 && (
        <>
          <SectionLabel>Active players ({players.length})</SectionLabel>
          <ul style={styles.rosterList}>
            {players.map((p) => {
              const performance = calculatePerformanceRating(p);
              return (
                <li key={p.id} style={styles.rosterItem}>
                  <Avatar player={p} size={26} />
                  <span style={styles.queueName}>{p.name}</span>
                  {p.skill && <span style={styles.skillTag(p.skill)}>{p.skill === "intermediate" ? "INT" : "BEG"}</span>}
                  {performance.rating !== null && (
                    <span
                      style={styles.ratingBadge(performance.rating)}
                      title={`${Math.round(performance.winPct * 100)}% win rate this session`}
                    >
                      {performance.rating}
                    </span>
                  )}
                  <button style={styles.skipToggleBtn(p.skipped)} onClick={() => onToggleSkip(p.id)}>
                    {p.skipped ? <Play size={11} strokeWidth={2.5} /> : <Pause size={11} strokeWidth={2.5} />}
                    {p.skipped ? "Sitting out" : "Skip"}
                  </button>
                  {onCheckout && (
                    <button style={styles.checkInTapBtn} onClick={() => setConfirmingPlayer(p)}>
                      <LogOut size={11} strokeWidth={2.5} />
                      Check Out
                    </button>
                  )}
                  <button style={styles.rosterRemoveBtn} onClick={() => onRemove(p.id)} aria-label={`remove ${p.name}`}>
                    <X size={11} strokeWidth={3} />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {checkedOutPlayers.length > 0 && (
        <>
          <SectionLabel>Checked out players ({checkedOutPlayers.length})</SectionLabel>
          <ul style={styles.rosterList}>
            {checkedOutPlayers.map((p) => (
              <li key={p.id} style={{ ...styles.rosterItem, opacity: 0.5 }}>
                <Avatar player={p} size={26} />
                <span style={styles.queueName}>{p.name}</span>
                <span style={styles.resultTag("loss")}>Checked Out</span>
                <span style={styles.editHint}>{formatCheckoutTime(p.checkedOutAt)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {confirmingPlayer && (
        <CheckoutConfirmDialog
          player={confirmingPlayer}
          onCancel={() => setConfirmingPlayer(null)}
          onConfirm={(id) => {
            onCheckout(id);
            setConfirmingPlayer(null);
          }}
        />
      )}
    </>
  );
}

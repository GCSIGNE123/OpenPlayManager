import { useState } from "react";
import { LogOut, Pause, Play, SkipForward, X } from "lucide-react";
import { styles } from "../styles.js";
import { calculatePerformanceRating } from "../lib/performanceRating.js";
import { getPlayerQueueStatus } from "../lib/utils.js";
import { QUEUE_STATUSES } from "../lib/constants.js";
import SectionLabel from "./SectionLabel.jsx";
import WaitingTimer from "./WaitingTimer.jsx";
import CheckoutConfirmDialog from "./CheckoutConfirmDialog.jsx";

function formatCheckoutTime(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// Manual roster controls for players not yet locked into an upcoming
// matchup: Hold a player out (excluded from matchmaking but still visible
// and still counted as "waiting" — Smart Queue Management's Hold Player,
// see PROJECT.md), Skip a player (a brief "let others go first" reorder —
// they stay fully eligible, just moved to the back of the queue), check
// them out (permanent for the rest of the session — excluded from all
// future match generation, but never deleted, see checkoutPlayer in
// PickleballOpenPlay.jsx), or remove them from the session entirely.
// Players already in a next matchup aren't listed here — use Substitute on
// that matchup first to free them up.
export default function WaitingPlayersPanel({
  players,
  state,
  onHoldPlayer,
  onResumePlayer,
  onSkipPlayer,
  onRemove,
  onCheckout,
  onChangeSkill,
  onSetPartner,
  onClearPartner,
  checkedOutPlayers = [],
}) {
  const [confirmingPlayer, setConfirmingPlayer] = useState(null);

  if (players.length === 0 && checkedOutPlayers.length === 0) return null;

  return (
    <>
      {players.length > 0 && (
        <>
          <SectionLabel>Active players ({players.length})</SectionLabel>
          <ul style={styles.rosterList}>
            {players.map((p, i) => {
              const performance = calculatePerformanceRating(p);
              const queueStatus = getPlayerQueueStatus(p, state);
              return (
                <li key={p.id} style={styles.rosterItem}>
                  <span style={styles.playerChipIndex}>{i + 1}</span>
                  <span style={{ ...styles.queueName, ...styles.teamNameProminent }}>{p.name}</span>
                  <span style={styles.queueStatusTag(queueStatus)}>{queueStatus}</span>
                  <span style={styles.waitingTimerText}>
                    <WaitingTimer player={p} />
                  </span>
                  {p.skill && <span style={styles.skillTag(p.skill)}>{p.skill === "intermediate" ? "INT" : "BEG"}</span>}
                  {onChangeSkill && (
                    <button
                      style={styles.skillOverrideBtn}
                      onClick={() => onChangeSkill(p.id, p.skill === "intermediate" ? "beginner" : "intermediate")}
                      title={`Move ${p.name} to ${p.skill === "intermediate" ? "Beginner" : "Intermediate"}`}
                    >
                      {p.skill === "intermediate" ? "→ BEG" : "→ INT"}
                    </button>
                  )}
                  {onSetPartner && (
                    // Partner Requests — see PROJECT.md/FEATURES.md. Always
                    // available, per-pair; no session-wide setting gates it.
                    // Options are every OTHER currently-waiting player — picking one who
                    // already has a different partner cleanly reassigns
                    // both sides (see setFixedPartner, lib/queueManagement.js).
                    <select
                      style={styles.partnerSelect}
                      value={p.partnerId || ""}
                      onChange={(e) => (e.target.value ? onSetPartner(p.id, e.target.value) : onClearPartner(p.id))}
                      title="Fixed partner — always teamed together for this pair"
                    >
                      <option value="">+ Partner</option>
                      {players
                        .filter((other) => other.id !== p.id)
                        .map((other) => (
                          <option key={other.id} value={other.id}>
                            {other.name}
                          </option>
                        ))}
                    </select>
                  )}
                  {performance.rating !== null && (
                    <span
                      style={styles.ratingBadge(performance.rating)}
                      title={`${Math.round(performance.winPct * 100)}% win rate this session`}
                    >
                      {performance.rating}
                    </span>
                  )}
                  {onSkipPlayer && (
                    <button
                      style={styles.skipToggleBtn(false)}
                      onClick={() => onSkipPlayer(p.id)}
                      title="Skip — move to the back of the waiting queue (restroom, water, brief absence); still fully eligible to be matched"
                    >
                      <SkipForward size={11} strokeWidth={2.5} />
                      Skip
                    </button>
                  )}
                  <button
                    style={styles.skipToggleBtn(p.held)}
                    onClick={() => (p.held ? onResumePlayer(p.id) : onHoldPlayer(p.id))}
                    title={
                      p.held
                        ? "Resume — return this player to the waiting queue"
                        : "Hold — temporarily exclude this player from matchmaking (stats/streaks/payment status preserved)"
                    }
                  >
                    {p.held ? <Play size={11} strokeWidth={2.5} /> : <Pause size={11} strokeWidth={2.5} />}
                    {p.held ? "Held" : "Hold"}
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
            {checkedOutPlayers.map((p, i) => (
              <li key={p.id} style={{ ...styles.rosterItem, opacity: 0.5 }}>
                <span style={styles.playerChipIndex}>{i + 1}</span>
                <span style={styles.queueName}>{p.name}</span>
                <span style={styles.resultTag("loss")}>{QUEUE_STATUSES.CHECKED_OUT}</span>
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

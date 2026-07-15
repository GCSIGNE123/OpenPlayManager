import { Minus, Plus, Shuffle, X } from "lucide-react";
import { styles } from "../styles.js";
import CourtCard from "./CourtCard.jsx";

export default function ScorerView({
  state,
  fillCourt,
  fillAllCourts,
  adjustScore,
  endMatch,
  reassignTeams,
  substitutePlayer,
  waitingCount,
  addCourt,
  removeCourt,
  endSession,
}) {
  const waitingPlayers = state.queueIds.map((id) => state.players[id]).filter(Boolean);
  const lastCourt = state.courts[state.courts.length - 1];
  const canAddCourt = state.courts.length < 8;
  const canRemoveCourt = state.courts.length > 1 && lastCourt?.status === "open";

  return (
    <div>
      <div style={styles.scorerToolbar}>
        <div style={styles.toolbarText}>
          <strong>{waitingCount}</strong> players waiting
        </div>
        <button
          style={{ ...styles.primaryBtn, ...(waitingCount < 4 ? styles.btnDisabled : {}) }}
          onClick={fillAllCourts}
          disabled={waitingCount < 4}
        >
          <Shuffle size={16} strokeWidth={2.5} />
          Fill all open courts
        </button>
      </div>
      <div style={styles.scorerToolbar}>
        <div style={styles.courtStepper}>
          <button
            style={{ ...styles.scoreBtn, ...(!canRemoveCourt ? styles.btnDisabled : {}) }}
            onClick={removeCourt}
            disabled={!canRemoveCourt}
            aria-label="remove a court"
            title={canRemoveCourt ? "Remove last court" : "Can't remove a court that's in use"}
          >
            <Minus size={14} strokeWidth={3} />
          </button>
          <span style={styles.toolbarText}>{state.courts.length} court{state.courts.length === 1 ? "" : "s"}</span>
          <button
            style={{ ...styles.scoreBtn, ...(!canAddCourt ? styles.btnDisabled : {}) }}
            onClick={addCourt}
            disabled={!canAddCourt}
            aria-label="add a court"
            title="Add a court"
          >
            <Plus size={14} strokeWidth={3} />
          </button>
        </div>
        <button style={styles.dangerBtn} onClick={endSession}>
          <X size={14} strokeWidth={2.5} />
          End session
        </button>
      </div>
      <div style={styles.courtGrid}>
        {state.courts.map((court, i) => (
          <CourtCard
            key={i}
            court={court}
            players={state.players}
            waitingPlayers={waitingPlayers}
            onFill={() => fillCourt(i)}
            onScore={(team, delta) => adjustScore(i, team, delta)}
            onEnd={() => endMatch(i)}
            onReassign={(teamA, teamB) => reassignTeams(i, teamA, teamB)}
            onSubstitute={(outgoingId, incomingId) => substitutePlayer(i, outgoingId, incomingId)}
            canFill={waitingCount >= 4}
          />
        ))}
      </div>
    </div>
  );
}

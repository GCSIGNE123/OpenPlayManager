import { Minus, Plus, Shuffle, X } from "lucide-react";
import { styles } from "../styles.js";
import { reservedMatchupIds } from "../lib/utils.js";
import CourtCard from "./CourtCard.jsx";
import NextMatchupCard from "./NextMatchupCard.jsx";
import SectionLabel from "./SectionLabel.jsx";

export default function ScorerView({
  state,
  fillCourt,
  fillAllCourts,
  adjustScore,
  endMatch,
  reassignTeams,
  substitutePlayer,
  reassignMatchup,
  substituteInMatchup,
  waitingCount,
  addCourt,
  removeCourt,
  endSession,
}) {
  const nextMatchups = state.nextMatchups || [];
  const reserved = reservedMatchupIds(nextMatchups);
  // players not already locked into a pre-built matchup — the only pool
  // either a live-court substitution or a next-matchup substitution can
  // draw from, so the two features never fight over the same player
  const unassignedPlayers = state.queueIds
    .map((id) => state.players[id])
    .filter((p) => p && !reserved.has(p.id));
  const canFillCourt = nextMatchups.length > 0;
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
          style={{ ...styles.primaryBtn, ...(!canFillCourt ? styles.btnDisabled : {}) }}
          onClick={fillAllCourts}
          disabled={!canFillCourt}
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

      {nextMatchups.length > 0 && (
        <>
          <SectionLabel>Next matchups</SectionLabel>
          {nextMatchups.map((m, i) => (
            <NextMatchupCard
              key={m.id}
              matchup={m}
              players={state.players}
              unassignedPlayers={unassignedPlayers}
              label={i === 0 ? "Next up" : `Then · matchup ${i + 1}`}
              onReassign={reassignMatchup}
              onSubstitute={substituteInMatchup}
            />
          ))}
        </>
      )}

      <div style={styles.courtGrid}>
        {state.courts.map((court, i) => (
          <CourtCard
            key={i}
            court={court}
            players={state.players}
            waitingPlayers={unassignedPlayers}
            onFill={() => fillCourt(i)}
            onScore={(team, delta) => adjustScore(i, team, delta)}
            onEnd={() => endMatch(i)}
            onReassign={(teamA, teamB) => reassignTeams(i, teamA, teamB)}
            onSubstitute={(outgoingId, incomingId) => substitutePlayer(i, outgoingId, incomingId)}
            canFill={canFillCourt}
          />
        ))}
      </div>
    </div>
  );
}

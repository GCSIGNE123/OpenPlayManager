import { Minus, Plus, RefreshCw, Shuffle, Undo2, X } from "lucide-react";
import { styles } from "../styles.js";
import { reservedMatchupIds } from "../lib/utils.js";
import { getPairPartnerIndex, isPoolingRotation } from "../lib/winnerPoolRound.js";
import CourtCard from "./CourtCard.jsx";
import NextMatchupCard from "./NextMatchupCard.jsx";
import ProgressiveSkillPanel from "./ProgressiveSkillPanel.jsx";
import SectionLabel from "./SectionLabel.jsx";
import WaitingPlayersPanel from "./WaitingPlayersPanel.jsx";

export default function ScorerView({
  state,
  fillCourt,
  fillAllCourts,
  adjustScore,
  declareWinner,
  endMatch,
  reassignTeams,
  substitutePlayer,
  reassignMatchup,
  substituteInMatchup,
  toggleLockMatchup,
  regenerateMatchups,
  canUndoRegenerate,
  undoRegenerate,
  canUndoLastRound,
  undoLastRound,
  toggleSkipPlayer,
  removePlayer,
  rotationMode,
  setRotationMode,
  rotationModes,
  expectedGamesPerPlayer,
  setExpectedGamesPerPlayer,
  progressiveSkillThresholds,
  setProgressiveSkillThresholds,
  progressiveSkillPhase,
  matchHistory,
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
  const canRegenerate = nextMatchups.some((m) => !m.locked);
  const lastCourt = state.courts[state.courts.length - 1];
  const canAddCourt = state.courts.length < 8;
  const canRemoveCourt = state.courts.length > 1 && lastCourt?.status === "open";

  return (
    <div>
      <div style={styles.scorerToolbar}>
        <div style={styles.rotationRow}>
          Rotation:
          <select
            style={styles.rotationSelect}
            value={rotationMode}
            onChange={(e) => setRotationMode(e.target.value)}
          >
            {rotationModes.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {rotationMode === "progressiveSkill" && (
        <ProgressiveSkillPanel
          players={state.players}
          expectedGamesPerPlayer={expectedGamesPerPlayer}
          setExpectedGamesPerPlayer={setExpectedGamesPerPlayer}
          progressiveSkillThresholds={progressiveSkillThresholds}
          setProgressiveSkillThresholds={setProgressiveSkillThresholds}
          matchHistory={matchHistory}
        />
      )}
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
          <div style={styles.scorerToolbar}>
            <SectionLabel>Next matchups</SectionLabel>
            <div style={{ display: "flex", gap: 8 }}>
              {canUndoRegenerate && (
                <button
                  style={{ ...styles.secondaryBtn, margin: 0 }}
                  onClick={undoRegenerate}
                  title="Restore the matchups from before the last Regenerate"
                >
                  <Undo2 size={13} strokeWidth={2.5} />
                  Undo regenerate
                </button>
              )}
              <button
                style={{ ...styles.secondaryBtn, margin: 0, ...(!canRegenerate ? styles.btnDisabled : {}) }}
                onClick={regenerateMatchups}
                disabled={!canRegenerate}
                title="Rebuild every not-locked matchup from scratch"
              >
                <RefreshCw size={13} strokeWidth={2.5} />
                Regenerate
              </button>
            </div>
          </div>
          {nextMatchups.map((m, i) => (
            <NextMatchupCard
              key={m.id}
              matchup={m}
              players={state.players}
              unassignedPlayers={unassignedPlayers}
              label={i === 0 ? "Next up" : `Then · matchup ${i + 1}`}
              onReassign={reassignMatchup}
              onSubstitute={substituteInMatchup}
              onToggleLock={toggleLockMatchup}
            />
          ))}
        </>
      )}

      <WaitingPlayersPanel players={unassignedPlayers} onToggleSkip={toggleSkipPlayer} onRemove={removePlayer} />

      <div style={styles.scorerToolbar}>
        <SectionLabel>Courts</SectionLabel>
        {canUndoLastRound && (
          <button
            style={{ ...styles.secondaryBtn, margin: 0 }}
            onClick={undoLastRound}
            title="Restore the court, players, and stats from right before the last 'End match'"
          >
            <Undo2 size={13} strokeWidth={2.5} />
            Undo last round
          </button>
        )}
      </div>
      <div style={styles.courtGrid}>
        {(() => {
          // pooling (Winner Pool Rotation, or Progressive Skill Rotation in
          // Mentorship) gates both the "waiting for its pair" hint and the
          // Confirm-result button label. A court that's already
          // "awaitingPair" keeps its pair-partner hint even if the phase has
          // since moved on — see the matching endMatch fallback in
          // PickleballOpenPlay.jsx that still resolves that pairing.
          const poolingActive = isPoolingRotation(rotationMode, progressiveSkillPhase);
          return state.courts.map((court, i) => {
            const partnerIdx = poolingActive || court.awaitingPair ? getPairPartnerIndex(state.courts, i) : null;
            const pairPartnerNumber = partnerIdx !== null ? state.courts[partnerIdx]?.number : null;
            return (
              <CourtCard
                key={i}
                court={court}
                players={state.players}
                waitingPlayers={unassignedPlayers}
                onFill={() => fillCourt(i)}
                onScore={(team, delta) => adjustScore(i, team, delta)}
                onDeclareWinner={(team) => declareWinner(i, team)}
                onEnd={() => endMatch(i)}
                onReassign={(teamA, teamB) => reassignTeams(i, teamA, teamB)}
                onSubstitute={(outgoingId, incomingId) => substitutePlayer(i, outgoingId, incomingId)}
                canFill={canFillCourt}
                pairPartnerNumber={pairPartnerNumber}
                poolingMode={poolingActive}
              />
            );
          });
        })()}
      </div>
    </div>
  );
}

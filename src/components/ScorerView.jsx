import { useState } from "react";
import { ChevronDown, ChevronUp, Megaphone, Minus, Pause, Play, Plus, RefreshCw, Settings, Shuffle, Undo2, Wand2, X } from "lucide-react";
import { styles } from "../styles.js";
import { ROTATION_MODES } from "../lib/constants.js";
import { reservedMatchupIds, buildReplacementCandidates, manuallyReservedIds } from "../lib/utils.js";
import { getPairPartnerIndex, isPoolingRotation } from "../lib/winnerPoolRound.js";
import CourtCard from "./CourtCard.jsx";
import NextMatchupCard from "./NextMatchupCard.jsx";
import ProgressiveSkillPanel from "./ProgressiveSkillPanel.jsx";
import SectionLabel from "./SectionLabel.jsx";
import SessionSettingsDialog from "./SessionSettingsDialog.jsx";
import WaitingPlayersPanel from "./WaitingPlayersPanel.jsx";
import CheckoutConfirmDialog from "./CheckoutConfirmDialog.jsx";
import LatecomerPriorityDialog from "./LatecomerPriorityDialog.jsx";

// Queue Activity Log — see PROJECT.md/FEATURES.md. One shared, generic log
// (state.queueActivityLog) holds every kind of entry Queue Management and
// Smart Court Dispatch both write; this just maps each `kind` to its card
// title so the log stays one list with a small, easily-scannable header
// per entry rather than needing separate sections per feature.
const QUEUE_ACTIVITY_KIND_META = {
  heldMatchDissolved: { title: "Held Match Removed" },
  courtDispatched: { title: "Court Automatically Dispatched" },
  announcementCompleted: { title: "Voice Announcement Completed" },
  announcementRepeated: { title: "Voice Announcement Repeated" },
  announcementMuted: { title: "Announcement Muted" },
  announcementSkipped: { title: "Announcement Skipped" },
  heldPlayerReminder: { title: "Held Player Reminder" },
  paymentReceived: { title: "Payment Received" },
  paymentUpdated: { title: "Payment Updated" },
  liveMatchCancelled: { title: "Live Match Cancelled" },
};

// Collapsed-state "Latest:" compact summary — one readable line per kind,
// so a facilitator glancing at a collapsed log still knows something just
// happened without expanding the whole list. Presentation-only, reads the
// exact same entry data the expanded card already shows.
function queueActivitySummaryText(entry) {
  const kind = entry.kind || "heldMatchDissolved";
  // Court Renaming — prefer the frozen courtLabel stamped at the moment
  // this entry was created (see lib/courtDispatch.js's logDispatchEvent);
  // falls back to the plain court number for older entries written before
  // that field existed.
  const courtName = entry.courtLabel || (typeof entry.courtNumber === "number" ? `Court ${entry.courtNumber}` : "");
  const court = courtName ? `${courtName} ` : "";
  switch (kind) {
    case "courtDispatched":
      return `${court}automatically dispatched`;
    case "announcementCompleted":
      return `${court}voice announcement completed`;
    case "announcementRepeated":
      return `${court}voice announcement repeated`;
    case "announcementMuted":
      return `${court}announcement muted`;
    case "announcementSkipped":
      return `${court}announcement skipped`;
    case "heldPlayerReminder":
      return `${entry.playerName} held ${entry.minutesHeld}m (${entry.roundsHeld} round${entry.roundsHeld === 1 ? "" : "s"})`;
    case "paymentReceived":
      return `${entry.playerName} paid (${entry.newMethod === "gcash" ? "GCash" : "Cash"})`;
    case "paymentUpdated":
      return `${entry.playerName} ${entry.reason}`;
    case "liveMatchCancelled":
      return `${court}match cancelled — returned to queue`;
    case "heldMatchDissolved":
    default:
      return "Held Match removed";
  }
}

// Compact single-line row text for the expanded log (Redesign Scorer Tab for
// Clarity sprint) — the badge already conveys the kind, so this line packs
// in only what the badge doesn't: court + matchup for dispatch/announcement
// entries, or the dissolution reason for a held-match removal (its one bit
// of detail the teams alone don't explain).
function queueActivityRowText(entry) {
  const kind = entry.kind || "heldMatchDissolved";
  if (kind === "heldPlayerReminder") {
    return `${entry.playerName} — held ${entry.minutesHeld} min (${entry.roundsHeld} round${entry.roundsHeld === 1 ? "" : "s"})`;
  }
  if (kind === "paymentReceived") {
    return `${entry.playerName} — paid (${entry.newMethod === "gcash" ? "GCash" : "Cash"})`;
  }
  if (kind === "paymentUpdated") {
    return `${entry.playerName} — ${entry.reason}`;
  }
  const teamsPart = `${(entry.teamA || []).join(" / ")} vs ${(entry.teamB || []).join(" / ")}`;
  if (kind === "heldMatchDissolved") return `${teamsPart} — ${entry.reason}`;
  const courtName = entry.courtLabel || (typeof entry.courtNumber === "number" ? `Court ${entry.courtNumber}` : "");
  const courtPart = courtName ? `${courtName}: ` : "";
  if (kind === "liveMatchCancelled") return `${courtPart}${teamsPart} — ${entry.reason}`;
  return `${courtPart}${teamsPart}`;
}

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
  moveToQueue,
  setCourtAssignmentMode,
  setManualCourtPlayer,
  clearManualCourtPlayer,
  lockManualCourt,
  unlockManualCourt,
  generateRemainingCourts,
  toggleLockMatchup,
  regenerateMatchups,
  canUndoRegenerate,
  undoRegenerate,
  canUndoLastRound,
  undoLastRound,
  holdPlayer,
  resumePlayer,
  skipPlayer,
  holdMatch,
  resumeMatch,
  cancelMatch,
  cancelLiveMatch,
  queueMsg,
  removePlayer,
  checkoutPlayer,
  changePlayerSkill,
  setFixedPartner,
  clearFixedPartner,
  skillChangeMsg,
  skillChangeLog,
  queueActivityLog,
  queueActivityLogExpanded,
  setQueueActivityLogExpanded,
  startDispatchedMatch,
  repeatAnnouncement,
  courtDispatchSettings,
  rotationMode,
  expectedGamesPerPlayer,
  setExpectedGamesPerPlayer,
  progressiveSkillThresholds,
  setProgressiveSkillThresholds,
  adaptiveSkillThresholds,
  progressiveSkillPhase,
  matchHistory,
  waitingCount,
  addCourt,
  removeCourt,
  renameCourt,
  endSession,
  updateSessionSettings,
  reservedCourtNumbers,
  matchmakingPriority,
  queueingStopped,
  onToggleQueueing,
  pendingCourtRemovals,
  nextMatchupId,
  onSetNextMatchup,
  onAnnounceNextMatchup,
  announcingNextMatchup,
  latecomerPriority,
  latecomerPreview,
  onPreviewLatecomerPriority,
  onCancelLatecomerPriority,
  onApplyLatecomerPriority,
  canUndoLatecomerPriority,
  onUndoLatecomerPriority,
  latecomerUndoError,
}) {
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  // Player Checkout During Open Play — see PROJECT.md. Confirming a
  // mid-match checkout from a live court's player chip (courts render
  // deep via CourtCard -> TeamRow -> PlayerChip, so this state lives here
  // rather than threading a dialog down through all three).
  const [confirmingCheckoutId, setConfirmingCheckoutId] = useState(null);
  // Redesign Scorer Tab for Clarity — expanded log defaults to only the
  // latest 5 entries ("Showing latest N of M"); "View full log" reveals the
  // rest without changing the collapsed/expanded state itself.
  const [showAllActivity, setShowAllActivity] = useState(false);
  const nextMatchups = state.nextMatchups || [];
  const reserved = reservedMatchupIds(nextMatchups);
  const manualIds = manuallyReservedIds(state.courts);
  // still-unassigned, not-manually-spoken-for players — the Waiting Queue
  // half of a substitution's (or a Manual Court Assignment slot's)
  // replacement candidates (see buildReplacementCandidates for the other
  // half: players already scheduled into an upcoming matchup who haven't
  // started yet, real-world Open Play organizers need both)
  const unassignedPlayers = state.queueIds
    .map((id) => state.players[id])
    .filter((p) => p && !reserved.has(p.id) && !manualIds.has(p.id) && p.status !== "CHECKED_OUT");
  // Player Checkout During Open Play — see PROJECT.md. Rendered as its own
  // section in WaitingPlayersPanel, separate from the active waiting list.
  const checkedOutPlayers = Object.values(state.players)
    .filter((p) => p.status === "CHECKED_OUT")
    .sort((a, b) => (b.checkedOutAt || 0) - (a.checkedOutAt || 0));
  // live-court substitution AND manual court slot-filling share this same
  // pool — both need "anyone not currently playing and not already spoken
  // for elsewhere," which is exactly what this is (nothing to exclude by
  // matchup here — a live court's players aren't in nextMatchups at all)
  const courtCandidates = buildReplacementCandidates(nextMatchups, unassignedPlayers, state.players);
  // Smart Queue Management — a held matchup is reserved but must never be
  // auto-deployed or counted as protecting it from "Regenerate" the same
  // way a locked one is (see PickleballOpenPlay.jsx's
  // takeNextDeployableMatchup/regenerateNextMatchups).
  const canFillCourt = nextMatchups.some((m) => !m.held);
  const canRegenerate = nextMatchups.some((m) => !m.locked && !m.held);
  const canAddCourt = state.courts.length < 8;
  // Dynamic Court Count — see PROJECT.md/FEATURES.md. Removal is always
  // available (down to 1 court) — it no longer requires the last court to
  // already be idle right now: requestRemoveCourt (lib/queueManagement.js)
  // removes it immediately if it's open, or queues the removal for
  // save()'s applyPendingCourtRemovals to complete automatically the
  // instant that court's live match ends.
  const canRemoveCourt = state.courts.length > 1;
  const hasOpenAutomaticCourt = state.courts.some((c) => c.status === "open" && c.assignmentMode !== "manual");
  // rotation mode is now chosen once at session creation (Create Session
  // screen) — this is a read-only label, not a control, so the organizer
  // can still see which mode is active without being able to switch it here
  const rotationModeLabel = ROTATION_MODES.find((m) => m.value === rotationMode)?.label || rotationMode;
  const totalPlayers = Object.keys(state.players || {}).length;
  // matches matchHistory's own round numbering (see endMatch: `round:
  // (state.matchHistory || []).length + 1`) — the round the next completed
  // match would be recorded under, i.e. "what round are we currently on"
  const currentRound = (matchHistory || []).length + 1;

  return (
    <div>
      <div style={styles.sessionInfoCard}>
        <div style={styles.sessionInfoHeadRow}>
          <SectionLabel>Session Information</SectionLabel>
          <button
            style={styles.iconBtn}
            onClick={() => setSettingsDialogOpen(true)}
            aria-label="Edit session settings"
            title="Session settings"
          >
            <Settings size={14} strokeWidth={2.5} />
          </button>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Rotation Mode</span>
          <span style={styles.sessionInfoValue}>{rotationModeLabel}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Courts</span>
          <span style={styles.sessionInfoValue}>
            <span style={styles.courtStepper}>
              <button
                style={{ ...styles.scoreBtn, ...(!canRemoveCourt ? styles.btnDisabled : {}) }}
                onClick={removeCourt}
                disabled={!canRemoveCourt}
                aria-label="remove a court"
                title="Remove last court — immediately if it's idle, otherwise as soon as its current match ends"
              >
                <Minus size={12} strokeWidth={3} />
              </button>
              {state.courts.length}
              <button
                style={{ ...styles.scoreBtn, ...(!canAddCourt ? styles.btnDisabled : {}) }}
                onClick={addCourt}
                disabled={!canAddCourt}
                aria-label="add a court"
                title="Add a court"
              >
                <Plus size={12} strokeWidth={3} />
              </button>
            </span>
            {pendingCourtRemovals > 0 && (
              <span style={styles.pendingRemovalTag} title="Waiting for its current match to end before removing">
                {pendingCourtRemovals} pending removal{pendingCourtRemovals === 1 ? "" : "s"}
              </span>
            )}
          </span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Players</span>
          <span style={styles.sessionInfoValue}>{totalPlayers}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Waiting Players</span>
          <span style={styles.sessionInfoValue}>{waitingCount}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Current Round</span>
          <span style={styles.sessionInfoValue}>{currentRound}</span>
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            style={{ ...styles.secondaryBtn, margin: 0, ...(!hasOpenAutomaticCourt ? styles.btnDisabled : {}) }}
            onClick={generateRemainingCourts}
            disabled={!hasOpenAutomaticCourt}
            title="Rebuild matchups (ignoring anyone on a Manual court) and fill every open automatic court right away"
          >
            <Wand2 size={14} strokeWidth={2.5} />
            Generate remaining courts
          </button>
          <button
            style={{ ...styles.primaryBtn, ...(!canFillCourt ? styles.btnDisabled : {}) }}
            onClick={fillAllCourts}
            disabled={!canFillCourt}
          >
            <Shuffle size={16} strokeWidth={2.5} />
            Fill all open courts
          </button>
          {onToggleQueueing && (
            <button
              style={{ ...styles.secondaryBtn, margin: 0 }}
              onClick={onToggleQueueing}
              title={
                queueingStopped
                  ? "Resume Queueing — go back to generating new matchups and automatic dispatch"
                  : "Stop Queueing — finish the matches already on court and queued, but stop creating new ones"
              }
            >
              {queueingStopped ? <Play size={14} strokeWidth={2.5} /> : <Pause size={14} strokeWidth={2.5} />}
              {queueingStopped ? "Resume Queueing" : "Stop Queueing"}
            </button>
          )}
          <button style={styles.dangerBtn} onClick={endSession}>
            <X size={14} strokeWidth={2.5} />
            End session
          </button>
        </div>
      </div>

      {queueingStopped && (
        <div style={styles.confirmMsg}>
          Queueing is stopped — existing matches continue, but no new matchups will be created or auto-dispatched.
        </div>
      )}

      {skillChangeMsg && (
        <div style={styles.confirmMsg}>{skillChangeMsg}</div>
      )}
      {queueMsg && (
        <div style={styles.confirmMsg}>{queueMsg}</div>
      )}
      {latecomerUndoError && <div style={styles.confirmMsg}>{latecomerUndoError}</div>}

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
            // Court Booking & Reservations integration — see PROJECT.md.
            // A reserved court's "Assign match"/manual-lock affordances
            // are hidden the same way an already-live court's are — the
            // real enforcement lives in fillCourt/fillAllCourts
            // themselves (PickleballOpenPlay.jsx); this is the matching
            // UI-side reflection of that same check.
            const isReserved = reservedCourtNumbers?.has(court.number) ?? false;
            return (
              <CourtCard
                key={i}
                court={court}
                players={state.players}
                candidates={courtCandidates}
                onFill={() => fillCourt(i)}
                onScore={(team, delta) => adjustScore(i, team, delta)}
                onDeclareWinner={(team) => declareWinner(i, team)}
                onEnd={() => endMatch(i)}
                onReassign={(teamA, teamB) => reassignTeams(i, teamA, teamB)}
                onSubstitute={(outgoingId, incomingId) => substitutePlayer(i, outgoingId, incomingId)}
                onSetAssignmentMode={(mode) => setCourtAssignmentMode(i, mode)}
                onSetManualPlayer={(side, slotIndex, playerId) => setManualCourtPlayer(i, side, slotIndex, playerId)}
                onClearManualPlayer={(side, slotIndex) => clearManualCourtPlayer(i, side, slotIndex)}
                onLock={() => lockManualCourt(i)}
                onUnlock={() => unlockManualCourt(i)}
                canFill={canFillCourt && !isReserved}
                pairPartnerNumber={pairPartnerNumber}
                poolingMode={poolingActive}
                reserved={isReserved}
                onRequestCheckout={checkoutPlayer ? (id) => setConfirmingCheckoutId(id) : null}
                onStartMatch={() => startDispatchedMatch(court.number)}
                onRepeatAnnouncement={() => repeatAnnouncement(court.number)}
                onRename={renameCourt ? (name) => renameCourt(court.number, name) : null}
                onCancelLiveMatch={cancelLiveMatch ? () => cancelLiveMatch(court.number) : null}
                hideAvatar
              />
            );
          });
        })()}
      </div>

      {nextMatchups.length > 0 && (() => {
        const announcedMatchup = nextMatchups.find((m) => m.id === nextMatchupId);
        return (
        <>
          {announcedMatchup && (
            <div style={{ ...styles.tournamentSetupCard, borderColor: "var(--ball)" }}>
              <p style={styles.dialogLabel}>
                <Megaphone size={13} strokeWidth={2.5} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                NEXT MATCH
              </p>
              <div style={styles.matchupTeams}>
                <div style={styles.matchupTeam}>
                  {announcedMatchup.teamA.map((id) => (
                    <span key={id} style={styles.editChipName}>{state.players[id]?.name}</span>
                  ))}
                </div>
                <span style={styles.matchupVs}>VS</span>
                <div style={styles.matchupTeam}>
                  {announcedMatchup.teamB.map((id) => (
                    <span key={id} style={styles.editChipName}>{state.players[id]?.name}</span>
                  ))}
                </div>
              </div>
              <div style={styles.editActions}>
                <button
                  style={{ ...styles.primaryBtn, ...(announcingNextMatchup ? styles.btnDisabled : {}) }}
                  disabled={announcingNextMatchup}
                  onClick={onAnnounceNextMatchup}
                >
                  <Megaphone size={14} strokeWidth={2.5} />
                  {announcingNextMatchup ? "Announcing…" : "Announce Next Match"}
                </button>
              </div>
            </div>
          )}
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
              {canUndoLatecomerPriority && (
                <button
                  style={{ ...styles.secondaryBtn, margin: 0 }}
                  onClick={onUndoLatecomerPriority}
                  title="Restore the matchup from before the last Latecomer Priority substitution — unavailable once that matchup is dispatched"
                >
                  <Undo2 size={13} strokeWidth={2.5} />
                  Undo Priority
                </button>
              )}
              <button
                style={{ ...styles.secondaryBtn, margin: 0, ...(!canRegenerate || queueingStopped ? styles.btnDisabled : {}) }}
                onClick={regenerateMatchups}
                disabled={!canRegenerate || queueingStopped}
                title={queueingStopped ? "Queueing is stopped — no new matchups can be generated" : "Rebuild every not-locked matchup from scratch"}
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
              candidates={buildReplacementCandidates(nextMatchups, unassignedPlayers, state.players, m.id)}
              label={i === 0 ? "Next up" : `Then · matchup ${i + 1}`}
              onReassign={reassignMatchup}
              onSubstitute={substituteInMatchup}
              onToggleLock={toggleLockMatchup}
              onMoveToQueue={moveToQueue}
              onHold={() => holdMatch(m.id)}
              onResume={() => resumeMatch(m.id)}
              onCancel={() => cancelMatch(m.id)}
              isNext={m.id === nextMatchupId}
              onSetNextMatchup={() => onSetNextMatchup(m.id)}
              isLatecomerPriority={m.id === latecomerPriority?.matchupId}
            />
          ))}
        </>
        );
      })()}

      <WaitingPlayersPanel
        players={unassignedPlayers}
        state={state}
        onHoldPlayer={holdPlayer}
        onResumePlayer={resumePlayer}
        onSkipPlayer={skipPlayer}
        onRemove={removePlayer}
        onCheckout={checkoutPlayer}
        onChangeSkill={rotationMode === "adaptiveSkill" ? changePlayerSkill : null}
        onSetPartner={setFixedPartner}
        onClearPartner={clearFixedPartner}
        checkedOutPlayers={checkedOutPlayers}
        showLatecomerPriority={rotationMode === "adaptiveSkill"}
        onPrioritizeLatecomer={onPreviewLatecomerPriority ? (id) => onPreviewLatecomerPriority([id]) : null}
      />

      {rotationMode === "adaptiveSkill" && skillChangeLog && skillChangeLog.length > 0 && (
        <>
          <SectionLabel>Skill Change Activity Log</SectionLabel>
          <ul style={styles.rosterList}>
            {skillChangeLog.map((entry) => (
              <li key={entry.id} style={styles.rosterItem}>
                <span style={styles.queueName}>
                  {new Date(entry.timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  {" — "}
                  {entry.playerName}: {entry.previousSkill === "intermediate" ? "Intermediate" : "Beginner"} →{" "}
                  {entry.newSkill === "intermediate" ? "Intermediate" : "Beginner"} ({entry.reason})
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Scorer Layout — Courts always have visual priority over the Queue
          Activity Log (see PROJECT.md/FEATURES.md): the log renders here,
          after Courts, and defaults to collapsed so it never competes for
          attention with the court controls facilitators spend nearly all
          their time on. Presentation-only — every entry, kind, and field
          below is identical to before; only where and how it's shown
          changed. */}
      {queueActivityLog && queueActivityLog.length > 0 && (
        <div style={styles.queueActivitySection}>
          <button
            style={styles.queueActivityToggle}
            onClick={() => setQueueActivityLogExpanded((v) => !v)}
            aria-expanded={queueActivityLogExpanded}
          >
            <span>Queue Activity Log ({queueActivityLog.length})</span>
            <span style={styles.queueActivityToggleLabel}>
              {queueActivityLogExpanded ? (
                <>
                  <ChevronUp size={13} strokeWidth={2.5} />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown size={13} strokeWidth={2.5} />
                  Expand
                </>
              )}
            </span>
          </button>

          {queueActivityLogExpanded ? (
            <div style={styles.queueActivityList}>
              {(showAllActivity ? queueActivityLog : queueActivityLog.slice(0, 5)).map((entry) => {
                // "heldMatchDissolved" is the default for any pre-Sprint-3
                // entry that predates the `kind` field — see
                // lib/queueManagement.js's noteDissolvedHeldMatchups.
                const kind = entry.kind || "heldMatchDissolved";
                const meta = QUEUE_ACTIVITY_KIND_META[kind] || QUEUE_ACTIVITY_KIND_META.heldMatchDissolved;
                return (
                  <div key={entry.id} style={styles.queueActivityRow}>
                    <span style={styles.queueActivityPill(kind)}>{meta.title}</span>
                    <span style={styles.queueActivityRowText}>{queueActivityRowText(entry)}</span>
                    <span style={styles.queueActivityRowTime}>
                      {new Date(entry.timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </div>
                );
              })}
              {queueActivityLog.length > 5 && (
                <div style={styles.queueActivityFooter}>
                  <span>
                    Showing latest {Math.min(showAllActivity ? queueActivityLog.length : 5, queueActivityLog.length)} of{" "}
                    {queueActivityLog.length} activities
                  </span>
                  <button
                    style={styles.queueActivityViewAllBtn}
                    onClick={() => setShowAllActivity((v) => !v)}
                  >
                    {showAllActivity ? "Show less" : "View full log"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={styles.queueActivityLatest}>
              <span style={styles.queueActivityLatestLabel}>Latest:</span>
              <span style={styles.queueActivityLatestText}>{queueActivitySummaryText(queueActivityLog[0])}</span>
              <span style={styles.queueActivityTime}>
                {new Date(queueActivityLog[0].timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
          )}
        </div>
      )}

      {settingsDialogOpen && (
        <SessionSettingsDialog
          venue={state.venue}
          rotationModeLabel={rotationModeLabel}
          expectedGamesPerPlayer={expectedGamesPerPlayer}
          progressiveSkillThresholds={progressiveSkillThresholds}
          showThresholds={rotationMode === "progressiveSkill"}
          adaptiveSkillThresholds={adaptiveSkillThresholds}
          showAdaptiveThresholds={rotationMode === "adaptiveSkill"}
          courtDispatchSettings={courtDispatchSettings}
          heldPlayerReminderSettings={state.heldPlayerReminderSettings}
          matchmakingPriority={matchmakingPriority}
          onSave={updateSessionSettings}
          onClose={() => setSettingsDialogOpen(false)}
        />
      )}

      {confirmingCheckoutId && state.players[confirmingCheckoutId] && (
        <CheckoutConfirmDialog
          player={state.players[confirmingCheckoutId]}
          onCancel={() => setConfirmingCheckoutId(null)}
          onConfirm={(id) => {
            checkoutPlayer(id);
            setConfirmingCheckoutId(null);
          }}
        />
      )}

      {latecomerPreview && (
        <LatecomerPriorityDialog
          preview={latecomerPreview}
          players={state.players}
          onCancel={onCancelLatecomerPriority}
          onApply={onApplyLatecomerPriority}
        />
      )}
    </div>
  );
}

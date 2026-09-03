import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Lock, Pause, Play, Shuffle, Star, Unlock, X } from "lucide-react";
import { styles } from "../styles.js";
import PlayerChip from "./PlayerChip.jsx";
import PlayerPicker from "./PlayerPicker.jsx";

// A pre-built upcoming matchup, editable before it's assigned to a court —
// mirrors CourtCard's "fix teams" / substitute interactions, minus anything
// score/court-status related since this matchup isn't live yet.
//
// Next Match Proposal — see PROJECT.md's Fairness First redesign. Only the
// "Next up" card (label === "Next up") ever gets `matchup.fairness` acted
// on here: a collapsible "Why these players?" breakdown (per-player wait
// time + games played, plus the existing match-quality factors this
// matchup's pairing already considered) and an "Approve Next Match" button
// (onApprove — deploys THIS matchup to the court the caller determined is
// next available; omitted/no-op if no court is free yet). This operates
// entirely on the matchup the fairness engine already built — Regenerate
// (onToggleLock's sibling regenerateMatchups, wired one level up in
// ScorerView) and Cancel (onCancel, already existing on every card) are
// reused as-is, not reimplemented here.
export default function NextMatchupCard({
  matchup,
  players,
  candidates,
  label,
  onReassign,
  onSubstitute,
  onToggleLock,
  onMoveToQueue,
  onHold,
  onResume,
  onCancel,
  isNext,
  onSetNextMatchup,
  isLatecomerPriority,
  onApprove,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [subbingId, setSubbingId] = useState(null);
  const [subChoice, setSubChoice] = useState(null);
  const [showWhy, setShowWhy] = useState(false);

  const allIds = [...matchup.teamA, ...matchup.teamB];

  const startEdit = () => {
    const map = {};
    matchup.teamA.forEach((id) => (map[id] = "A"));
    matchup.teamB.forEach((id) => (map[id] = "B"));
    setDraft(map);
    setSubbingId(null);
    setEditing(true);
  };

  const toggleSide = (id) => {
    setDraft((d) => ({ ...d, [id]: d[id] === "A" ? "B" : "A" }));
  };

  const draftACount = allIds.filter((id) => draft[id] === "A").length;
  const draftValid = draftACount === 2;

  const saveEdit = () => {
    if (!draftValid) return;
    const teamA = allIds.filter((id) => draft[id] === "A");
    const teamB = allIds.filter((id) => draft[id] === "B");
    onReassign(matchup.id, teamA, teamB);
    setEditing(false);
  };

  const startSub = (id) => {
    setSubbingId(id);
    setSubChoice(null);
    setEditing(false);
  };

  const cancelSub = () => setSubbingId(null);

  // Substitute Right Away — see PROJECT.md/FEATURES.md. Picking a name from
  // PlayerPicker performs the substitution immediately — no separate
  // "Confirm sub" click required, same as the live-court substitution flow
  // (CourtCard.jsx).
  const chooseSub = (incomingId) => {
    setSubChoice(incomingId);
    onSubstitute(matchup.id, subbingId, incomingId);
    setSubbingId(null);
  };

  return (
    <div style={styles.matchupCard(label === "Next up")}>
      <div style={styles.matchupHeadRow}>
        <div style={styles.matchupHeader(label === "Next up")}>{label}</div>
        {isLatecomerPriority && (
          <span style={styles.courtBadge} title="A latecomer was prioritized into this matchup">
            PRIORITY
          </span>
        )}
        <div style={{ display: "flex", gap: 6 }}>
          {onSetNextMatchup && (
            <button
              style={styles.lockToggleBtn(!!isNext)}
              onClick={isNext ? undefined : onSetNextMatchup}
              disabled={isNext}
              aria-label={isNext ? "this is the designated Next Match" : "set as Next Match"}
              title={isNext ? "This matchup is designated as Next Match" : "Designate this matchup as Next Match for announcement"}
            >
              <Star size={12} strokeWidth={2.5} />
              {isNext ? "Next Match" : "Set as Next Match"}
            </button>
          )}
          <button
            style={styles.lockToggleBtn(!!matchup.locked)}
            onClick={() => onToggleLock(matchup.id)}
            aria-label={matchup.locked ? "unlock this matchup" : "lock this matchup"}
            title={
              matchup.locked
                ? "Locked — won't be touched by Regenerate matchups"
                : "Lock so Regenerate matchups leaves this one alone"
            }
          >
            {matchup.locked ? <Lock size={12} strokeWidth={2.5} /> : <Unlock size={12} strokeWidth={2.5} />}
            {matchup.locked ? "Locked" : "Lock"}
          </button>
          {(onHold || onResume) && (
            <button
              style={styles.lockToggleBtn(!!matchup.held)}
              onClick={() => (matchup.held ? onResume() : onHold())}
              aria-label={matchup.held ? "resume this matchup" : "hold this matchup"}
              title={
                matchup.held
                  ? "Held — reserved but skipped by automatic court assignment. Resume to return it to normal deployment (same position, not sent to the back)"
                  : "Hold — reserve this matchup but skip it for automatic court assignment until Resumed"
              }
            >
              {matchup.held ? <Play size={12} strokeWidth={2.5} /> : <Pause size={12} strokeWidth={2.5} />}
              {matchup.held ? "Held" : "Hold"}
            </button>
          )}
          {onCancel && (
            <button
              style={styles.lockToggleBtn(false)}
              onClick={onCancel}
              aria-label="cancel this matchup"
              title="Cancel — dissolve this matchup and return all 4 players to the waiting queue"
            >
              <X size={12} strokeWidth={2.5} />
              Cancel
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div>
          <p style={styles.editHint}>Tap a player to move them to the other side.</p>
          <div style={styles.editGrid}>
            {allIds.map((id) => (
              <button
                key={id}
                style={{
                  ...styles.editChip,
                  ...(draft[id] === "A" ? styles.editChipA : styles.editChipB),
                }}
                onClick={() => toggleSide(id)}
              >
                <span style={styles.editChipName}>{players[id]?.name}</span>
                <span style={styles.editChipSide}>{draft[id]}</span>
              </button>
            ))}
          </div>
          {!draftValid && <p style={styles.editWarning}>Each side needs exactly 2 players.</p>}
          <div style={styles.editActions}>
            <button style={styles.secondaryBtn} onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              style={{ ...styles.primaryBtn, ...(!draftValid ? styles.btnDisabled : {}) }}
              onClick={saveEdit}
              disabled={!draftValid}
            >
              <Check size={14} strokeWidth={3} />
              Save teams
            </button>
          </div>
        </div>
      ) : subbingId ? (
        <div>
          <p style={styles.editHint}>Substitute for {players[subbingId]?.name} — tap a name to sub in right away</p>
          <PlayerPicker
            candidates={candidates}
            outgoingPlayer={players[subbingId]}
            selectedId={subChoice}
            onSelect={chooseSub}
            emptyMessage="No one else is available to sub in right now."
          />
          <p style={styles.subReturnLabel}>
            {players[subbingId]?.name} will go back to the waiting queue.
          </p>
          <div style={styles.editActions}>
            <button style={styles.secondaryBtn} onClick={cancelSub}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          {label === "Next up" && <span style={styles.dialogLabel}>NEXT MATCH PROPOSAL</span>}
          <div style={styles.matchupTeams}>
            <div style={styles.matchupTeam}>
              {matchup.teamA.map((id, i) => (
                <PlayerChip
                  key={id}
                  player={players[id]}
                  onSubClick={() => startSub(id)}
                  onMoveToQueueClick={onMoveToQueue ? () => onMoveToQueue(id) : null}
                  hideAvatar
                  hidePayment
                  index={i}
                />
              ))}
            </div>
            <span style={styles.matchupVs}>VS</span>
            <div style={styles.matchupTeam}>
              {matchup.teamB.map((id, i) => (
                <PlayerChip
                  key={id}
                  player={players[id]}
                  onSubClick={() => startSub(id)}
                  onMoveToQueueClick={onMoveToQueue ? () => onMoveToQueue(id) : null}
                  hideAvatar
                  hidePayment
                  index={matchup.teamA.length + i}
                />
              ))}
            </div>
          </div>

          {label === "Next up" && matchup.fairness && (
            <FairnessProposalPanel matchup={matchup} players={players} showWhy={showWhy} setShowWhy={setShowWhy} />
          )}

          <div style={styles.courtActionsRow}>
            {label === "Next up" && onApprove && (
              <button
                style={styles.approveMatchBtn}
                onClick={onApprove}
                title="Deploy this exact matchup to the next available court"
              >
                <Check size={13} strokeWidth={2.5} />
                Approve Next Match
              </button>
            )}
            <button style={styles.fixTeamsBtn} onClick={startEdit}>
              <Shuffle size={12} strokeWidth={2.5} />
              Fix teams
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Next Match Proposal's "Why these players?" breakdown — organizer-facing
// only (ScorerView), never shown on the read-only QueueList views players
// or the TV Board see. Purely presentational: reads already-existing
// player fields (games, checkedInAt/lastMatchEndAt, partnerCounts/
// recentPartnerIds, opponentCounts/recentOpponentIds, lastResult) and the
// matchup.fairness metadata AdaptiveSkillRotationEngine already attaches
// (see its describeFairness) — computes nothing the engine doesn't already
// know, reimplements no matchmaking logic.
function FairnessProposalPanel({ matchup, players, showWhy, setShowWhy }) {
  const allIds = [...matchup.teamA, ...matchup.teamB];
  const now = Date.now();
  const waitMinutesFor = (id) => {
    const p = players[id];
    const since = p?.lastMatchEndAt ?? p?.checkedInAt ?? now;
    return Math.round((now - since) / 60000);
  };

  return (
    <div style={styles.fairnessProposal}>
      <div style={styles.fairnessNote(matchup.fairness.usedLookahead || matchup.fairness.guardRelaxed)}>
        {matchup.fairness.reason}
      </div>
      <button style={styles.fairnessToggle} onClick={() => setShowWhy((v) => !v)}>
        {showWhy ? <ChevronDown size={13} strokeWidth={2.5} /> : <ChevronRight size={13} strokeWidth={2.5} />}
        Why these players?
      </button>
      {showWhy && (
        <div style={styles.fairnessBreakdownGrid}>
          <div style={styles.fairnessBreakdownCol}>
            <div style={styles.fairnessBreakdownColTitle}>Queue priority</div>
            {allIds.map((id) => (
              <div key={id} style={styles.fairnessBreakdownRow}>
                {players[id]?.name} — waited {waitMinutesFor(id)} min
              </div>
            ))}
          </div>
          <div style={styles.fairnessBreakdownCol}>
            <div style={styles.fairnessBreakdownColTitle}>Games played</div>
            {allIds.map((id) => (
              <div key={id} style={styles.fairnessBreakdownRow}>
                {players[id]?.name} — {players[id]?.games || 0}
              </div>
            ))}
          </div>
          <div style={styles.fairnessBreakdownCol}>
            <div style={styles.fairnessBreakdownColTitle}>Match quality</div>
            <ul style={styles.fairnessQualityList}>
              {describeMatchQuality(matchup, players).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// Qualitative match-quality summary — reads only already-existing player
// fields (partner/opponent recency, lastResult); never recomputes or
// second-guesses the engine's own scoring.
function describeMatchQuality(matchup, players) {
  const [a1, a2] = matchup.teamA;
  const [b1, b2] = matchup.teamB;
  const lines = [];

  const skill = players[a1]?.skill || players[b1]?.skill;
  lines.push(skill ? `Skill balance: both teams are ${skill} division` : "Skill balance: same-division matchup");

  const partnerRepeat =
    (players[a1]?.recentPartnerIds || []).includes(a2) || (players[b1]?.recentPartnerIds || []).includes(b2);
  lines.push(
    partnerRepeat
      ? "Partner diversity: a recent-partner repeat could not be fully avoided this round"
      : "Partner diversity: no recent-partner repeats on either team"
  );

  const oppRepeat = [a1, a2].some(
    (x) => (players[x]?.recentOpponentIds || []).includes(b1) || (players[x]?.recentOpponentIds || []).includes(b2)
  );
  lines.push(
    oppRepeat
      ? "Opponent diversity: a recent-opponent repeat could not be fully avoided this round"
      : "Opponent diversity: no recent-opponent repeats between the two teams"
  );

  const results = [a1, a2, b1, b2].map((id) => players[id]?.lastResult);
  if (results.every((r) => r && r === results[0])) {
    lines.push(`Winner/loser structure: all 4 players are coming off a ${results[0]}`);
  } else if (results.some((r) => r)) {
    lines.push("Winner/loser structure: not applicable this round (mixed results)");
  }

  return lines;
}

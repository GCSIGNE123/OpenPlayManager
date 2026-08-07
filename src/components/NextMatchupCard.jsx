import { useState } from "react";
import { Check, Lock, Pause, Play, Shuffle, Unlock, X } from "lucide-react";
import { styles } from "../styles.js";
import PlayerChip from "./PlayerChip.jsx";
import PlayerPicker from "./PlayerPicker.jsx";

// A pre-built upcoming matchup, editable before it's assigned to a court —
// mirrors CourtCard's "fix teams" / substitute interactions, minus anything
// score/court-status related since this matchup isn't live yet.
export default function NextMatchupCard({
  matchup,
  players,
  candidates,
  recommendedIds,
  label,
  onReassign,
  onSubstitute,
  onToggleLock,
  onMoveToQueue,
  onHold,
  onResume,
  onCancel,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [subbingId, setSubbingId] = useState(null);
  const [subChoice, setSubChoice] = useState(null);

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
        <div style={{ display: "flex", gap: 6 }}>
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
            recommendedIds={recommendedIds}
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
          <div style={styles.matchupTeams}>
            <div style={styles.matchupTeam}>
              {matchup.teamA.map((id, i) => (
                <PlayerChip
                  key={id}
                  player={players[id]}
                  onSubClick={() => startSub(id)}
                  onMoveToQueueClick={onMoveToQueue ? () => onMoveToQueue(id) : null}
                  hideAvatar
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
                  index={matchup.teamA.length + i}
                />
              ))}
            </div>
          </div>
          <div style={styles.courtActionsRow}>
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

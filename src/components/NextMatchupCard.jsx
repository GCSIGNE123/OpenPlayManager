import { useState } from "react";
import { Check, Lock, Repeat, Shuffle, Unlock } from "lucide-react";
import { styles } from "../styles.js";
import Avatar from "./Avatar.jsx";
import PlayerChip from "./PlayerChip.jsx";
import PlayerPicker from "./PlayerPicker.jsx";

// A pre-built upcoming matchup, editable before it's assigned to a court —
// mirrors CourtCard's "fix teams" / substitute interactions, minus anything
// score/court-status related since this matchup isn't live yet.
export default function NextMatchupCard({
  matchup,
  players,
  unassignedPlayers,
  label,
  onReassign,
  onSubstitute,
  onToggleLock,
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

  const confirmSub = () => {
    if (!subChoice) return;
    onSubstitute(matchup.id, subbingId, subChoice);
    setSubbingId(null);
  };

  return (
    <div style={styles.matchupCard(label === "Next up")}>
      <div style={styles.matchupHeadRow}>
        <div style={styles.matchupHeader(label === "Next up")}>{label}</div>
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
                <Avatar player={players[id]} size={22} />
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
          <p style={styles.editHint}>Substitute for {players[subbingId]?.name}</p>
          <PlayerPicker
            players={unassignedPlayers}
            selectedId={subChoice}
            onSelect={setSubChoice}
            emptyMessage="No one else is waiting to sub in right now."
          />
          <p style={styles.subReturnLabel}>
            {players[subbingId]?.name} will go back to the waiting queue.
          </p>
          <div style={styles.editActions}>
            <button style={styles.secondaryBtn} onClick={cancelSub}>
              Cancel
            </button>
            <button
              style={{ ...styles.primaryBtn, ...(!subChoice ? styles.btnDisabled : {}) }}
              onClick={confirmSub}
              disabled={!subChoice}
            >
              <Repeat size={14} strokeWidth={3} />
              Confirm sub
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={styles.matchupTeams}>
            <div style={styles.matchupTeam}>
              {matchup.teamA.map((id) => (
                <PlayerChip key={id} player={players[id]} onSubClick={() => startSub(id)} />
              ))}
            </div>
            <span style={styles.matchupVs}>VS</span>
            <div style={styles.matchupTeam}>
              {matchup.teamB.map((id) => (
                <PlayerChip key={id} player={players[id]} onSubClick={() => startSub(id)} />
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

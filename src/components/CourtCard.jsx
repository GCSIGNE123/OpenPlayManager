import { useState } from "react";
import { Check, Repeat, RotateCcw, Shuffle, Trophy } from "lucide-react";
import { styles } from "../styles.js";
import Avatar from "./Avatar.jsx";
import TeamRow from "./TeamRow.jsx";

export default function CourtCard({
  court,
  players,
  waitingPlayers,
  readOnly,
  onFill,
  onScore,
  onEnd,
  onReassign,
  onSubstitute,
  canFill,
}) {
  const isLive = court.status === "live" || court.status === "finished";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [subbingId, setSubbingId] = useState(null);
  const [subChoice, setSubChoice] = useState(null);

  const startEdit = () => {
    const map = {};
    court.teamA.forEach((id) => (map[id] = "A"));
    court.teamB.forEach((id) => (map[id] = "B"));
    setDraft(map);
    setSubbingId(null);
    setEditing(true);
  };

  const startSub = (id) => {
    setSubbingId(id);
    setSubChoice(null);
    setEditing(false);
  };

  const cancelSub = () => setSubbingId(null);

  const confirmSub = () => {
    if (!subChoice) return;
    onSubstitute(subbingId, subChoice);
    setSubbingId(null);
  };

  const toggleSide = (id) => {
    setDraft((d) => ({ ...d, [id]: d[id] === "A" ? "B" : "A" }));
  };

  const allIds = [...court.teamA, ...court.teamB];
  const draftACount = allIds.filter((id) => draft[id] === "A").length;
  const draftValid = draftACount === 2;

  const saveEdit = () => {
    if (!draftValid) return;
    const teamA = allIds.filter((id) => draft[id] === "A");
    const teamB = allIds.filter((id) => draft[id] === "B");
    onReassign(teamA, teamB);
    setEditing(false);
  };

  return (
    <div style={styles.courtCard(court.status)}>
      <div style={styles.courtHeadRow}>
        <span style={styles.courtBadge}>COURT {court.number}</span>
        <span style={styles.statusTag(court.status)}>
          {court.status === "open" ? "OPEN" : court.status === "finished" ? "MATCH POINT" : "LIVE"}
        </span>
      </div>

      {!isLive && (
        <div style={styles.openCourtBody}>
          <p style={styles.openCourtText}>Court is free</p>
          {!readOnly && (
            <button
              style={{ ...styles.secondaryBtn, ...(!canFill ? styles.btnDisabled : {}) }}
              onClick={onFill}
              disabled={!canFill}
            >
              <Shuffle size={14} strokeWidth={2.5} />
              Assign match
            </button>
          )}
        </div>
      )}

      {isLive && editing && (
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
      )}

      {isLive && subbingId && (
        <div>
          <p style={styles.editHint}>Substitute for {players[subbingId]?.name}</p>
          {waitingPlayers.length === 0 ? (
            <p style={styles.editWarning}>No one is waiting to sub in right now.</p>
          ) : (
            <div style={styles.editGrid}>
              {waitingPlayers.map((p) => (
                <button
                  key={p.id}
                  style={{
                    ...styles.editChip,
                    ...(subChoice === p.id ? styles.editChipA : {}),
                  }}
                  onClick={() => setSubChoice(p.id)}
                >
                  <Avatar player={p} size={22} />
                  <span style={styles.editChipName}>{p.name}</span>
                </button>
              ))}
            </div>
          )}
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
      )}

      {isLive && !editing && !subbingId && (
        <div>
          <TeamRow
            ids={court.teamA}
            players={players}
            score={court.scoreA}
            onMinus={() => onScore && onScore("A", -1)}
            onPlus={() => onScore && onScore("A", 1)}
            readOnly={readOnly}
            leading={court.scoreA > court.scoreB}
            onRequestSub={!readOnly ? startSub : null}
          />
          <div style={styles.vsLine} />
          <TeamRow
            ids={court.teamB}
            players={players}
            score={court.scoreB}
            onMinus={() => onScore && onScore("B", -1)}
            onPlus={() => onScore && onScore("B", 1)}
            readOnly={readOnly}
            leading={court.scoreB > court.scoreA}
            onRequestSub={!readOnly ? startSub : null}
          />
          {!readOnly && (
            <div style={styles.courtActionsRow}>
              <button style={styles.fixTeamsBtn} onClick={startEdit}>
                <Shuffle size={12} strokeWidth={2.5} />
                Fix teams
              </button>
              <button
                style={{
                  ...styles.endMatchBtn,
                  ...(court.status !== "finished" ? { opacity: 0.55 } : {}),
                }}
                onClick={onEnd}
              >
                {court.status === "finished" ? (
                  <>
                    <Trophy size={14} strokeWidth={2.5} /> End match & requeue players
                  </>
                ) : (
                  <>
                    <RotateCcw size={14} strokeWidth={2.5} /> End match early
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

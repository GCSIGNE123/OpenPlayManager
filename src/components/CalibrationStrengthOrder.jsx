import { useState } from "react";
import { styles } from "../styles.js";
import { cleanStrengthOrder } from "../lib/calibrationProfile.js";

// CALIBRATION STRENGTH — optional, session-only. The organizer orders the
// calibration MATCH GROUPS of a round (not players) from strongest to weakest.
// Court numbers mean nothing here: the order is whatever the organizer applies.
// Skipping leaves the Calibration Profile exactly as it was.
function RoundOrder({ round, groups, players, saved, onApply, onClear }) {
  const defaultIds = groups.map((g) => g.courtNumber);
  const [draft, setDraft] = useState(null);
  const current = cleanStrengthOrder(draft ?? saved ?? defaultIds, groups, round);
  // groups locked after a draft/saved order was made are appended at the end
  const order = [...current, ...defaultIds.filter((id) => !current.includes(id))];
  const byId = new Map(groups.map((g) => [g.courtNumber, g]));
  const nameOf = (id) => players?.[id]?.name || "Player";
  const move = (i, d) => {
    const next = [...order];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setDraft(next);
  };
  const applied = Array.isArray(saved) && saved.length >= 2;
  const dirty = draft !== null;
  return (
    <div style={{ marginTop: 8 }} data-testid={`strength-round-${round}`}>
      <div style={{ fontSize: 12, fontWeight: 700 }}>
        ROUND {round} — STRONGEST → WEAKEST {applied && !dirty ? "· order applied" : applied ? "· unsaved changes" : "· not ordered (skipped)"}
      </div>
      <ol style={{ margin: "4px 0", paddingLeft: 20 }}>
        {order.map((id, i) => {
          const g = byId.get(id);
          const [a, b, c, d] = [g.playerIds[0], g.playerIds[1], g.playerIds[2], g.playerIds[3]];
          return (
            <li key={id} style={{ fontSize: 13, marginBottom: 2 }}>
              <strong>Court {id}</strong> — {nameOf(a)}, {nameOf(b)} vs {nameOf(c)}, {nameOf(d)}{" "}
              <button type="button" style={styles.secondaryBtn} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move Court ${id} stronger`} title="Move stronger">▲</button>{" "}
              <button type="button" style={styles.secondaryBtn} onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`Move Court ${id} weaker`} title="Move weaker">▼</button>
            </li>
          );
        })}
      </ol>
      <button type="button" style={styles.secondaryBtn} data-testid={`strength-apply-${round}`} onClick={() => { onApply(round, order); setDraft(null); }}>
        Apply order
      </button>{" "}
      {(applied || dirty) && (
        <button type="button" style={styles.secondaryBtn} onClick={() => { onClear(round); setDraft(null); }}>
          Skip / clear
        </button>
      )}
    </div>
  );
}

// Read-only view once Adaptive Matchmaking has begun: the applied order can be
// seen but not changed, and no Apply / Skip control exists.
function LockedView({ state, groups }) {
  const order = state.calibrationStrengthOrder || {};
  const rounds = [...new Set(groups.map((g) => g.round))].sort();
  if (rounds.length === 0) return null;
  const nameOf = (id) => state.players?.[id]?.name || "Player";
  return (
    <div style={{ marginTop: 10 }} data-testid="calibration-strength-locked">
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4 }}>CALIBRATION STRENGTH</div>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Locked for this session</div>
      {rounds.map((r) => {
        const ids = order[r];
        const has = Array.isArray(ids) && ids.length >= 2;
        return (
          <div key={r} style={{ fontSize: 13, marginTop: 4 }} data-testid={`strength-locked-round-${r}`}>
            <strong>Round {r}:</strong> {has ? "order applied (strongest → weakest)" : "not ordered (skipped)"}
            {has && (
              <ol style={{ margin: "2px 0", paddingLeft: 20 }}>
                {ids.map((id) => {
                  const g = groups.find((x) => x.round === r && x.courtNumber === id);
                  return g ? (
                    <li key={id}>Court {id} — {nameOf(g.playerIds[0])}, {nameOf(g.playerIds[1])} vs {nameOf(g.playerIds[2])}, {nameOf(g.playerIds[3])}</li>
                  ) : null;
                })}
              </ol>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function CalibrationStrengthOrder({ state, locked = false, onApply, onClear }) {
  const groups = state.calibrationGroups || [];
  if (locked) return <LockedView state={state} groups={groups} />;
  const rounds = [...new Set(groups.map((g) => g.round))].sort();
  const usable = rounds.filter((r) => groups.filter((g) => g.round === r).length >= 2);
  if (usable.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }} data-testid="calibration-strength">
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4 }}>CALIBRATION STRENGTH (optional)</div>
      <div style={{ fontSize: 13 }}>
        Order the calibration matches approximately from strongest to weakest. This helps matchmaking during the early rounds while Points are still new. It is a temporary, session-only hint that awards no Points and fades as real results come in. Leave it alone to skip.
      </div>
      {usable.map((r) => (
        <RoundOrder
          key={r}
          round={r}
          groups={groups.filter((g) => g.round === r).sort((a, b) => a.courtNumber - b.courtNumber)}
          players={state.players}
          saved={state.calibrationStrengthOrder?.[r]}
          onApply={onApply}
          onClear={onClear}
        />
      ))}
    </div>
  );
}

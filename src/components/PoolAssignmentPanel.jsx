import { styles } from "../styles.js";
import { buildEntrants } from "../lib/tournament.js";
import { entrantKey, poolLabel } from "../engines/PoolAssignment.js";

// Manual Pool Assignment — see PROJECT.md/FEATURES.md. UI-ONLY, same shape
// as TeamSetupPanel.jsx's own Custom Doubles Team Assignment: no new
// tournament-engine data model. It previews the exact entrant list
// buildAndSaveRoundRobinTournament will build (buildEntrants, reading the
// SAME players + partnerId Team Setup already locked in) and lets the
// organizer point each entrant at a pool index. The map it produces
// ({entrantKey -> poolIndex}) is read by engines/PoolAssignment.js's
// manualAssignment — the pre-existing "manual" seam already registered in
// POOL_ASSIGNMENT_METHODS, not a parallel pool concept.
//
// The draft itself (state.pendingPoolAssignment) is owned by the caller
// (PickleballOpenPlay.jsx's setPoolAssignmentTeam/confirmPoolAssignment/
// editPoolAssignment/resetPoolAssignment) and persisted through the
// session's existing save() path — it survives refresh/reload exactly like
// pendingTournamentTemplate does, and is cleared the moment Generate
// Schedule actually runs (generateTournamentSchedule).
//
// Rendered both before the FIRST Generate Schedule and again for every
// Regenerate (see TournamentScheduleView — hidden only once the tournament
// is `completed`, same condition Regenerate itself already uses). A
// completed tournament's frozen entrants make a fresh pool assignment
// meaningless, same reasoning as Team Setup's own header comment; every
// earlier tournament state (including one with an already-generated,
// not-yet-completed schedule) can still have its pools reassigned, exactly
// as Regenerate schedule already warns it will rebuild from current
// players/results.
export default function PoolAssignmentPanel({ players, mode, poolCount, draft, onSetTeam, onConfirm, onEdit, onReset }) {
  if (poolCount < 2) return null; // a single pool has nothing to assign — Generate Schedule proceeds directly

  let entrants;
  let buildError = "";
  try {
    entrants = buildEntrants(Object.values(players || {}).filter((p) => p.checkedIn && p.status !== "CHECKED_OUT"), mode);
  } catch (e) {
    entrants = [];
    buildError = e.message || "Couldn't build teams for pool assignment.";
  }

  const assignments = draft && draft.mode === mode && draft.poolCount === poolCount ? draft.assignments : {};
  const confirmed = Boolean(draft?.confirmed) && draft?.mode === mode && draft?.poolCount === poolCount;

  const byPool = Array.from({ length: poolCount }, () => []);
  const unassigned = [];
  for (const e of entrants) {
    const key = entrantKey(e);
    const idx = assignments[key];
    if (Number.isInteger(idx) && idx >= 0 && idx < poolCount) byPool[idx].push(e);
    else unassigned.push(e);
  }
  const sizes = byPool.map((g) => g.length);
  const balanced = sizes.every((s) => s === sizes[0]);
  const allAssigned = unassigned.length === 0 && entrants.length > 0;

  const assignPicker = (entrant) => (
    <select
      style={styles.tPartnerSelect}
      disabled={confirmed}
      value={Number.isInteger(assignments[entrantKey(entrant)]) ? assignments[entrantKey(entrant)] : ""}
      onChange={(e) => onSetTeam(mode, poolCount, entrantKey(entrant), e.target.value === "" ? null : Number(e.target.value))}
      title="Assign this team to a pool."
    >
      <option value="">Unassigned</option>
      {Array.from({ length: poolCount }, (_, i) => (
        <option key={i} value={i}>
          {poolLabel(i)}
        </option>
      ))}
    </select>
  );

  return (
    <div style={styles.tSetupCard}>
      <h3 style={styles.tSubheading}>Pool Assignment</h3>
      {buildError && <p style={styles.tWarningText}>{buildError}</p>}
      <p style={styles.tControlHint}>
        {confirmed
          ? "Pools are confirmed and locked. Edit Pools to change them before generating the schedule."
          : "Assign every team to a pool before generating the schedule. Teams are not distributed automatically — you decide exactly who plays in which pool."}
      </p>

      <p style={styles.tFieldLabel}>Unassigned — {unassigned.length} team{unassigned.length === 1 ? "" : "s"}</p>
      {unassigned.length === 0 ? (
        <p style={styles.tControlHint}>Every team has been assigned to a pool.</p>
      ) : (
        <ul style={styles.rosterList}>
          {unassigned.map((e) => (
            <li key={e.id} style={styles.tRosterRow}>
              <span style={{ ...styles.tQueueName, ...styles.tTeamNameProminent }}>{e.label}</span>
              {assignPicker(e)}
            </li>
          ))}
        </ul>
      )}

      {byPool.map((group, i) => (
        <div key={i}>
          <p style={styles.tFieldLabel}>
            {poolLabel(i)} ({group.length} team{group.length === 1 ? "" : "s"})
          </p>
          {group.length === 0 ? (
            <p style={styles.tControlHint}>No teams assigned yet.</p>
          ) : (
            <ul style={styles.rosterList}>
              {group.map((e) => (
                <li key={e.id} style={styles.tRosterRow}>
                  <span style={{ ...styles.tQueueName, ...styles.tTeamNameProminent }}>{e.label}</span>
                  {assignPicker(e)}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {!balanced && entrants.length > 0 && (
        <p style={styles.tWarningText}>
          Pool sizes are uneven ({sizes.map((s, i) => `${poolLabel(i)}: ${s}`).join(", ")}). This is allowed — Round Robin
          pools don't need to match in size — but double-check this is what you intend before confirming.
        </p>
      )}
      {!allAssigned && entrants.length > 0 && !confirmed && (
        <p style={styles.tWarningText}>
          {unassigned.length} team{unassigned.length === 1 ? "" : "s"} still need{unassigned.length === 1 ? "s" : ""} a pool
          — Generate Schedule stays disabled until every team is assigned.
        </p>
      )}

      <div style={styles.tControlsRow}>
        {!confirmed ? (
          <button
            type="button"
            style={{ ...styles.tPrimaryBtn, ...(!allAssigned ? styles.tBtnDisabled : {}) }}
            disabled={!allAssigned}
            onClick={onConfirm}
          >
            Confirm Pools
          </button>
        ) : (
          <>
            <button type="button" style={styles.tActionBtn} onClick={onEdit}>
              Edit Pools
            </button>
            <button type="button" style={styles.tActionBtn} onClick={onReset}>
              Clear &amp; Start Over
            </button>
          </>
        )}
      </div>
    </div>
  );
}

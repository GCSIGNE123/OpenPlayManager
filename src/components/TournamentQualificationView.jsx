import { Fragment, useEffect, useState } from "react";
import { styles } from "../styles.js";
import { getTournamentEngine, fetchQualificationAuditHistory } from "../lib/tournament.js";
import { PoolQualificationService } from "../engines/PoolQualificationService.js";
import SectionLabel from "./SectionLabel.jsx";

const qualificationService = new PoolQualificationService();

const STATUS_ICONS = { qualified: "🟢", eliminated: "🔴", pending: "⏳", wildCard: "⭐", bestThirdPlace: "⭐", manualOverride: "⭐" };
const STATUS_LABELS = { qualified: "Qualified", eliminated: "Eliminated", pending: "Pending", wildCard: "Wild Card", bestThirdPlace: "Best Third Place", manualOverride: "Manual Override" };

// Inline action form — appears under whichever row's Promote/Eliminate/
// Replace/Reset button was just clicked, matching this app's established
// "inline edit, not a modal" pattern (BracketMatchCard's score entry works
// the same way). "Replace" needs a second participant picker (any
// currently-eliminated row); every other action just needs director+reason.
function OverrideForm({ pendingAction, eliminatedCandidates, director, setDirector, onConfirm, onCancel, error }) {
  const [reason, setReason] = useState("");
  const [replacementId, setReplacementId] = useState("");
  const needsReason = pendingAction.action !== "reset";
  const needsReplacement = pendingAction.action === "replace";

  return (
    <div style={{ ...styles.historyMatchCard, marginTop: 6, marginBottom: 6 }}>
      <p style={styles.dialogLabel}>
        {pendingAction.action === "promote" && `Promote ${pendingAction.label} to Qualified`}
        {pendingAction.action === "eliminate" && `Eliminate ${pendingAction.label}`}
        {pendingAction.action === "replace" && `Replace ${pendingAction.label} with…`}
        {pendingAction.action === "reset" && `Reset ${pendingAction.label} to automatic qualification`}
      </p>
      {needsReplacement && (
        <select style={{ ...styles.rotationSelect, marginBottom: 6 }} value={replacementId} onChange={(e) => setReplacementId(e.target.value)}>
          <option value="">Select a replacement…</option>
          {eliminatedCandidates.map((c) => (
            <option key={c.participantId} value={c.participantId}>
              {c.label} ({c.poolLabel})
            </option>
          ))}
        </select>
      )}
      <input style={{ ...styles.input, marginBottom: 6 }} placeholder="Director name" value={director} onChange={(e) => setDirector(e.target.value)} />
      {needsReason && (
        <input style={{ ...styles.input, marginBottom: 6 }} placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
      )}
      {error && <p style={styles.editWarning}>{error}</p>}
      <div style={styles.editActions}>
        <button type="button" style={styles.secondaryBtn} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          style={styles.primaryBtn}
          onClick={() => onConfirm({ director, reason, replacementId })}
          disabled={(needsReason && !reason.trim()) || !director.trim() || (needsReplacement && !replacementId)}
        >
          Confirm
        </button>
      </div>
    </div>
  );
}

// Qualification tab — see PROJECT.md's Pool Qualification Engine +
// Manual Qualification Override sections. PoolQualificationService is
// format-agnostic (any tournament with a `pools` array works), but this
// view is only wired up for Round Robin so far, matching the Standings
// tab's own scope. Qualification is pure derived data recomputed on every
// render (same pattern as Standings) — only the manual overrides
// themselves (tournament.manualOverrides) and the audit trail are
// persisted; everything else here is computed fresh.
//
// Every pool renders live, independently of its siblings — a pool that's
// already finished shows real Qualified/Eliminated the moment IT completes,
// even while another pool is still mid-match and shows Pending. The
// Overall Qualifiers/Playoff Stage summary only appears once every pool is
// done (result.ready), since a cross-pool seed list isn't meaningful until
// then — manual override actions are gated the same way (nothing to
// override until qualification is otherwise final).
export default function TournamentQualificationView({
  tournament,
  loading,
  qualificationError,
  onPromote,
  onEliminate,
  onReplace,
  onReset,
  onLock,
}) {
  const [pendingAction, setPendingAction] = useState(null); // { action, participantId, label } | null
  const [director, setDirector] = useState("");
  const [auditHistory, setAuditHistory] = useState([]);

  useEffect(() => {
    if (!tournament?.id) return;
    let cancelled = false;
    fetchQualificationAuditHistory(tournament.id).then((history) => {
      if (!cancelled) setAuditHistory(history);
    });
    return () => {
      cancelled = true;
    };
    // Re-fetch whenever the tournament record changes (a successful
    // override bumps updatedAt), so the audit trail stays current without
    // a manual refresh.
  }, [tournament?.id, tournament?.updatedAt]);

  if (loading) return <p style={styles.editHint}>Loading tournament…</p>;
  if (!tournament) {
    return <div style={styles.placeholderCard}>Generate a schedule from the Schedule tab to see qualification here.</div>;
  }
  if (tournament.format !== "roundRobin") {
    return <div style={styles.placeholderCard}>Qualification isn't available for this tournament format yet.</div>;
  }

  const engine = getTournamentEngine(tournament.format);
  const result = qualificationService.determineQualifiers(tournament, engine);
  const overrideEnabled = tournament.allowManualQualificationOverride && !tournament.bracket && !tournament.qualificationLocked;
  const eliminatedCandidates = result.pools.flatMap((p) => p.rows.filter((r) => !r.qualified));

  const handleConfirm = async ({ director: enteredDirector, reason, replacementId }) => {
    try {
      if (pendingAction.action === "promote") await onPromote(pendingAction.participantId, { director: enteredDirector, reason });
      else if (pendingAction.action === "eliminate") await onEliminate(pendingAction.participantId, { director: enteredDirector, reason });
      else if (pendingAction.action === "replace") await onReplace(pendingAction.participantId, replacementId, { director: enteredDirector, reason });
      else if (pendingAction.action === "reset") await onReset(pendingAction.participantId, { director: enteredDirector });
      setPendingAction(null);
    } catch (e) {
      // qualificationError (from the parent) surfaces the message; keep
      // the form open so the director can fix and retry rather than
      // losing what they typed.
    }
  };

  return (
    <div>
      <SectionLabel>Qualification</SectionLabel>

      {result.ready ? (
        <div style={styles.sessionInfoCard}>
          <div style={styles.sessionInfoItem}>
            <span style={styles.sessionInfoLabel}>Teams Advancing Per Pool</span>
            <span style={styles.sessionInfoValue}>{tournament.advancesPerPool ?? 1}</span>
          </div>
          <div style={styles.sessionInfoItem}>
            <span style={styles.sessionInfoLabel}>Qualified Teams</span>
            <span style={styles.sessionInfoValue}>{result.playoffSize.count}</span>
          </div>
          <div style={styles.sessionInfoItem}>
            <span style={styles.sessionInfoLabel}>Playoff Stage</span>
            <span style={styles.sessionInfoValue}>{result.playoffSize.stage}</span>
          </div>
          {tournament.qualificationMethod && tournament.qualificationMethod !== "standard" && (
            <div style={styles.sessionInfoItem}>
              <span style={styles.sessionInfoLabel}>Qualification Method</span>
              <span style={styles.sessionInfoValue}>{tournament.qualificationMethod === "wildCard" ? "Standard + Wild Cards" : "Standard + Best Third Place"}</span>
            </div>
          )}
          {tournament.allowManualQualificationOverride && (
            <div style={styles.sessionInfoItem}>
              <span style={styles.sessionInfoLabel}>Manual Override</span>
              <span style={styles.sessionInfoValue}>{tournament.bracket ? "Bracket generated" : tournament.qualificationLocked ? "Locked" : "Editable"}</span>
            </div>
          )}
        </div>
      ) : (
        <p style={styles.editHint}>
          Qualifiers finalize pool by pool as each one finishes — a pool still in progress shows ⏳ Pending until then.
        </p>
      )}

      {qualificationError && <p style={styles.editWarning}>{qualificationError}</p>}
      {result.ready && tournament.allowManualQualificationOverride && !result.qualificationListValidation.valid && (
        <p style={styles.editWarning}>{result.qualificationListValidation.errors.join(" ")}</p>
      )}

      {result.pools.map((pool) => (
        <div key={pool.poolId} style={styles.poolScheduleBlock}>
          <h3 style={styles.poolHeading}>
            {pool.poolLabel} {pool.complete ? "" : "— in progress"}
          </h3>
          <div style={styles.tournamentStandingsScroll}>
            <table style={styles.tournamentStandingsTable}>
              <thead>
                <tr style={styles.tournamentStandingsHeadRow}>
                  <th style={styles.tournamentStandingsHeadCell}>Rank</th>
                  <th style={{ ...styles.tournamentStandingsHeadCell, textAlign: "left" }}>
                    {tournament.mode === "doubles" ? "Team" : "Player"}
                  </th>
                  <th style={styles.tournamentStandingsHeadCell}>Qualification Status</th>
                  {overrideEnabled && <th style={styles.tournamentStandingsHeadCell}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {pool.rows.map((row) => (
                  <Fragment key={row.participantId}>
                    <tr style={styles.tournamentStandingsRow(row.qualified ? row.rank : 99)}>
                      <td style={styles.tournamentStandingsCell}>{row.rank}</td>
                      <td style={styles.tournamentStandingsNameCell}>{row.label}</td>
                      <td style={styles.tournamentStandingsCell}>
                        <span style={styles.qualificationTag(row.qualificationStatus)}>
                          {STATUS_ICONS[row.qualificationStatus]} {STATUS_LABELS[row.qualificationStatus]}
                        </span>
                      </td>
                      {overrideEnabled && (
                        <td style={styles.tournamentStandingsCell}>
                          <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
                            {!row.qualified && (
                              <button
                                type="button"
                                style={styles.subBtn}
                                onClick={() => setPendingAction({ action: "promote", participantId: row.participantId, label: row.label })}
                              >
                                Promote
                              </button>
                            )}
                            {row.qualified && (
                              <>
                                <button
                                  type="button"
                                  style={styles.subBtn}
                                  onClick={() => setPendingAction({ action: "eliminate", participantId: row.participantId, label: row.label })}
                                >
                                  Eliminate
                                </button>
                                <button
                                  type="button"
                                  style={styles.subBtn}
                                  onClick={() => setPendingAction({ action: "replace", participantId: row.participantId, label: row.label })}
                                >
                                  Replace
                                </button>
                              </>
                            )}
                            {row.qualificationStatus === "manualOverride" && (
                              <button
                                type="button"
                                style={styles.subBtn}
                                onClick={() => setPendingAction({ action: "reset", participantId: row.participantId, label: row.label })}
                              >
                                Reset
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                    {pendingAction?.participantId === row.participantId && (
                      <tr>
                        <td colSpan={overrideEnabled ? 4 : 3}>
                          <OverrideForm
                            pendingAction={pendingAction}
                            eliminatedCandidates={eliminatedCandidates}
                            director={director}
                            setDirector={setDirector}
                            onConfirm={handleConfirm}
                            onCancel={() => setPendingAction(null)}
                            error={qualificationError}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {result.ready && (
        <>
          <h3 style={styles.poolHeading}>Qualification Summary</h3>
          <div style={styles.sessionInfoCard}>
            <div style={styles.sessionInfoItem}>
              <span style={styles.sessionInfoLabel}>✓ Automatic</span>
              <span style={styles.sessionInfoValue}>{result.qualifiedTeams.filter((q) => q.qualificationType === "qualified").length}</span>
            </div>
            <div style={styles.sessionInfoItem}>
              <span style={styles.sessionInfoLabel}>⭐ Wild Card</span>
              <span style={styles.sessionInfoValue}>{result.qualifiedTeams.filter((q) => q.qualificationType === "wildCard").length}</span>
            </div>
            <div style={styles.sessionInfoItem}>
              <span style={styles.sessionInfoLabel}>⭐ Best Third Place</span>
              <span style={styles.sessionInfoValue}>{result.qualifiedTeams.filter((q) => q.qualificationType === "bestThirdPlace").length}</span>
            </div>
            {tournament.allowManualQualificationOverride && (
              <div style={styles.sessionInfoItem}>
                <span style={styles.sessionInfoLabel}>⭐ Manual Override</span>
                <span style={styles.sessionInfoValue}>{result.qualifiedTeams.filter((q) => q.qualificationType === "manualOverride").length}</span>
              </div>
            )}
            <div style={styles.sessionInfoItem}>
              <span style={styles.sessionInfoLabel}>❌ Eliminated</span>
              <span style={styles.sessionInfoValue}>{result.pools.flatMap((p) => p.rows).filter((r) => r.qualificationStatus === "eliminated").length}</span>
            </div>
          </div>
          <h3 style={styles.poolHeading}>Overall Qualifiers</h3>
          <ul style={styles.qualifiersList}>
            {result.qualifiedTeams.map((q) => (
              <li key={q.participantId} style={styles.qualifiersListItem}>
                <span>
                  {q.qualificationType !== "qualified" && `${STATUS_ICONS[q.qualificationType]} `}
                  {q.label}
                </span>
                <span style={styles.qualifiersListPool}>
                  {q.poolLabel} · Rank {q.rank}
                  {q.qualificationType !== "qualified" && ` · ${STATUS_LABELS[q.qualificationType]}`}
                </span>
              </li>
            ))}
          </ul>

          {overrideEnabled && (
            <div style={styles.editActions}>
              <button type="button" style={styles.secondaryBtn} onClick={onLock} disabled={!result.qualificationListValidation.valid}>
                Lock Qualification List
              </button>
            </div>
          )}

          {tournament.allowManualQualificationOverride && auditHistory.length > 0 && (
            <>
              <h3 style={styles.poolHeading}>Audit Trail</h3>
              <ul style={styles.qualifiersList}>
                {[...auditHistory].reverse().map((entry) => (
                  <li key={entry.id} style={{ ...styles.qualifiersListItem, flexDirection: "column", alignItems: "flex-start" }}>
                    <strong>
                      {new Date(entry.timestamp).toLocaleString()} — {entry.director}
                    </strong>
                    <span>
                      {{ promote: "Promoted", eliminate: "Eliminated", replace: "Replaced", reset: "Reset" }[entry.action]}: {entry.participantLabel}
                    </span>
                    <span style={styles.qualifiersListPool}>Reason: {entry.reason}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

import { useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Trophy } from "lucide-react";
import { styles } from "../styles.js";
import { courtDisplayName } from "../lib/utils.js";

function teamNames(ids, players) {
  return (ids || []).map((id) => players[id]?.name || "Player").join(" & ");
}

function sameTeamMembers(a, b) {
  if (!a || !b) return false;
  const setA = new Set([...(a.teamA || []), ...(a.teamB || [])]);
  const setB = new Set([...(b.teamA || []), ...(b.teamB || [])]);
  if (setA.size !== setB.size) return false;
  for (const id of setA) if (!setB.has(id)) return false;
  return true;
}

// Self-Service Score Reporting — full-screen "Report Score" view opened
// from a live court's Scorer card (see CourtCard.jsx/ScorerView.jsx). Lets
// the winning team enter both final scores directly, courtside, instead of
// the organizer tapping +/- through the whole game AND then separately
// pressing "End match & requeue players" — a valid submission now performs
// BOTH in one step. Persists through the exact same authoritative path
// (PickleballOpenPlay.jsx's reportScore -> lib/utils.js's
// applyReportedScore for validation, then straight into endMatch — the
// SAME function the manual "End match & requeue players" button calls) —
// no parallel/second completion system, no client-trusted "winner" flag
// (the write itself re-derives the winner from the two scores).
//
// `court` is always the LIVE, current court from state.courts — passed
// down fresh on every ScorerView render, never a frozen snapshot — so an
// organizer action elsewhere (End match, Cancel match, reassign teams)
// while this view is open is caught below via the original-team-members
// check, not just a stale prop.
export default function ReportScoreScreen({ court, players, onSubmit, onClose }) {
  const [ownTeam, setOwnTeam] = useState(null); // 'A' | 'B' | null
  const [ownScoreText, setOwnScoreText] = useState("");
  const [opponentScoreText, setOpponentScoreText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Captured once, from the first court this view ever saw — the
  // authoritative "is this still the same match" check below compares
  // against THIS, never a value that could itself have already moved.
  const originalCourtRef = useRef(court);
  const original = originalCourtRef.current;
  // No longer reportable — the match was ended, cancelled, reassigned, or
  // the court itself no longer exists, while this view was open. Fails
  // closed: any change to WHO is playing invalidates this view rather
  // than risk reporting a score onto a different match than the one shown.
  const reportable = Boolean(court) && (court.status === "live" || court.status === "finished") && sameTeamMembers(court, original);

  if (!reportable) {
    return (
      <div style={styles.dialogOverlay}>
        <div style={styles.reportScoreCard}>
          <div style={styles.reportScoreStaleBox}>
            <AlertTriangle size={28} strokeWidth={2} color="var(--coral)" />
            <h2 style={styles.dialogTitle}>This match is no longer reportable</h2>
            <p style={{ fontSize: 13.5, color: "var(--color-text-muted)", margin: "8px 0 0", lineHeight: 1.4, textAlign: "center" }}>
              The organizer ended, cancelled, or changed this match while this screen was open. No score was submitted.
            </p>
            <button type="button" style={{ ...styles.primaryBtn, marginTop: 18 }} onClick={onClose}>
              <ArrowLeft size={14} strokeWidth={2.5} />
              Back to Scorer
            </button>
          </div>
        </div>
      </div>
    );
  }

  const ownScore = Number(ownScoreText);
  const opponentScore = Number(opponentScoreText);
  const scoresLookValid =
    ownScoreText.trim() !== "" &&
    opponentScoreText.trim() !== "" &&
    Number.isInteger(ownScore) &&
    Number.isInteger(opponentScore) &&
    ownScore >= 0 &&
    opponentScore >= 0;
  const canSubmit = Boolean(ownTeam) && scoresLookValid && ownScore > opponentScore && !submitting;

  function handleSubmit() {
    if (!canSubmit || submitting) return; // duplicate-tap guard — disabled the instant a submit is already in flight
    setSubmitting(true);
    setError(null);
    try {
      // expectedTeamIds — the ORIGINAL team members this view opened
      // with, threaded through to the actual mutation (see
      // PickleballOpenPlay.jsx's reportScore) as a second, server-side
      // "is this still the same match" check — never trusting only this
      // screen's own `reportable` guard above, which is client-side and
      // could theoretically miss a race in the instant between its last
      // render and this click.
      const result = onSubmit(ownTeam, ownScore, opponentScore, [...(original.teamA || []), ...(original.teamB || [])]);
      if (result && result.ok === false) {
        setError(result.error || "Couldn't submit this score. Please try again.");
        setSubmitting(false);
        return;
      }
      // Submit Score now performs the FULL finalization (match history,
      // stats, rotation, court release, next-matchup dispatch) in one
      // authoritative step — see reportScore/endMatch. A truthy, non-{ok:
      // false} result means that already happened synchronously; closing
      // immediately is correct, not premature — there is no separate
      // "now wait for the organizer" step left to perform.
      onClose();
    } catch {
      setError("Couldn't submit this score. Please try again.");
      setSubmitting(false);
    }
  }

  const ownIds = ownTeam === "A" ? court.teamA : ownTeam === "B" ? court.teamB : null;
  const opponentIds = ownTeam === "A" ? court.teamB : ownTeam === "B" ? court.teamA : null;

  return (
    <div style={styles.dialogOverlay}>
      {/* No onClick on the overlay itself — accidental backdrop taps must
          never dismiss a score in progress; Back below is the only way out. */}
      <div style={styles.reportScoreCard}>
        <div style={styles.dialogHeadRow}>
          <h2 style={styles.dialogTitle}>Report Score — {courtDisplayName(court)}</h2>
          <button type="button" style={styles.iconBtn} onClick={onClose} disabled={submitting} aria-label="cancel reporting this score">
            <ArrowLeft size={16} strokeWidth={2.5} />
          </button>
        </div>

        <p style={styles.dialogLabel}>Which team is reporting?</p>
        <div style={styles.reportScoreTeamPicker}>
          <button
            type="button"
            style={{ ...styles.reportScoreTeamBtn, ...(ownTeam === "A" ? styles.reportScoreTeamBtnActive : {}) }}
            onClick={() => setOwnTeam("A")}
            disabled={submitting}
          >
            {teamNames(court.teamA, players)}
          </button>
          <button
            type="button"
            style={{ ...styles.reportScoreTeamBtn, ...(ownTeam === "B" ? styles.reportScoreTeamBtnActive : {}) }}
            onClick={() => setOwnTeam("B")}
            disabled={submitting}
          >
            {teamNames(court.teamB, players)}
          </button>
        </div>

        {ownTeam && (
          <>
            <div style={styles.reportScoreInputRow}>
              <div style={styles.dialogField}>
                <span style={styles.dialogLabel}>Your score ({teamNames(ownIds, players)})</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  style={styles.reportScoreInput}
                  value={ownScoreText}
                  onChange={(e) => setOwnScoreText(e.target.value)}
                  disabled={submitting}
                  autoFocus
                />
              </div>
              <div style={styles.dialogField}>
                <span style={styles.dialogLabel}>Opponent's score ({teamNames(opponentIds, players)})</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  style={styles.reportScoreInput}
                  value={opponentScoreText}
                  onChange={(e) => setOpponentScoreText(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>

            {scoresLookValid && ownScore <= opponentScore && (
              <p style={styles.editWarning}>Your score must be higher than your opponent's — the result can't be a tie or a loss.</p>
            )}
          </>
        )}

        {error && <p style={styles.editWarning}>{error}</p>}

        <div style={styles.dialogActions}>
          <button type="button" style={styles.secondaryBtn} onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" style={{ ...styles.primaryBtn, ...(!canSubmit ? styles.btnDisabled : {}) }} onClick={handleSubmit} disabled={!canSubmit}>
            <Trophy size={14} strokeWidth={2.5} />
            {submitting ? "Finalizing…" : "Submit Score"}
          </button>
        </div>
      </div>
    </div>
  );
}

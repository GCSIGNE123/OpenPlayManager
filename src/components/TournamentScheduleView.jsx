import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Pencil, Play, RefreshCw, Users, X } from "lucide-react";
import { styles } from "../styles.js";
import SectionLabel from "./SectionLabel.jsx";

// Real now (Tournament Match Management) — the status a match/round is
// actually in, driven by lib/tournamentModel.js's startMatch/
// RoundRobinEngine.updateMatchResult.
const STATUS_LABELS = { pending: "Pending", inProgress: "In Progress", completed: "Completed" };

// Start Match / Enter Scores / Save Result / Edit Result all live in this
// one card: "Start Match" (pending) and "Edit Result" (completed) both open
// the same score-entry form rather than being separate multi-step flows —
// fewer clicks, same four organizer actions the task asks for.
function MatchCard({ match, tournamentCompleted, onStartMatch, onSaveResult }) {
  const [editing, setEditing] = useState(false);
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [winnerId, setWinnerId] = useState(null);
  const [localError, setLocalError] = useState("");

  const openForm = () => {
    setScoreA(match.score?.teamA ?? "");
    setScoreB(match.score?.teamB ?? "");
    setWinnerId(match.winner ?? null);
    setLocalError("");
    setEditing(true);
  };

  const handleStart = () => {
    onStartMatch(match.id);
    openForm();
  };

  const handleSave = async () => {
    setLocalError("");
    if (scoreA === "" || scoreB === "") {
      setLocalError("Enter a score for both teams.");
      return;
    }
    if (Number(scoreA) < 0 || Number(scoreB) < 0) {
      setLocalError("Scores can't be negative.");
      return;
    }
    if (!winnerId) {
      setLocalError("Select a winner before saving.");
      return;
    }
    await onSaveResult(match.id, { scoreA: Number(scoreA), scoreB: Number(scoreB), winnerId });
    setEditing(false);
  };

  if (match.isBye) {
    return (
      <div style={styles.historyMatchCard}>
        <div style={styles.historyMatchHead}>
          <span style={styles.courtBadge}>BYE</span>
        </div>
        <p style={styles.byeTag}>{match.teamA.label} has a bye this round.</p>
      </div>
    );
  }

  const isCompleted = match.status === "completed";
  const canEdit = isCompleted && !tournamentCompleted;

  return (
    <div style={{ ...styles.historyMatchCard, ...(isCompleted ? styles.matchCompletedCard : {}) }}>
      <div style={styles.historyMatchHead}>
        <span style={styles.courtBadge}>COURT {match.court}</span>
        <span style={styles.matchStatusBadge(match.status)}>{STATUS_LABELS[match.status]}</span>
      </div>

      {!editing && (
        <>
          <div style={styles.historyMatchTeams}>
            <div style={styles.historyTeamLine}>
              <span>{match.teamA.label}</span>
              {isCompleted && (
                <span style={{ ...styles.historyScore, ...(match.winner === match.teamA.id ? styles.historyScoreWin : {}) }}>
                  {match.score.teamA}
                </span>
              )}
            </div>
            <div style={styles.vsLine} />
            <div style={styles.historyTeamLine}>
              <span>{match.teamB.label}</span>
              {isCompleted && (
                <span style={{ ...styles.historyScore, ...(match.winner === match.teamB.id ? styles.historyScoreWin : {}) }}>
                  {match.score.teamB}
                </span>
              )}
            </div>
          </div>
          {isCompleted ? (
            <div style={styles.editActions}>
              {canEdit && (
                <button type="button" style={styles.secondaryBtn} onClick={openForm}>
                  <Pencil size={13} strokeWidth={2.5} />
                  Edit result
                </button>
              )}
            </div>
          ) : (
            <div style={styles.editActions}>
              <button type="button" style={styles.primaryBtn} onClick={match.status === "pending" ? handleStart : openForm}>
                <Play size={14} strokeWidth={2.5} />
                {match.status === "pending" ? "Start match" : "Enter scores"}
              </button>
            </div>
          )}
        </>
      )}

      {editing && (
        <div>
          <div style={styles.scoreInputRow}>
            <label style={styles.scoreInputField}>
              {match.teamA.label}
              <input
                type="number"
                min={0}
                style={styles.expectedGamesInput}
                value={scoreA}
                onChange={(e) => setScoreA(e.target.value)}
              />
            </label>
            <label style={styles.scoreInputField}>
              {match.teamB.label}
              <input
                type="number"
                min={0}
                style={styles.expectedGamesInput}
                value={scoreB}
                onChange={(e) => setScoreB(e.target.value)}
              />
            </label>
          </div>
          <p style={styles.dialogLabel}>Winner</p>
          <div style={styles.winnerSelectRow}>
            <button
              type="button"
              style={styles.winnerSelectBtn(winnerId === match.teamA.id)}
              onClick={() => setWinnerId(match.teamA.id)}
            >
              {match.teamA.label}
            </button>
            <button
              type="button"
              style={styles.winnerSelectBtn(winnerId === match.teamB.id)}
              onClick={() => setWinnerId(match.teamB.id)}
            >
              {match.teamB.label}
            </button>
          </div>
          {localError && <p style={styles.editWarning}>{localError}</p>}
          <div style={styles.editActions}>
            <button type="button" style={styles.secondaryBtn} onClick={() => setEditing(false)}>
              <X size={13} strokeWidth={2.5} />
              Cancel
            </button>
            <button type="button" style={styles.primaryBtn} onClick={handleSave}>
              <Check size={14} strokeWidth={2.5} />
              Save result
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RoundCard({ round, expanded, onToggle, tournamentCompleted, onStartMatch, onSaveResult }) {
  return (
    <div style={styles.historyRoundCard}>
      <button style={styles.historyRoundHead} onClick={onToggle}>
        {expanded ? <ChevronDown size={14} strokeWidth={2.5} /> : <ChevronRight size={14} strokeWidth={2.5} />}
        <span>Round {round.roundNumber}</span>
        <span style={styles.matchStatusBadge(round.status)}>{STATUS_LABELS[round.status]}</span>
        <span style={styles.historyRoundCount}>
          {round.matches.length} match{round.matches.length === 1 ? "" : "es"}
        </span>
      </button>
      {expanded && (
        <div style={styles.historyRoundBody}>
          {round.matches.map((m) => (
            <MatchCard
              key={m.id}
              match={m}
              tournamentCompleted={tournamentCompleted}
              onStartMatch={onStartMatch}
              onSaveResult={onSaveResult}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Tournament schedule generation + match management for Tournament-type
// sessions — see PROJECT.md's Round Robin Scheduler / Tournament Match
// Management sections. The tournament itself is fetched and owned by the
// parent (TournamentDashboardView), so Overview's progress stats and this
// view's match cards always agree — this component only renders it and
// forwards actions up.
export default function TournamentScheduleView({
  state,
  tournament,
  loading,
  onGenerate,
  generating,
  generateError,
  matchError,
  onStartMatch,
  onSaveResult,
}) {
  const [mode, setMode] = useState(() => tournament?.mode ?? "singles");
  const [expandedRounds, setExpandedRounds] = useState(() => new Set([1]));

  const toggleRound = (roundNumber) => {
    setExpandedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(roundNumber)) next.delete(roundNumber);
      else next.add(roundNumber);
      return next;
    });
  };

  const playerCount = Object.keys(state.players || {}).length;
  const canGenerate = playerCount >= 2 && !generating;
  const tournamentCompleted = tournament?.status === "completed";

  return (
    <div>
      <SectionLabel>Tournament Schedule</SectionLabel>

      <div style={styles.tournamentSetupCard}>
        <p style={styles.editHint}>
          {tournament
            ? `Regenerating rebuilds the schedule from this session's ${playerCount} currently registered player${playerCount === 1 ? "" : "s"} — any results already saved will be lost.`
            : `Generates a Round Robin schedule from this session's ${playerCount} registered player${playerCount === 1 ? "" : "s"} across ${state.courts.length} court${state.courts.length === 1 ? "" : "s"}.`}
        </p>
        <div style={styles.skillToggle}>
          <button type="button" style={styles.skillToggleBtn(mode === "singles")} onClick={() => setMode("singles")}>
            Singles
          </button>
          <button type="button" style={styles.skillToggleBtn(mode === "doubles")} onClick={() => setMode("doubles")}>
            Doubles
          </button>
        </div>
        {generateError && <p style={styles.editWarning}>{generateError}</p>}
        {playerCount < 2 && <p style={styles.editWarning}>Register at least 2 players before generating a schedule.</p>}
        <button
          style={{ ...styles.primaryBtn, ...(!canGenerate ? styles.btnDisabled : {}) }}
          disabled={!canGenerate}
          onClick={() => onGenerate(mode)}
        >
          {tournament ? <RefreshCw size={16} strokeWidth={2.5} /> : <Users size={16} strokeWidth={2.5} />}
          {generating ? (tournament ? "Regenerating…" : "Generating…") : tournament ? "Regenerate schedule" : "Generate schedule"}
        </button>
      </div>

      {loading && <p style={styles.editHint}>Loading schedule…</p>}

      {matchError && <p style={styles.editWarning}>{matchError}</p>}

      {tournament && !loading && (
        <div>
          <p style={styles.editHint}>
            {tournament.mode === "doubles" ? "Doubles" : "Singles"} Round Robin — {tournament.entrants.length}{" "}
            {tournament.mode === "doubles" ? "teams" : "players"}, {tournament.rounds.length} round
            {tournament.rounds.length === 1 ? "" : "s"}.
            {tournamentCompleted && " This tournament is complete — results can no longer be edited."}
          </p>
          {tournament.rounds.map((r) => (
            <RoundCard
              key={r.roundNumber}
              round={r}
              expanded={expandedRounds.has(r.roundNumber)}
              onToggle={() => toggleRound(r.roundNumber)}
              tournamentCompleted={tournamentCompleted}
              onStartMatch={onStartMatch}
              onSaveResult={onSaveResult}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight, Pencil, Play, RefreshCw, Users, X } from "lucide-react";
import { styles } from "../styles.js";
import SectionLabel from "./SectionLabel.jsx";

// Real now (Tournament Match Management) — the status a match/round is
// actually in, driven by lib/tournamentModel.js's startMatch/
// RoundRobinEngine.updateMatchResult.
const STATUS_LABELS = { pending: "Pending", inProgress: "In Progress", completed: "Completed" };

const POOL_COUNT_OPTIONS = [1, 2, 3, 4];

// Start Match / Enter Scores / Save Result / Edit Result all live in this
// one card: "Start Match" (pending) and "Edit Result" (completed) both open
// the same score-entry form rather than being separate multi-step flows —
// fewer clicks, same four organizer actions the task asks for. As of Round
// Robin Pool Support, editing locks per POOL (poolCompleted) rather than per
// whole tournament — a match in a still-running pool stays editable even
// once a sibling pool has finished.
function MatchCard({ match, poolCompleted, onStartMatch, onSaveResult }) {
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
  const canEdit = isCompleted && !poolCompleted;

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

function RoundCard({ round, expanded, onToggle, poolCompleted, onStartMatch, onSaveResult }) {
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
            <MatchCard key={m.id} match={m} poolCompleted={poolCompleted} onStartMatch={onStartMatch} onSaveResult={onSaveResult} />
          ))}
        </div>
      )}
    </div>
  );
}

// One pool's full round list — a pool is a fully independent Round Robin
// sub-tournament, so it gets its own "N players/teams, N rounds, [complete]"
// summary line exactly like the old single-pool view used to render for the
// whole tournament. Only shown with a "Pool X" heading when there's more
// than one pool (poolCount === 1 renders identically to before Pool
// Support — no extra chrome for the common case).
function PoolSchedule({ pool, showHeading, expandedRounds, onToggleRound, onStartMatch, onSaveResult }) {
  const poolCompleted = pool.status === "completed";
  return (
    <div style={styles.poolScheduleBlock}>
      {showHeading && <h3 style={styles.poolHeading}>{pool.label}</h3>}
      <p style={styles.editHint}>
        {pool.entrants.length} {pool.entrants.length === 1 ? "entrant" : "entrants"}, {pool.rounds.length} round
        {pool.rounds.length === 1 ? "" : "s"}.
        {poolCompleted && " This pool is complete — results can no longer be edited."}
      </p>
      {pool.rounds.map((r) => (
        <RoundCard
          key={r.roundNumber}
          round={r}
          expanded={expandedRounds.has(`${pool.id}:${r.roundNumber}`)}
          onToggle={() => onToggleRound(`${pool.id}:${r.roundNumber}`)}
          poolCompleted={poolCompleted}
          onStartMatch={onStartMatch}
          onSaveResult={onSaveResult}
        />
      ))}
    </div>
  );
}

// Tournament schedule generation + match management for Tournament-type
// sessions — see PROJECT.md's Round Robin Scheduler / Tournament Match
// Management / Round Robin Pool Support sections. The tournament itself is
// fetched and owned by the parent (TournamentDashboardView), so Overview's
// progress stats and this view's match cards always agree — this component
// only renders it and forwards actions up. `selectedPool` ('all' | poolId,
// also owned by the parent so Standings stays in sync) filters which pools'
// schedules render here.
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
  selectedPool,
}) {
  const [mode, setMode] = useState(() => tournament?.mode ?? "singles");
  const [poolCount, setPoolCount] = useState(() => tournament?.poolCount ?? 1);
  const [customPoolCount, setCustomPoolCount] = useState("");
  const [expandedRounds, setExpandedRounds] = useState(() => new Set());

  // Round 1 of every pool starts expanded, same as the single-pool view
  // used to default to Round 1 open — re-derived whenever a *different*
  // tournament loads (pool ids are fresh uids each generation, so this
  // can't be computed once at mount).
  useEffect(() => {
    if (!tournament) return;
    setExpandedRounds(new Set(tournament.pools.map((p) => `${p.id}:1`)));
  }, [tournament?.id]);

  const toggleRound = (key) => {
    setExpandedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isCustomPoolCount = !POOL_COUNT_OPTIONS.includes(poolCount);
  const effectivePoolCount = isCustomPoolCount ? Number(customPoolCount) || 0 : poolCount;

  const playerCount = Object.keys(state.players || {}).length;
  const tournamentCompleted = tournament?.status === "completed";
  const canGenerate =
    playerCount >= 2 && effectivePoolCount >= 1 && playerCount >= effectivePoolCount * 2 && !generating && !tournamentCompleted;

  const pools = tournament?.pools ?? [];
  const visiblePools = selectedPool === "all" ? pools : pools.filter((p) => p.id === selectedPool);

  return (
    <div>
      <SectionLabel>Tournament Schedule</SectionLabel>

      <div style={styles.tournamentSetupCard}>
        <p style={styles.editHint}>
          {tournamentCompleted
            ? "This tournament is complete — the schedule can no longer be regenerated."
            : tournament
              ? `Regenerating rebuilds every pool's schedule from this session's ${playerCount} currently registered player${playerCount === 1 ? "" : "s"} — any results already saved will be lost.`
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
        {!tournamentCompleted && (
          <>
            <p style={styles.dialogLabel}>Number of pools</p>
            <div style={styles.skillToggle}>
              {POOL_COUNT_OPTIONS.map((n) => (
                <button key={n} type="button" style={styles.skillToggleBtn(poolCount === n)} onClick={() => setPoolCount(n)}>
                  {n}
                </button>
              ))}
              <button type="button" style={styles.skillToggleBtn(isCustomPoolCount)} onClick={() => setPoolCount(-1)}>
                Custom
              </button>
            </div>
            {isCustomPoolCount && (
              <input
                type="number"
                min={1}
                placeholder="Number of pools"
                style={{ ...styles.expectedGamesInput, width: "100%", marginBottom: 12 }}
                value={customPoolCount}
                onChange={(e) => setCustomPoolCount(e.target.value)}
              />
            )}
          </>
        )}
        {generateError && <p style={styles.editWarning}>{generateError}</p>}
        {playerCount < 2 && <p style={styles.editWarning}>Register at least 2 players before generating a schedule.</p>}
        {playerCount >= 2 && effectivePoolCount >= 1 && playerCount < effectivePoolCount * 2 && (
          <p style={styles.editWarning}>Need at least 2 players per pool — register more players or choose fewer pools.</p>
        )}
        {!tournamentCompleted && (
          <button
            style={{ ...styles.primaryBtn, ...(!canGenerate ? styles.btnDisabled : {}) }}
            disabled={!canGenerate}
            onClick={() => onGenerate(mode, effectivePoolCount)}
          >
            {tournament ? <RefreshCw size={16} strokeWidth={2.5} /> : <Users size={16} strokeWidth={2.5} />}
            {generating ? (tournament ? "Regenerating…" : "Generating…") : tournament ? "Regenerate schedule" : "Generate schedule"}
          </button>
        )}
      </div>

      {loading && <p style={styles.editHint}>Loading schedule…</p>}

      {matchError && <p style={styles.editWarning}>{matchError}</p>}

      {tournament && !loading && (
        <div>
          {visiblePools.map((pool) => (
            <PoolSchedule
              key={pool.id}
              pool={pool}
              showHeading={pools.length > 1}
              expandedRounds={expandedRounds}
              onToggleRound={toggleRound}
              onStartMatch={onStartMatch}
              onSaveResult={onSaveResult}
            />
          ))}
        </div>
      )}
    </div>
  );
}

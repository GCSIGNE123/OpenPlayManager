import { useRef, useState } from "react";
import { Check, Play, Pencil, X, LockOpen, Pause, PlayCircle, Flag, ChevronDown, ChevronRight, Crosshair, ArrowLeftRight } from "lucide-react";
import { styles } from "../styles.js";
import { getTournamentEngine } from "../lib/tournament.js";
import { PlayoffBracketGenerator } from "../engines/PlayoffBracketGenerator.js";
import { PlayoffEngine } from "../engines/PlayoffEngine.js";
import { DoubleEliminationEngine } from "../engines/DoubleEliminationEngine.js";
import { buildBracketViewModel } from "../engines/BracketViewModel.js";
import { CourtAssignmentService } from "../engines/CourtAssignmentService.js";
import { ChampionshipSeriesService } from "../engines/ChampionshipSeriesService.js";
import { SEEDING_METHODS } from "../engines/TournamentSettings.js";
import SectionLabel from "./SectionLabel.jsx";

const previewGenerator = new PlayoffBracketGenerator();
const playoffEngine = new PlayoffEngine();
const courtAssignmentService = new CourtAssignmentService();
const deEngine = new DoubleEliminationEngine();
const seriesService = new ChampionshipSeriesService();

const STATUS_LABELS = { locked: "Locked", ready: "Ready", inProgress: "In Progress", paused: "Paused", completed: "Completed" };
const SEEDING_METHOD_LABELS = Object.fromEntries(SEEDING_METHODS.map((m) => [m.value, m.label]));

// One playoff match card. Five states, per the Winner Advancement Engine +
// this task's Pause/Resume addition (PlayoffEngine.getMatchState — the
// mapping comes from the bracket structure itself, not re-inferred here):
//  - locked: teamA and/or teamB is still null ("TBD") — this round hasn't
//    been unlocked yet. No actions render.
//  - ready: both teams known, not yet started — Start Match.
//  - inProgress: Enter Scores / Save Result / Pause / Mark Walkover.
//  - paused: Resume.
//  - completed: winner highlighted, loser dimmed; Edit Result available
//    unless the whole bracket is locked (bracket.status === "completed").
function BracketMatchCard({
  match,
  bracketCompleted,
  selected,
  onAdvancementPath,
  availableCourts,
  onSelect,
  onStartMatch,
  onSaveResult,
  onPauseMatch,
  onResumeMatch,
  onWalkover,
  onAssignMatch,
  onReassignMatch,
}) {
  const [editing, setEditing] = useState(false);
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [winnerId, setWinnerId] = useState(null);
  const [localError, setLocalError] = useState("");
  const [courtChoice, setCourtChoice] = useState("");

  const matchState = match.state; // enriched by BracketViewModel
  const locked = matchState === "locked";
  const isCompleted = matchState === "completed";
  const canEdit = isCompleted && !bracketCompleted;

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

  return (
    <div
      style={{
        ...styles.historyMatchCard,
        ...(isCompleted ? styles.matchCompletedCard : {}),
        ...(selected ? { borderColor: "var(--court)", borderWidth: 2 } : {}),
        ...(onAdvancementPath && !selected ? { background: "rgba(22,53,94,0.05)" } : {}),
        cursor: "pointer",
      }}
      onClick={() => onSelect(match.id)}
    >
      <div style={styles.historyMatchHead}>
        <span style={styles.courtBadge}>{match.court ? `COURT ${match.court}` : "COURT TBD"}</span>
        <span style={styles.matchStatusBadge(matchState)}>{STATUS_LABELS[matchState]}</span>
      </div>

      {!editing && (
        <>
          <div style={styles.historyMatchTeams}>
            {[match.teamA, match.teamB].map((team, i) => {
              const isLoser = isCompleted && team && match.winner !== team.participantId;
              return (
                <div key={i} style={{ ...styles.historyTeamLine, ...(isLoser ? { opacity: 0.5 } : {}) }}>
                  {team ? (
                    <>
                      <span>
                        <span style={styles.bracketSeedTag}>#{team.seed}</span>
                        {team.label}
                      </span>
                      {isCompleted && (
                        <span style={{ ...styles.historyScore, ...(match.winner === team.participantId ? styles.historyScoreWin : {}) }}>
                          {match.walkover ? "WO" : i === 0 ? match.score.teamA : match.score.teamB}
                        </span>
                      )}
                    </>
                  ) : (
                    <span style={styles.bracketTbdLabel}>TBD — waiting on a previous round</span>
                  )}
                </div>
              );
            })}
          </div>
          {!locked && (
            <div style={styles.editActions} onClick={(e) => e.stopPropagation()}>
              {isCompleted ? (
                canEdit && (
                  <button type="button" style={styles.secondaryBtn} onClick={openForm}>
                    <Pencil size={13} strokeWidth={2.5} />
                    Edit result
                  </button>
                )
              ) : matchState === "paused" ? (
                <button type="button" style={styles.primaryBtn} onClick={() => onResumeMatch(match.id)}>
                  <PlayCircle size={14} strokeWidth={2.5} />
                  Resume
                </button>
              ) : (
                <>
                  <button type="button" style={styles.primaryBtn} onClick={match.status === "pending" ? handleStart : openForm}>
                    <Play size={14} strokeWidth={2.5} />
                    {match.status === "pending" ? "Start match" : "Enter scores"}
                  </button>
                  {matchState === "inProgress" && (
                    <button type="button" style={styles.secondaryBtn} onClick={() => onPauseMatch(match.id)}>
                      <Pause size={13} strokeWidth={2.5} />
                      Pause
                    </button>
                  )}
                  <button
                    type="button"
                    style={styles.secondaryBtn}
                    onClick={() => onWalkover(match.id, match.teamA.participantId)}
                    title={`Walkover — ${match.teamA.label} wins by forfeit`}
                  >
                    <Flag size={13} strokeWidth={2.5} />
                    WO
                  </button>
                </>
              )}
            </div>
          )}
          {!locked && !isCompleted && availableCourts.length > 0 && (
            <div style={styles.editActions} onClick={(e) => e.stopPropagation()}>
              <select style={styles.courtSelect} value={courtChoice} onChange={(e) => setCourtChoice(e.target.value)}>
                <option value="">{match.court ? "Move to…" : "Assign court…"}</option>
                {availableCourts.map((c) => (
                  <option key={c.id} value={c.number}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                style={styles.secondaryBtn}
                disabled={!courtChoice}
                onClick={() => {
                  if (match.court) onReassignMatch(match.id, match.court, Number(courtChoice));
                  else onAssignMatch(match.id, Number(courtChoice));
                  setCourtChoice("");
                }}
              >
                <ArrowLeftRight size={13} strokeWidth={2.5} />
                {match.court ? "Move" : "Assign"}
              </button>
            </div>
          )}
        </>
      )}

      {editing && match.teamA && match.teamB && (
        <div onClick={(e) => e.stopPropagation()}>
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
              style={styles.winnerSelectBtn(winnerId === match.teamA.participantId)}
              onClick={() => setWinnerId(match.teamA.participantId)}
            >
              {match.teamA.label}
            </button>
            <button
              type="button"
              style={styles.winnerSelectBtn(winnerId === match.teamB.participantId)}
              onClick={() => setWinnerId(match.teamB.participantId)}
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

      {selected && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--line)" }}>
          <p style={styles.editHint}>
            Match #{match.matchNumber}
            {match.startedAt ? ` · Started ${new Date(match.startedAt).toLocaleTimeString()}` : ""}
            {match.completedAt ? ` · Completed ${new Date(match.completedAt).toLocaleTimeString()}` : ""}
          </p>
          <p style={styles.editHint}>
            Scheduled time: not scheduled (placeholder) · Last updated:{" "}
            {match.lastUpdatedAt ? new Date(match.lastUpdatedAt).toLocaleString() : "—"}
          </p>
        </div>
      )}
    </div>
  );
}

// Live Tournament Dashboard for the playoff stage — Current Round/Matches
// Remaining/Completed/Active/Waiting/Next, per the Live Playoff Bracket &
// Match Operations spec (extends the Winner Advancement Engine's earlier
// Current Round/Remaining/Completed/Active panel). Pure derived data from
// BracketViewModel — recomputed fresh on every render.
function BracketProgressPanel({ bracket, viewModel }) {
  const allMatches = bracket.rounds.flatMap((r) => r.matches).concat(bracket.bronzeMatch ? [bracket.bronzeMatch] : []);
  const completed = allMatches.filter((m) => m.status === "completed").length;
  const active = playoffEngine.getActiveMatches(bracket).length;
  const remaining = allMatches.length - completed;
  const currentRound = playoffEngine.getCurrentRound(bracket);
  return (
    <div style={styles.sessionInfoCard}>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Current Round</span>
        <span style={styles.sessionInfoValue}>{currentRound.name}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Matches Remaining</span>
        <span style={styles.sessionInfoValue}>{remaining}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Completed Matches</span>
        <span style={styles.sessionInfoValue}>{completed}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Active Matches</span>
        <span style={styles.sessionInfoValue}>{active}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Waiting Matches</span>
        <span style={styles.sessionInfoValue}>{viewModel.waitingMatches.length}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Next Matches</span>
        <span style={styles.sessionInfoValue}>{viewModel.nextMatches.length}</span>
      </div>
    </div>
  );
}

// Best-of-3 Finals — see PROJECT.md. The Final round holds more than one
// match exactly when it's a series; this renders only then. Current score
// and "Next: Game N" are pure derivations over the round's own matches via
// ChampionshipSeriesService — nothing here is persisted.
function ChampionshipSeriesPanel({ finalRound }) {
  if (finalRound.matches.length < 2) return null;
  const score = seriesService.getSeriesScore(finalRound.matches);
  const reference = finalRound.matches[0];
  const complete = seriesService.isSeriesComplete(finalRound.matches);
  const nextGame = finalRound.matches.find((m) => m.status !== "completed");
  return (
    <div style={styles.sessionInfoCard}>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Championship Series</span>
        <span style={styles.sessionInfoValue}>Best of 3</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>{reference.teamA?.label}</span>
        <span style={styles.sessionInfoValue}>{score[reference.teamA?.participantId] ?? 0}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>{reference.teamB?.label}</span>
        <span style={styles.sessionInfoValue}>{score[reference.teamB?.participantId] ?? 0}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Series Status</span>
        <span style={styles.sessionInfoValue}>{complete ? "Decided" : nextGame ? `Next: Game ${nextGame.matchNumber}` : "—"}</span>
      </div>
    </div>
  );
}

function BracketRoundColumn({ round, bracketCompleted, collapsed, onToggleCollapse, selectedMatchId, availableCourts, roundRef, handlers }) {
  return (
    <div style={styles.bracketRoundColumn} ref={roundRef}>
      <button
        type="button"
        onClick={onToggleCollapse}
        style={{ ...styles.poolHeading, display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        {collapsed ? <ChevronRight size={14} strokeWidth={2.5} /> : <ChevronDown size={14} strokeWidth={2.5} />}
        {round.name} {round.isCurrentRound && <span style={{ color: "var(--court)" }}>· current</span>}
      </button>
      {!collapsed &&
        round.matches.map((m) => (
          <BracketMatchCard
            key={m.id}
            match={m}
            bracketCompleted={bracketCompleted}
            selected={m.id === selectedMatchId}
            onAdvancementPath={m.onAdvancementPath}
            availableCourts={availableCourts}
            {...handlers}
          />
        ))}
    </div>
  );
}

// Double Elimination — see PROJECT.md/FEATURES.md/DoubleEliminationEngine.js.
// Fully real, playable rendering for all three parts (Winners Bracket,
// Losers Bracket, Grand Final/Reset) — the "foundation-only preview"
// (Losers Bracket/Grand Final forced to a permanently "locked", no-action
// state) is gone now that real seating/advancement/Grand-Final-Reset logic
// exists (see DoubleEliminationEngine.updateWinnersBracket/
// updateLosersBracket/updateGrandFinal). BracketMatchCard/BracketRoundColumn
// render completely unchanged — only real handlers/court lists are passed
// in now, the same way the single-elimination bracket already works.
function DoubleEliminationBracketSection({
  tournament,
  seedError,
  matchError,
  onGenerateDoubleEliminationBracket,
  onDoubleEliminationStartMatch,
  onDoubleEliminationSaveResult,
  onDoubleEliminationPauseMatch,
  onDoubleEliminationResumeMatch,
  onDoubleEliminationWalkover,
  onDoubleEliminationLosersStartMatch,
  onDoubleEliminationLosersSaveResult,
  onDoubleEliminationLosersPauseMatch,
  onDoubleEliminationLosersResumeMatch,
  onDoubleEliminationLosersWalkover,
  onGrandFinalStartMatch,
  onGrandFinalSaveResult,
  onGrandFinalWalkover,
  onAssignMatch,
  onReassignMatch,
}) {
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const deBracket = tournament.doubleEliminationBracket;

  if (!deBracket) {
    return (
      <div>
        <SectionLabel>Bracket</SectionLabel>
        <div style={styles.placeholderCard}>
          Double Elimination bracket format is selected — generate the Winners Bracket, Losers Bracket, and Grand
          Final once pool qualification is ready. Every team starts in the Winners Bracket; a first loss drops them
          to the Losers Bracket, a second loss eliminates them.
        </div>
        {seedError && <p style={styles.editWarning}>{seedError}</p>}
        <div style={styles.editActions}>
          <button type="button" style={styles.primaryBtn} onClick={onGenerateDoubleEliminationBracket}>
            Generate Double Elimination Bracket
          </button>
        </div>
      </div>
    );
  }

  const eliminated = deEngine.getEliminatedParticipants(deBracket);
  const availableCourts = courtAssignmentService.getAvailableCourts(tournament);

  const winnersViewModel = buildBracketViewModel(deBracket.winnersBracket, selectedMatchId);
  const winnersBracketCompleted = deBracket.winnersBracket.status === "completed";
  const winnersHandlers = {
    onSelect: (id) => setSelectedMatchId(id === selectedMatchId ? null : id),
    onStartMatch: onDoubleEliminationStartMatch,
    onSaveResult: onDoubleEliminationSaveResult,
    onPauseMatch: onDoubleEliminationPauseMatch,
    onResumeMatch: onDoubleEliminationResumeMatch,
    onWalkover: onDoubleEliminationWalkover,
    onAssignMatch,
    onReassignMatch,
  };

  const losersViewModel = buildBracketViewModel(deBracket.losersBracket, selectedMatchId);
  const losersBracketCompleted = deBracket.losersBracket.status === "completed";
  const losersHandlers = {
    onSelect: (id) => setSelectedMatchId(id === selectedMatchId ? null : id),
    onStartMatch: onDoubleEliminationLosersStartMatch,
    onSaveResult: onDoubleEliminationLosersSaveResult,
    onPauseMatch: onDoubleEliminationLosersPauseMatch,
    onResumeMatch: onDoubleEliminationLosersResumeMatch,
    onWalkover: onDoubleEliminationLosersWalkover,
    onAssignMatch,
    onReassignMatch,
  };

  const grandFinalCompleted = deBracket.grandFinal.status === "completed";
  const game1 = { ...deBracket.grandFinal.game1, state: playoffEngine.getMatchState(deBracket.grandFinal.game1), onAdvancementPath: false };
  const game2 = deBracket.grandFinal.game2
    ? { ...deBracket.grandFinal.game2, state: playoffEngine.getMatchState(deBracket.grandFinal.game2), onAdvancementPath: false }
    : null;
  const grandFinalHandlers = {
    onSelect: (id) => setSelectedMatchId(id === selectedMatchId ? null : id),
    onStartMatch: onGrandFinalStartMatch,
    onSaveResult: onGrandFinalSaveResult,
    onPauseMatch: () => {},
    onResumeMatch: () => {},
    onWalkover: onGrandFinalWalkover,
    onAssignMatch,
    onReassignMatch,
  };

  return (
    <div>
      <SectionLabel>Bracket</SectionLabel>
      <p style={styles.editHint}>
        Double Elimination — {deBracket.winnersBracket.size}-team bracket. Every team starts in the Winners Bracket;
        a first loss drops to the Losers Bracket, a second loss eliminates the team — an eliminated team never
        receives another match. The Losers Bracket champion (1 loss) meets the Winners Bracket champion (0 losses)
        in the Grand Final; if the Losers Bracket champion wins Game 1, a Grand Final Reset (Game 2, winner-takes-all)
        decides the tournament.
      </p>
      {matchError && <p style={styles.editWarning}>{matchError}</p>}

      <p style={{ ...styles.poolHeading, marginTop: 20 }}>Winners Bracket</p>
      <div style={styles.bracketScroll}>
        {winnersViewModel.rounds.map((round) => (
          <div key={`winners-${round.roundNumber}`} style={styles.bracketRoundColumn}>
            <p style={{ ...styles.poolHeading, margin: 0 }}>
              {round.name} {round.isCurrentRound && <span style={{ color: "var(--court)" }}>· current</span>}
            </p>
            {round.matches.map((m) => (
              <BracketMatchCard
                key={m.id}
                match={m}
                bracketCompleted={winnersBracketCompleted}
                selected={m.id === selectedMatchId}
                onAdvancementPath={m.onAdvancementPath}
                availableCourts={availableCourts}
                {...winnersHandlers}
              />
            ))}
          </div>
        ))}
      </div>
      {deBracket.winnersBracket.champion && (
        <div style={styles.sessionInfoCard}>
          <div style={styles.sessionInfoItem}>
            <span style={styles.sessionInfoLabel}>🏆 Winners Bracket Champion (0 losses)</span>
            <span style={styles.sessionInfoValue}>{deBracket.winnersBracket.champion.label}</span>
          </div>
        </div>
      )}

      <p style={{ ...styles.poolHeading, marginTop: 20 }}>Losers Bracket</p>
      <div style={styles.bracketScroll}>
        {losersViewModel.rounds.map((round) => (
          <div key={`losers-${round.roundNumber}`} style={styles.bracketRoundColumn}>
            <p style={{ ...styles.poolHeading, margin: 0 }}>
              {round.name} {round.isCurrentRound && <span style={{ color: "var(--court)" }}>· current</span>}
            </p>
            {round.matches.map((m) => (
              <BracketMatchCard
                key={m.id}
                match={m}
                bracketCompleted={losersBracketCompleted}
                selected={m.id === selectedMatchId}
                onAdvancementPath={m.onAdvancementPath}
                availableCourts={availableCourts}
                {...losersHandlers}
              />
            ))}
          </div>
        ))}
      </div>
      {deBracket.losersBracket.champion && (
        <div style={styles.sessionInfoCard}>
          <div style={styles.sessionInfoItem}>
            <span style={styles.sessionInfoLabel}>🥈 Losers Bracket Champion (1 loss)</span>
            <span style={styles.sessionInfoValue}>{deBracket.losersBracket.champion.label}</span>
          </div>
        </div>
      )}

      <p style={{ ...styles.poolHeading, marginTop: 20 }}>Grand Final</p>
      <div style={styles.bracketScroll}>
        <div style={styles.bracketRoundColumn}>
          <p style={{ ...styles.poolHeading, margin: 0 }}>Game 1</p>
          <BracketMatchCard
            match={game1}
            bracketCompleted={grandFinalCompleted}
            selected={game1.id === selectedMatchId}
            onAdvancementPath={false}
            availableCourts={availableCourts}
            {...grandFinalHandlers}
          />
        </div>
        {game2 && (
          <div style={styles.bracketRoundColumn}>
            <p style={{ ...styles.poolHeading, margin: 0 }}>Grand Final Reset (Game 2)</p>
            <BracketMatchCard
              match={game2}
              bracketCompleted={grandFinalCompleted}
              selected={game2.id === selectedMatchId}
              onAdvancementPath={false}
              availableCourts={availableCourts}
              {...grandFinalHandlers}
            />
          </div>
        )}
      </div>
      {deBracket.grandFinal.champion && (
        <div style={styles.sessionInfoCard}>
          <div style={styles.sessionInfoItem}>
            <span style={styles.sessionInfoLabel}>🥇 Tournament Champion</span>
            <span style={styles.sessionInfoValue}>{deBracket.grandFinal.champion.label}</span>
          </div>
          <div style={styles.sessionInfoItem}>
            <span style={styles.sessionInfoLabel}>🥈 Runner-up</span>
            <span style={styles.sessionInfoValue}>{deBracket.grandFinal.runnerUp?.label ?? "—"}</span>
          </div>
        </div>
      )}

      {eliminated.size > 0 && (
        <div style={{ marginTop: 16 }}>
          <p style={styles.poolHeading}>Eliminated ({eliminated.size})</p>
          <p style={styles.editHint}>
            {[...deBracket.winnersBracket.rounds, ...deBracket.losersBracket.rounds]
              .flatMap((r) => r.matches)
              .flatMap((m) => [m.teamA, m.teamB])
              .filter(Boolean)
              .filter((team, i, arr) => eliminated.has(team.participantId) && arr.findIndex((t) => t.participantId === team.participantId) === i)
              .map((team) => team.label)
              .join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}

// Consolation & Placement Brackets — see PROJECT.md. Renders
// tournament.consolationBracket as its own labeled section below the
// championship bracket, reusing BracketRoundColumn/BracketMatchCard
// unchanged — it's the exact same Bracket shape, just fed by first-round
// losers instead of pool qualifiers (see PlacementBracketService.js).
function ConsolationBracketSection({ consolationBracket, selectedMatchId, collapsedRounds, toggleCollapse, availableCourts, handlers, roundRefs }) {
  const bracketCompleted = consolationBracket.status === "completed";
  const viewModel = buildBracketViewModel(consolationBracket, selectedMatchId);
  return (
    <div style={{ marginTop: 24 }}>
      <SectionLabel>Consolation Bracket (5th–8th Place)</SectionLabel>
      {bracketCompleted && (
        <div style={styles.sessionInfoCard}>
          <div style={styles.sessionInfoItem}>
            <span style={styles.sessionInfoLabel}>Fifth Place</span>
            <span style={styles.sessionInfoValue}>{consolationBracket.champion?.label ?? "—"}</span>
          </div>
          <div style={styles.sessionInfoItem}>
            <span style={styles.sessionInfoLabel}>Sixth Place</span>
            <span style={styles.sessionInfoValue}>{consolationBracket.runnerUp?.label ?? "—"}</span>
          </div>
          {consolationBracket.bronzeMatch && (
            <>
              <div style={styles.sessionInfoItem}>
                <span style={styles.sessionInfoLabel}>Seventh Place</span>
                <span style={styles.sessionInfoValue}>{consolationBracket.thirdPlace?.label ?? "—"}</span>
              </div>
              <div style={styles.sessionInfoItem}>
                <span style={styles.sessionInfoLabel}>Eighth Place</span>
                <span style={styles.sessionInfoValue}>{consolationBracket.fourthPlace?.label ?? "—"}</span>
              </div>
            </>
          )}
        </div>
      )}
      <div style={styles.bracketScroll}>
        {viewModel.rounds.flatMap((round, i) => {
          const column = (
            <BracketRoundColumn
              key={`consolation-${round.roundNumber}`}
              round={round}
              bracketCompleted={bracketCompleted}
              collapsed={collapsedRounds.has(`consolation-${round.roundNumber}`)}
              onToggleCollapse={() => toggleCollapse(`consolation-${round.roundNumber}`)}
              selectedMatchId={selectedMatchId}
              availableCourts={availableCourts}
              roundRef={(el) => (roundRefs.current[`consolation-${round.roundNumber}`] = el)}
              handlers={handlers}
            />
          );
          if (viewModel.bronzeMatch && i === viewModel.rounds.length - 2) {
            return [
              column,
              <div key="consolation-bronze-match" style={styles.bracketRoundColumn}>
                <p style={{ ...styles.poolHeading, margin: 0 }}>7th Place Match</p>
                <BracketMatchCard
                  match={viewModel.bronzeMatch}
                  bracketCompleted={bracketCompleted}
                  selected={viewModel.bronzeMatch.id === selectedMatchId}
                  onAdvancementPath={false}
                  availableCourts={availableCourts}
                  {...handlers}
                />
              </div>,
            ];
          }
          return [column];
        })}
      </div>
    </div>
  );
}

// Bracket tab — see PROJECT.md's Live Playoff Bracket & Match Operations
// section (and the earlier Playoff Bracket Generation / Winner Advancement
// Engine sections it builds on). Once tournament.bracket exists, this
// renders the real, playable, persisted bracket — Start/Pause/Resume/
// Complete/Walkover/court moves all flow through PlayoffEngine/
// CourtAssignmentService via the parent's handlers, exactly like the pool
// Schedule tab. Before that, it falls back to a live preview.
export default function TournamentBracketView({
  tournament,
  loading,
  matchError,
  onStartMatch,
  onSaveResult,
  onReopenBracket,
  onPauseMatch,
  onResumeMatch,
  onWalkover,
  onAssignMatch,
  onReassignMatch,
  seedError,
  onGenerateDoubleEliminationBracket,
  onDoubleEliminationStartMatch,
  onDoubleEliminationSaveResult,
  onDoubleEliminationPauseMatch,
  onDoubleEliminationResumeMatch,
  onDoubleEliminationWalkover,
  onDoubleEliminationLosersStartMatch,
  onDoubleEliminationLosersSaveResult,
  onDoubleEliminationLosersPauseMatch,
  onDoubleEliminationLosersResumeMatch,
  onDoubleEliminationLosersWalkover,
  onGrandFinalStartMatch,
  onGrandFinalSaveResult,
  onGrandFinalWalkover,
}) {
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [collapsedRounds, setCollapsedRounds] = useState(() => new Set());
  const roundRefs = useRef({});

  if (loading) return <p style={styles.editHint}>Loading tournament…</p>;
  if (!tournament) {
    return <div style={styles.placeholderCard}>Generate a schedule from the Schedule tab to see the bracket here.</div>;
  }
  // Double Elimination — a real bracket exists either as a STANDALONE
  // tournament (tournament.format === "doubleElimination", no pool stage —
  // see lib/tournament.js's buildAndSaveDoubleEliminationTournament) or as
  // the PLAYOFF stage after Round Robin pools (tournament.bracketFormat ===
  // "doubleElimination"). Both render via the same, fully real
  // DoubleEliminationBracketSection below — Winners Bracket, Losers
  // Bracket, and Grand Final (including a Reset) are all genuinely
  // playable now, not a structure-only preview.
  const isDoubleElimination = tournament.format === "doubleElimination" || (tournament.bracketFormat ?? "singleElimination") === "doubleElimination";
  if (tournament.format !== "roundRobin" && !isDoubleElimination) {
    return <div style={styles.placeholderCard}>Bracket generation isn't available for this tournament format yet.</div>;
  }

  if (isDoubleElimination) {
    return (
      <DoubleEliminationBracketSection
        tournament={tournament}
        seedError={seedError}
        matchError={matchError}
        onGenerateDoubleEliminationBracket={onGenerateDoubleEliminationBracket}
        onDoubleEliminationStartMatch={onDoubleEliminationStartMatch}
        onDoubleEliminationSaveResult={onDoubleEliminationSaveResult}
        onDoubleEliminationPauseMatch={onDoubleEliminationPauseMatch}
        onDoubleEliminationResumeMatch={onDoubleEliminationResumeMatch}
        onDoubleEliminationWalkover={onDoubleEliminationWalkover}
        onDoubleEliminationLosersStartMatch={onDoubleEliminationLosersStartMatch}
        onDoubleEliminationLosersSaveResult={onDoubleEliminationLosersSaveResult}
        onDoubleEliminationLosersPauseMatch={onDoubleEliminationLosersPauseMatch}
        onDoubleEliminationLosersResumeMatch={onDoubleEliminationLosersResumeMatch}
        onDoubleEliminationLosersWalkover={onDoubleEliminationLosersWalkover}
        onGrandFinalStartMatch={onGrandFinalStartMatch}
        onGrandFinalSaveResult={onGrandFinalSaveResult}
        onGrandFinalWalkover={onGrandFinalWalkover}
        onAssignMatch={onAssignMatch}
        onReassignMatch={onReassignMatch}
      />
    );
  }

  if (tournament.bracket) {
    const bracket = tournament.bracket;
    const bracketCompleted = bracket.status === "completed";
    const viewModel = buildBracketViewModel(bracket, selectedMatchId);
    const availableCourts = courtAssignmentService.getAvailableCourts(tournament);

    const toggleCollapse = (roundNumber) => {
      setCollapsedRounds((prev) => {
        const next = new Set(prev);
        if (next.has(roundNumber)) next.delete(roundNumber);
        else next.add(roundNumber);
        return next;
      });
    };

    const jumpToCurrentRound = () => {
      setCollapsedRounds((prev) => {
        const next = new Set(prev);
        next.delete(viewModel.currentRoundNumber);
        return next;
      });
      roundRefs.current[viewModel.currentRoundNumber]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    };

    const handlers = {
      onSelect: (id) => setSelectedMatchId(id === selectedMatchId ? null : id),
      onStartMatch,
      onSaveResult,
      onPauseMatch,
      onResumeMatch,
      onWalkover,
      onAssignMatch,
      onReassignMatch,
    };

    return (
      <div>
        <SectionLabel>Bracket</SectionLabel>
        {bracketCompleted ? (
          <>
            <div style={styles.sessionInfoCard}>
              <div style={styles.sessionInfoItem}>
                <span style={styles.sessionInfoLabel}>🥇 Champion</span>
                <span style={styles.sessionInfoValue}>{bracket.champion?.label ?? "—"}</span>
              </div>
              <div style={styles.sessionInfoItem}>
                <span style={styles.sessionInfoLabel}>🥈 Runner-up</span>
                <span style={styles.sessionInfoValue}>{bracket.runnerUp?.label ?? "—"}</span>
              </div>
              {bracket.bronzeMatch && (
                <>
                  <div style={styles.sessionInfoItem}>
                    <span style={styles.sessionInfoLabel}>🥉 Third Place</span>
                    <span style={styles.sessionInfoValue}>{bracket.thirdPlace?.label ?? "—"}</span>
                  </div>
                  <div style={styles.sessionInfoItem}>
                    <span style={styles.sessionInfoLabel}>🏅 Fourth Place</span>
                    <span style={styles.sessionInfoValue}>{bracket.fourthPlace?.label ?? "—"}</span>
                  </div>
                </>
              )}
            </div>
            <ChampionshipSeriesPanel finalRound={bracket.rounds[bracket.rounds.length - 1]} />
            <p style={styles.editHint}>
              The tournament is locked — no further score editing until reopened by an administrator. Reopening
              makes every match's result editable again, but correcting an earlier round after later rounds have
              already been played won't automatically re-run those later results.
            </p>
            <div style={styles.editActions}>
              <button type="button" style={styles.secondaryBtn} onClick={onReopenBracket}>
                <LockOpen size={13} strokeWidth={2.5} />
                Reopen tournament
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={styles.editHint}>
              {bracket.size}-team elimination bracket, seeded by {SEEDING_METHOD_LABELS[tournament.seedingMethod ?? "standardCrossPool"]}.
            </p>
            <div style={styles.editActions}>
              <button type="button" style={styles.secondaryBtn} onClick={jumpToCurrentRound}>
                <Crosshair size={13} strokeWidth={2.5} />
                Jump to current round
              </button>
            </div>
            <BracketProgressPanel bracket={bracket} viewModel={viewModel} />
            <ChampionshipSeriesPanel finalRound={bracket.rounds[bracket.rounds.length - 1]} />
          </>
        )}
        {matchError && <p style={styles.editWarning}>{matchError}</p>}
        <div style={styles.bracketScroll}>
          {viewModel.rounds.flatMap((round, i) => {
            const column = (
              <BracketRoundColumn
                key={round.roundNumber}
                round={round}
                bracketCompleted={bracketCompleted}
                collapsed={collapsedRounds.has(round.roundNumber)}
                onToggleCollapse={() => toggleCollapse(round.roundNumber)}
                selectedMatchId={selectedMatchId}
                availableCourts={availableCourts}
                roundRef={(el) => (roundRefs.current[round.roundNumber] = el)}
                handlers={handlers}
              />
            );
            // Bronze Medal Match — rendered as its own clearly-labeled
            // column right after the semifinal round (i === rounds.length -
            // 2), so it sits alongside the Championship Match rather than
            // nested inside either round's own column — "both should be
            // visible simultaneously" per PROJECT.md.
            if (viewModel.bronzeMatch && i === viewModel.rounds.length - 2) {
              return [
                column,
                <div key="bronze-match" style={styles.bracketRoundColumn}>
                  <p style={{ ...styles.poolHeading, margin: 0 }}>🥉 Bronze Medal Match</p>
                  <BracketMatchCard
                    match={viewModel.bronzeMatch}
                    bracketCompleted={bracketCompleted}
                    selected={viewModel.bronzeMatch.id === selectedMatchId}
                    onAdvancementPath={false}
                    availableCourts={availableCourts}
                    {...handlers}
                  />
                </div>,
              ];
            }
            return [column];
          })}
        </div>
        {tournament.consolationBracket && (
          <ConsolationBracketSection
            consolationBracket={tournament.consolationBracket}
            selectedMatchId={selectedMatchId}
            collapsedRounds={collapsedRounds}
            toggleCollapse={toggleCollapse}
            availableCourts={availableCourts}
            handlers={handlers}
            roundRefs={roundRefs}
          />
        )}
      </div>
    );
  }

  const engine = getTournamentEngine(tournament.format);
  const preview = previewGenerator.generateBracket(tournament, engine);

  if (!preview.ready && preview.reason === "unsupported_size") {
    return (
      <div>
        <SectionLabel>Bracket</SectionLabel>
        <div style={styles.placeholderCard}>
          Bracket generation needs a power-of-two number of qualified teams (2, 4, 8, 16, …) — currently {preview.size}.
          Adjust Teams Advancing Per Pool on the Schedule tab so the qualifier count lands on one of those sizes.
        </div>
      </div>
    );
  }

  // Manual & Advanced Seeding — see PROJECT.md. Auto-generation only fires
  // for Standard Cross-Pool (RoundRobinEngine.updateMatchResult); every
  // other method needs the organizer to visit the Seeding tab and click
  // Generate Bracket explicitly, even once qualification is otherwise
  // ready — this is the one place that distinction needs its own message.
  if (preview.ready && (tournament.seedingMethod ?? "standardCrossPool") !== "standardCrossPool") {
    return (
      <div>
        <SectionLabel>Bracket</SectionLabel>
        <div style={styles.placeholderCard}>
          Qualification is finalized and ready — this tournament uses {tournament.seedingMethod} seeding, which
          doesn't generate automatically. Visit the Seeding tab to review seeds and click Generate Bracket.
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionLabel>Bracket</SectionLabel>
      <div style={styles.placeholderCard}>
        The bracket is generated once every pool has finished and qualified teams are determined. Check the
        Qualification tab once the Schedule tab's remaining matches are complete.
      </div>
    </div>
  );
}

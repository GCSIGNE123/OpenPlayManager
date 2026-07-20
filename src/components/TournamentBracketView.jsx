import { useState } from "react";
import { Check, Play, Pencil, X, LockOpen } from "lucide-react";
import { styles } from "../styles.js";
import { getTournamentEngine } from "../lib/tournament.js";
import { SingleEliminationBracketGenerator } from "../engines/SingleEliminationBracketGenerator.js";
import { PlayoffEngine } from "../engines/PlayoffEngine.js";
import SectionLabel from "./SectionLabel.jsx";

const previewGenerator = new SingleEliminationBracketGenerator();
const playoffEngine = new PlayoffEngine();

const STATUS_LABELS = { locked: "Locked", ready: "Ready", inProgress: "In Progress", completed: "Completed" };

// One playoff match card. Four states, per the Winner Advancement Engine
// (PlayoffEngine.getMatchState — the mapping comes from the bracket
// structure itself, not re-inferred here):
//  - locked: teamA and/or teamB is still null ("TBD") — this round hasn't
//    been unlocked yet, since PlayoffEngine only fills a slot in once the
//    feeding match from the previous round completes. No actions render.
//  - ready: both teams known, not yet started — Start Match.
//  - inProgress: Enter Scores / Save Result, same flow the pool Schedule
//    tab's MatchCard uses.
//  - completed: winner highlighted, loser dimmed; Edit Result available
//    unless the whole bracket is locked (bracket.status === "completed").
function BracketMatchCard({ match, bracketCompleted, onStartMatch, onSaveResult }) {
  const [editing, setEditing] = useState(false);
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [winnerId, setWinnerId] = useState(null);
  const [localError, setLocalError] = useState("");

  const matchState = playoffEngine.getMatchState(match);
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
    <div style={{ ...styles.historyMatchCard, ...(isCompleted ? styles.matchCompletedCard : {}) }}>
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
                          {i === 0 ? match.score.teamA : match.score.teamB}
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
            <div style={styles.editActions}>
              {isCompleted ? (
                canEdit && (
                  <button type="button" style={styles.secondaryBtn} onClick={openForm}>
                    <Pencil size={13} strokeWidth={2.5} />
                    Edit result
                  </button>
                )
              ) : (
                <button type="button" style={styles.primaryBtn} onClick={match.status === "pending" ? handleStart : openForm}>
                  <Play size={14} strokeWidth={2.5} />
                  {match.status === "pending" ? "Start match" : "Enter scores"}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {editing && match.teamA && match.teamB && (
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
    </div>
  );
}

// "Tournament Progress" for the playoff stage, per the Winner Advancement
// Engine spec — Current Round/Matches Remaining/Completed Matches/Current
// Active Matches. Pure derived data (same pattern as everything else in
// this app), recomputed fresh on every render straight from the bracket;
// only shown while the bracket is still in progress — the Champion/
// Runner-up banner above already covers the completed case.
function BracketProgressPanel({ bracket }) {
  const allMatches = bracket.rounds.flatMap((r) => r.matches);
  const completed = allMatches.filter((m) => m.status === "completed").length;
  const active = allMatches.filter((m) => m.status === "inProgress").length;
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
        <span style={styles.sessionInfoLabel}>Current Active Matches</span>
        <span style={styles.sessionInfoValue}>{active}</span>
      </div>
    </div>
  );
}

function BracketRoundColumn({ round, bracketCompleted, onStartMatch, onSaveResult }) {
  return (
    <div style={styles.bracketRoundColumn}>
      <h3 style={styles.poolHeading}>{round.name}</h3>
      {round.matches.map((m) => (
        <BracketMatchCard
          key={m.id}
          match={m}
          bracketCompleted={bracketCompleted}
          onStartMatch={onStartMatch}
          onSaveResult={onSaveResult}
        />
      ))}
    </div>
  );
}

// Bracket tab — see PROJECT.md's Playoff Bracket Generation / Playoff Match
// Management & Winner Advancement sections. Once tournament.bracket exists
// (auto-generated by RoundRobinEngine the moment pool play completes with a
// power-of-two qualifier count — see RoundRobinEngine.updateMatchResult),
// this renders the real, playable, persisted bracket: Start Match/Enter
// Scores/Save Result flow through PlayoffEngine via the parent's
// onStartMatch/onSaveResult handlers, exactly like the pool Schedule tab.
// Before that (pools still in progress, or an unsupported qualifier count),
// it falls back to SingleEliminationBracketGenerator as a live preview —
// the same "not ready yet" / "needs a power-of-two count" messaging the
// prior milestone already had, just no longer the only thing this view does.
export default function TournamentBracketView({ tournament, loading, matchError, onStartMatch, onSaveResult, onReopenBracket }) {
  if (loading) return <p style={styles.editHint}>Loading tournament…</p>;
  if (!tournament) {
    return <div style={styles.placeholderCard}>Generate a schedule from the Schedule tab to see the bracket here.</div>;
  }
  if (tournament.format !== "roundRobin") {
    return <div style={styles.placeholderCard}>Bracket generation isn't available for this tournament format yet.</div>;
  }

  if (tournament.bracket) {
    const bracket = tournament.bracket;
    const bracketCompleted = bracket.status === "completed";
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
            </div>
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
            <p style={styles.editHint}>{bracket.size}-team elimination bracket, seeded by Standard Cross-Pool Seeding.</p>
            <BracketProgressPanel bracket={bracket} />
          </>
        )}
        {matchError && <p style={styles.editWarning}>{matchError}</p>}
        <div style={styles.bracketScroll}>
          {bracket.rounds.map((round) => (
            <BracketRoundColumn
              key={round.roundNumber}
              round={round}
              bracketCompleted={bracketCompleted}
              onStartMatch={onStartMatch}
              onSaveResult={onSaveResult}
            />
          ))}
        </div>
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

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw, Users } from "lucide-react";
import { styles } from "../styles.js";
import { fetchTournament } from "../lib/tournamentModel.js";
import SectionLabel from "./SectionLabel.jsx";

// Static placeholder labels only — nothing in this view ever transitions a
// match's status. Scoring/progression is explicitly a separate future task.
const STATUS_LABELS = { pending: "Pending", inProgress: "In Progress", completed: "Completed" };

function RoundCard({ round, expanded, onToggle }) {
  return (
    <div style={styles.historyRoundCard}>
      <button style={styles.historyRoundHead} onClick={onToggle}>
        {expanded ? <ChevronDown size={14} strokeWidth={2.5} /> : <ChevronRight size={14} strokeWidth={2.5} />}
        <span>Round {round.roundNumber}</span>
        <span style={styles.historyRoundCount}>
          {round.matches.length} match{round.matches.length === 1 ? "" : "es"}
        </span>
      </button>
      {expanded && (
        <div style={styles.historyRoundBody}>
          {round.matches.map((m) => (
            <div key={m.id} style={styles.historyMatchCard}>
              <div style={styles.historyMatchHead}>
                <span style={styles.courtBadge}>{m.isBye ? "BYE" : `COURT ${m.court}`}</span>
                {!m.isBye && <span style={styles.matchStatusBadge(m.status)}>{STATUS_LABELS[m.status]}</span>}
              </div>
              {m.isBye ? (
                <p style={styles.byeTag}>{m.teamA.label} has a bye this round.</p>
              ) : (
                <div style={styles.historyMatchTeams}>
                  <div style={styles.historyTeamLine}>
                    <span>{m.teamA.label}</span>
                  </div>
                  <div style={styles.vsLine} />
                  <div style={styles.historyTeamLine}>
                    <span>{m.teamB.label}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Tournament schedule generation + display for Tournament-type sessions —
// see PROJECT.md's Round Robin Scheduler section. Schedule generation and
// storage both live outside this component (lib/tournament.js,
// lib/tournamentModel.js); this just triggers `onGenerate` and renders
// whatever tournament record `tournamentId` currently points to.
export default function TournamentScheduleView({ state, tournamentId, onGenerate, generating, generateError }) {
  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("singles");
  const [expandedRounds, setExpandedRounds] = useState(() => new Set([1]));

  useEffect(() => {
    if (!tournamentId) {
      setTournament(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchTournament(tournamentId)
      .then((t) => {
        if (cancelled) return;
        setTournament(t);
        if (t) setMode(t.mode);
        setExpandedRounds(new Set([1]));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

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

  return (
    <div>
      <SectionLabel>Tournament Schedule</SectionLabel>

      <div style={styles.tournamentSetupCard}>
        <p style={styles.editHint}>
          {tournament
            ? `Regenerating rebuilds the schedule from this session's ${playerCount} currently registered player${playerCount === 1 ? "" : "s"}.`
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

      {tournament && !loading && (
        <div>
          <p style={styles.editHint}>
            {tournament.mode === "doubles" ? "Doubles" : "Singles"} Round Robin — {tournament.entrants.length}{" "}
            {tournament.mode === "doubles" ? "teams" : "players"}, {tournament.rounds.length} round
            {tournament.rounds.length === 1 ? "" : "s"}.
          </p>
          {tournament.rounds.map((r) => (
            <RoundCard
              key={r.roundNumber}
              round={r}
              expanded={expandedRounds.has(r.roundNumber)}
              onToggle={() => toggleRound(r.roundNumber)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

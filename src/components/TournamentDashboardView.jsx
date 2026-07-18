import { useEffect, useState } from "react";
import { styles } from "../styles.js";
import { fetchTournament, getTournamentProgress } from "../lib/tournamentModel.js";
import { saveMatchStart, saveMatchResult, getTournamentEngine } from "../lib/tournament.js";
import SectionLabel from "./SectionLabel.jsx";
import TournamentScheduleView from "./TournamentScheduleView.jsx";
import TournamentStandingsView from "./TournamentStandingsView.jsx";

const MEDALS = { champion: "🥇", runnerUp: "🥈", thirdPlace: "🥉" };
const PODIUM_LABELS = { champion: "Champion", runnerUp: "Runner-up", thirdPlace: "Third Place" };

function formatCompletionTime(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// Shown once a Round Robin tournament is complete — replaces the live-
// progress Overview with the final result. Champion/runner-up/third place
// were already stamped onto the tournament by RoundRobinCompletionService
// the moment the last match was saved (see RoundRobinEngine.
// updateMatchResult), so this just displays what's already there — no
// recomputation needed.
function CompletedOverviewPanel({ tournament }) {
  const progress = getTournamentProgress(tournament);
  return (
    <div>
      <div style={styles.sessionInfoCard}>
        {["champion", "runnerUp", "thirdPlace"].map((slot) => (
          <div key={slot} style={styles.sessionInfoItem}>
            <span style={styles.sessionInfoLabel}>
              {MEDALS[slot]} {PODIUM_LABELS[slot]}
            </span>
            <span style={styles.sessionInfoValue}>{tournament[slot]?.label ?? "—"}</span>
          </div>
        ))}
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Tournament Status</span>
          <span style={styles.sessionInfoValue}>Completed</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Total Matches</span>
          <span style={styles.sessionInfoValue}>{progress.total}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Matches Completed</span>
          <span style={styles.sessionInfoValue}>{progress.completed}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Completion Time</span>
          <span style={styles.sessionInfoValue}>{formatCompletionTime(tournament.completedAt)}</span>
        </div>
      </div>
      <p style={{ ...styles.editHint, marginTop: 10 }}>{tournament.name} — tournament complete.</p>
    </div>
  );
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "participants", label: "Participants" },
  { id: "schedule", label: "Schedule" },
  { id: "standings", label: "Standings" },
  { id: "bracket", label: "Bracket" },
];

// Static placeholder panel — no data, no logic. Participants/Standings/
// Bracket are all this for now; Overview (Live Tournament Progress) and
// Schedule are real — see below.
function Placeholder({ children }) {
  return <div style={styles.placeholderCard}>{children}</div>;
}

function OverviewPanel({ tournament, loading }) {
  if (loading) return <p style={styles.editHint}>Loading tournament…</p>;
  if (!tournament) {
    return <Placeholder>Generate a schedule from the Schedule tab to see tournament progress here.</Placeholder>;
  }
  if (tournament.status === "completed" && tournament.format === "roundRobin") {
    return <CompletedOverviewPanel tournament={tournament} />;
  }
  const progress = getTournamentProgress(tournament);
  // "Current Leader" only means something once at least one match has
  // actually been decided — with zero completed matches every entrant is
  // tied at 0 wins, so standings[0] would just be an arbitrary name, not a
  // real leader.
  const leader =
    progress.completed > 0 && tournament.format === "roundRobin"
      ? getTournamentEngine(tournament.format).getStandings(tournament)[0]?.label
      : null;
  return (
    <div>
      <div style={styles.sessionInfoCard}>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Total Teams</span>
          <span style={styles.sessionInfoValue}>{tournament.entrants.length}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Matches Completed</span>
          <span style={styles.sessionInfoValue}>{progress.completed}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Matches Remaining</span>
          <span style={styles.sessionInfoValue}>{progress.remaining}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Current Leader</span>
          <span style={styles.sessionInfoValue}>{leader || "—"}</span>
        </div>
      </div>
      <div style={styles.tournamentProgressTrack}>
        <div style={styles.tournamentProgressFill(progress.percent)} />
      </div>
      <p style={{ ...styles.editHint, marginTop: 10 }}>
        {tournament.name} — {progress.percent}% complete, status: <strong>{tournament.status}</strong>.
      </p>
    </div>
  );
}

// Tournament Dashboard — Overview, Schedule, and Standings all share one
// fetched copy of the tournament, owned here, so a result saved in Schedule
// is reflected everywhere else immediately without a second fetch. Once a
// Round Robin tournament completes, Overview switches to the final result
// (champion/runner-up/third place) automatically — see
// RoundRobinCompletionService. Participants/Bracket remain placeholders.
// Reachable from the session nav's "Tournament" tab, shown only when
// state.sessionType === "tournament" — see PickleballOpenPlay.jsx.
export default function TournamentDashboardView({ state, tournamentId, onGenerate, generating, generateError }) {
  const [tab, setTab] = useState("overview");
  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(false);
  const [matchError, setMatchError] = useState("");

  useEffect(() => {
    if (!tournamentId) {
      setTournament(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchTournament(tournamentId)
      .then((t) => {
        if (!cancelled) setTournament(t);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  const handleGenerate = async (mode) => {
    setMatchError("");
    if (tournament?.status === "completed") {
      setMatchError("This tournament is already completed — the schedule can't be regenerated.");
      return;
    }
    await onGenerate(mode);
  };

  const handleStartMatch = async (matchId) => {
    if (!tournament) return;
    setMatchError("");
    try {
      const updated = await saveMatchStart(tournament, matchId);
      setTournament(updated);
    } catch (e) {
      setMatchError(e.message);
    }
  };

  const handleSaveResult = async (matchId, result) => {
    if (!tournament) return;
    setMatchError("");
    try {
      const updated = await saveMatchResult(tournament, matchId, result);
      setTournament(updated);
    } catch (e) {
      setMatchError(e.message);
    }
  };

  return (
    <div>
      <SectionLabel>Tournament Dashboard</SectionLabel>
      <div style={styles.dashboardTabRow}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            style={styles.dashboardTabBtn(tab === t.id)}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewPanel tournament={tournament} loading={loading} />}

      {tab === "participants" && (
        <Placeholder>Manage tournament participants and seeding. Coming soon.</Placeholder>
      )}

      {tab === "schedule" && (
        <TournamentScheduleView
          state={state}
          tournament={tournament}
          loading={loading}
          onGenerate={handleGenerate}
          generating={generating}
          generateError={generateError}
          matchError={matchError}
          onStartMatch={handleStartMatch}
          onSaveResult={handleSaveResult}
        />
      )}

      {tab === "standings" && <TournamentStandingsView tournament={tournament} loading={loading} />}

      {tab === "bracket" && <Placeholder>Elimination bracket view. Coming soon.</Placeholder>}
    </div>
  );
}

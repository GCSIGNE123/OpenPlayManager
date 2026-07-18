import { useEffect, useState } from "react";
import { styles } from "../styles.js";
import { fetchTournament, getTournamentProgress, getPoolProgress } from "../lib/tournamentModel.js";
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

// One pool's own podium — champion/runner-up/third place were already
// stamped onto that pool by RoundRobinCompletionService the moment its own
// last match was saved (see RoundRobinEngine.updateMatchResult), so this
// just displays what's already there. Pools are fully independent — there
// is no single combined "tournament champion" across pools (that's what a
// future Playoff Qualification feature would add), so a multi-pool
// tournament shows one podium per pool rather than picking a winner.
function PoolPodium({ pool, showHeading }) {
  return (
    <div style={styles.poolScheduleBlock}>
      {showHeading && <h3 style={styles.poolHeading}>{pool.label}</h3>}
      <div style={styles.sessionInfoCard}>
        {["champion", "runnerUp", "thirdPlace"].map((slot) => (
          <div key={slot} style={styles.sessionInfoItem}>
            <span style={styles.sessionInfoLabel}>
              {MEDALS[slot]} {PODIUM_LABELS[slot]}
            </span>
            <span style={styles.sessionInfoValue}>{pool[slot]?.label ?? "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Shown once every pool in a Round Robin tournament is complete — replaces
// the live-progress Overview with the final result.
function CompletedOverviewPanel({ tournament }) {
  const progress = getTournamentProgress(tournament);
  const latestCompletion = Math.max(...tournament.pools.map((p) => p.completedAt || 0));
  return (
    <div>
      <div style={styles.sessionInfoCard}>
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
          <span style={styles.sessionInfoValue}>{formatCompletionTime(latestCompletion)}</span>
        </div>
      </div>
      {tournament.pools.map((pool) => (
        <PoolPodium key={pool.id} pool={pool} showHeading={tournament.pools.length > 1} />
      ))}
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

// Static placeholder panel — no data, no logic. Participants/Bracket are
// still this for now; Overview, Schedule, and Standings are all real.
function Placeholder({ children }) {
  return <div style={styles.placeholderCard}>{children}</div>;
}

// Live, pool-aware Overview for an in-progress tournament — Number of
// Pools / Teams per Pool / Matches per Pool / Pool Leaders, per the Round
// Robin Pool Support spec, plus the pre-existing aggregate Total Teams/
// Completed/Remaining stats and progress bar (summed across every pool via
// getTournamentProgress). With a single pool (the default), "Teams per
// Pool"/"Matches per Pool"/"Pool Leaders" each just show one entry — no
// different in substance from the old single-pool Overview, just labeled
// per-pool now that pools are the real unit of play.
function OverviewPanel({ tournament, loading }) {
  if (loading) return <p style={styles.editHint}>Loading tournament…</p>;
  if (!tournament) {
    return <Placeholder>Generate a schedule from the Schedule tab to see tournament progress here.</Placeholder>;
  }
  if (tournament.status === "completed" && tournament.format === "roundRobin") {
    return <CompletedOverviewPanel tournament={tournament} />;
  }
  const progress = getTournamentProgress(tournament);
  const engine = tournament.format === "roundRobin" ? getTournamentEngine(tournament.format) : null;

  const poolStats = tournament.pools.map((pool) => {
    const poolProgress = getPoolProgress(pool);
    // A pool's leader only means something once one of its matches has
    // actually been decided — with zero completed matches every entrant in
    // that pool is tied at 0 wins, so standings[0] would just be an
    // arbitrary name, not a real leader.
    const leader = engine && poolProgress.completed > 0 ? engine.getStandings(tournament, pool.id)[0]?.label : null;
    return { pool, poolProgress, leader };
  });

  return (
    <div>
      <div style={styles.sessionInfoCard}>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Total Teams</span>
          <span style={styles.sessionInfoValue}>{tournament.pools.reduce((sum, p) => sum + p.entrants.length, 0)}</span>
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
          <span style={styles.sessionInfoLabel}>Number of Pools</span>
          <span style={styles.sessionInfoValue}>{tournament.pools.length}</span>
        </div>
      </div>
      <div style={styles.tournamentProgressTrack}>
        <div style={styles.tournamentProgressFill(progress.percent)} />
      </div>
      <p style={{ ...styles.editHint, marginTop: 10 }}>
        {tournament.name} — {progress.percent}% complete, status: <strong>{tournament.status}</strong>.
      </p>

      <h3 style={{ ...styles.poolHeading, marginTop: 18 }}>Pools</h3>
      <div style={styles.tournamentStandingsScroll}>
        <table style={styles.tournamentStandingsTable}>
          <thead>
            <tr style={styles.tournamentStandingsHeadRow}>
              <th style={{ ...styles.tournamentStandingsHeadCell, textAlign: "left" }}>Pool</th>
              <th style={styles.tournamentStandingsHeadCell}>Teams</th>
              <th style={styles.tournamentStandingsHeadCell}>Matches</th>
              <th style={{ ...styles.tournamentStandingsHeadCell, textAlign: "left" }}>Leader</th>
            </tr>
          </thead>
          <tbody>
            {poolStats.map(({ pool, poolProgress, leader }) => (
              <tr key={pool.id} style={styles.tournamentStandingsRow(99)}>
                <td style={styles.tournamentStandingsNameCell}>{pool.label}</td>
                <td style={styles.tournamentStandingsCell}>{pool.entrants.length}</td>
                <td style={styles.tournamentStandingsCell}>
                  {poolProgress.completed}/{poolProgress.total}
                </td>
                <td style={styles.tournamentStandingsNameCell}>{leader || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Tournament Dashboard — Overview, Schedule, and Standings all share one
// fetched copy of the tournament, owned here, so a result saved in Schedule
// is reflected everywhere else immediately without a second fetch. Once
// every pool in a Round Robin tournament completes, Overview switches to
// the final result automatically — see RoundRobinCompletionService.
// Participants/Bracket remain placeholders. Reachable from the session
// nav's "Tournament" tab, shown only when state.sessionType === "tournament"
// — see PickleballOpenPlay.jsx.
//
// `selectedPool` ('all' | poolId) lives here rather than in Schedule/
// Standings individually so switching tabs doesn't lose which pool you were
// looking at. The pool tab row only renders once there's more than one pool
// — with the default poolCount of 1, the Dashboard looks and behaves
// exactly like it did before Pool Support.
export default function TournamentDashboardView({ state, tournamentId, onGenerate, generating, generateError }) {
  const [tab, setTab] = useState("overview");
  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [selectedPool, setSelectedPool] = useState("all");

  useEffect(() => {
    if (!tournamentId) {
      setTournament(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchTournament(tournamentId)
      .then((t) => {
        if (!cancelled) {
          setTournament(t);
          setSelectedPool("all");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  const handleGenerate = async (mode, poolCount) => {
    setMatchError("");
    if (tournament?.status === "completed") {
      setMatchError("This tournament is already completed — the schedule can't be regenerated.");
      return;
    }
    setSelectedPool("all");
    await onGenerate(mode, poolCount);
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

  const pools = tournament?.pools ?? [];

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

      {pools.length > 1 && (tab === "schedule" || tab === "standings") && (
        <div style={styles.dashboardTabRow}>
          <button type="button" style={styles.dashboardTabBtn(selectedPool === "all")} onClick={() => setSelectedPool("all")}>
            All Pools
          </button>
          {pools.map((p) => (
            <button
              key={p.id}
              type="button"
              style={styles.dashboardTabBtn(selectedPool === p.id)}
              onClick={() => setSelectedPool(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

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
          selectedPool={selectedPool}
        />
      )}

      {tab === "standings" && (
        <TournamentStandingsView tournament={tournament} loading={loading} selectedPool={selectedPool} />
      )}

      {tab === "bracket" && <Placeholder>Elimination bracket view. Coming soon.</Placeholder>}
    </div>
  );
}

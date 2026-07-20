import { useEffect, useState } from "react";
import { styles } from "../styles.js";
import { fetchTournament, getTournamentProgress, getPoolProgress } from "../lib/tournamentModel.js";
import {
  saveMatchStart,
  saveMatchResult,
  savePlayoffMatchStart,
  savePlayoffMatchResult,
  saveReopenBracket,
  savePauseMatch,
  saveResumeMatch,
  saveWalkover,
  saveCourtAssignment,
  saveCourtRelease,
  saveCourtReassignment,
  saveAddCourt,
  saveRemoveCourt,
  saveSetCourtStatus,
  saveRenameCourt,
  saveSwapCourts,
  saveDelayMatch,
  saveUndelayMatch,
  savePinMatch,
  saveUnpinMatch,
  saveTournamentSettings,
  saveManualSeeds,
  saveGenerateBracket,
  getTournamentEngine,
} from "../lib/tournament.js";
import { PoolQualificationService } from "../engines/PoolQualificationService.js";
import { ChampionshipSeriesService } from "../engines/ChampionshipSeriesService.js";
import { MATCH_FORMATS } from "../engines/TournamentSettings.js";
import SectionLabel from "./SectionLabel.jsx";
import TournamentScheduleView from "./TournamentScheduleView.jsx";
import TournamentStandingsView from "./TournamentStandingsView.jsx";
import TournamentQualificationView from "./TournamentQualificationView.jsx";
import TournamentSeedingView from "./TournamentSeedingView.jsx";
import TournamentBracketView from "./TournamentBracketView.jsx";
import TournamentCourtsView from "./TournamentCourtsView.jsx";
import TournamentSettingsView from "./TournamentSettingsView.jsx";
import TournamentReportsView from "./TournamentReportsView.jsx";

const qualificationService = new PoolQualificationService();
const seriesService = new ChampionshipSeriesService();
const MATCH_FORMAT_LABELS = Object.fromEntries(MATCH_FORMATS.map((f) => [f.value, f.label]));

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
  // Playoff stage is only meaningful once every pool is done (which is
  // exactly the condition that got us into this panel), so
  // determineQualifiers is always `ready: true` here.
  const engine = getTournamentEngine(tournament.format);
  const qualification = qualificationService.determineQualifiers(tournament, engine);
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
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Playoff Stage</span>
          <span style={styles.sessionInfoValue}>
            {qualification.playoffSize.stage} ({qualification.playoffSize.count})
          </span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Total Qualified Participants</span>
          <span style={styles.sessionInfoValue}>{qualification.playoffSize.count}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Total Playoff Matches</span>
          <span style={styles.sessionInfoValue}>
            {tournament.bracket
              ? tournament.bracket.rounds.reduce((sum, r) => sum + r.matches.length, 0) + (tournament.bracket.bronzeMatch ? 1 : 0)
              : qualification.playoffSize.count - 1}
          </span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Bracket Status</span>
          <span style={styles.sessionInfoValue}>{tournament.bracket ? tournament.bracket.status : "Not generated"}</span>
        </div>
        {tournament.bracket?.status === "completed" && (
          <>
            <div style={styles.sessionInfoItem}>
              <span style={styles.sessionInfoLabel}>🥇 Bracket Champion</span>
              <span style={styles.sessionInfoValue}>{tournament.bracket.champion?.label ?? "—"}</span>
            </div>
            <div style={styles.sessionInfoItem}>
              <span style={styles.sessionInfoLabel}>🥈 Bracket Runner-up</span>
              <span style={styles.sessionInfoValue}>{tournament.bracket.runnerUp?.label ?? "—"}</span>
            </div>
            {tournament.bracket.bronzeMatch && (
              <>
                <div style={styles.sessionInfoItem}>
                  <span style={styles.sessionInfoLabel}>🥉 Third Place</span>
                  <span style={styles.sessionInfoValue}>{tournament.bracket.thirdPlace?.label ?? "—"}</span>
                </div>
                <div style={styles.sessionInfoItem}>
                  <span style={styles.sessionInfoLabel}>🏅 Fourth Place</span>
                  <span style={styles.sessionInfoValue}>{tournament.bracket.fourthPlace?.label ?? "—"}</span>
                </div>
              </>
            )}
          </>
        )}
      </div>
      {tournament.bracket && (() => {
        // Best-of-3 Finals — see PROJECT.md. The Final round holds more
        // than one match exactly when it's a series; nothing to show
        // otherwise (a single-match Final's Champion/Runner-up above
        // already covers it).
        const finalRound = tournament.bracket.rounds[tournament.bracket.rounds.length - 1];
        if (finalRound.matches.length < 2) return null;
        const score = seriesService.getSeriesScore(finalRound.matches);
        const reference = finalRound.matches[0];
        const complete = seriesService.isSeriesComplete(finalRound.matches);
        const nextGame = finalRound.matches.find((m) => m.status !== "completed");
        const gamesRemaining = complete ? 0 : 3 - finalRound.matches.filter((m) => m.status === "completed").length;
        return (
          <div style={styles.sessionInfoCard}>
            <div style={styles.sessionInfoItem}>
              <span style={styles.sessionInfoLabel}>Championship Series</span>
              <span style={styles.sessionInfoValue}>
                {reference.teamA?.label} {score[reference.teamA?.participantId] ?? 0} – {score[reference.teamB?.participantId] ?? 0} {reference.teamB?.label}
              </span>
            </div>
            <div style={styles.sessionInfoItem}>
              <span style={styles.sessionInfoLabel}>Games Remaining</span>
              <span style={styles.sessionInfoValue}>{gamesRemaining}</span>
            </div>
            <div style={styles.sessionInfoItem}>
              <span style={styles.sessionInfoLabel}>Series Status</span>
              <span style={styles.sessionInfoValue}>{complete ? "Decided" : nextGame ? `Next: Game ${nextGame.matchNumber}` : "—"}</span>
            </div>
          </div>
        );
      })()}
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
  { id: "qualification", label: "Qualification" },
  { id: "seeding", label: "Seeding" },
  { id: "bracket", label: "Bracket" },
  { id: "courts", label: "Courts" },
  { id: "reports", label: "Reports" },
  { id: "settings", label: "Settings" },
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

  // Pool Qualification Engine — see PROJECT.md. Pools Completed/Remaining
  // read straight off each pool's own status; Qualified/Eliminated come
  // from determineQualifiers' per-pool rows, which are already live even
  // while sibling pools are still "pending" (see PoolQualificationService).
  const poolsCompleted = tournament.pools.filter((p) => p.status === "completed").length;
  const qualification = engine ? qualificationService.determineQualifiers(tournament, engine) : null;
  const qualifiedCount = qualification ? qualification.pools.flatMap((p) => p.rows.filter((r) => r.qualificationStatus === "qualified")).length : 0;
  const eliminatedCount = qualification ? qualification.pools.flatMap((p) => p.rows.filter((r) => r.qualificationStatus === "eliminated")).length : 0;

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
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Pools Completed</span>
          <span style={styles.sessionInfoValue}>{poolsCompleted}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Pools Remaining</span>
          <span style={styles.sessionInfoValue}>{tournament.pools.length - poolsCompleted}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Qualified</span>
          <span style={styles.sessionInfoValue}>{qualifiedCount}</span>
        </div>
        <div style={styles.sessionInfoItem}>
          <span style={styles.sessionInfoLabel}>Eliminated</span>
          <span style={styles.sessionInfoValue}>{eliminatedCount}</span>
        </div>
      </div>
      <div style={styles.tournamentProgressTrack}>
        <div style={styles.tournamentProgressFill(progress.percent)} />
      </div>
      <p style={{ ...styles.editHint, marginTop: 10 }}>
        {tournament.name} — {progress.percent}% complete, status: <strong>{tournament.status}</strong>.
      </p>
      {tournament.matchScoringRules && (
        <p style={styles.editHint}>
          Match rules (see Settings, reference only — not enforced): {MATCH_FORMAT_LABELS[tournament.matchScoringRules.matchFormat] ?? tournament.matchScoringRules.matchFormat}
          , first to {tournament.matchScoringRules.winningScore}
          {tournament.matchScoringRules.winByTwo ? ", win by 2" : ""}.
        </p>
      )}

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
  const [courtError, setCourtError] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [seedError, setSeedError] = useState("");
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

  const handleGenerate = async (mode, poolCount, advancesPerPool) => {
    setMatchError("");
    if (tournament?.status === "completed") {
      setMatchError("This tournament is already completed — the schedule can't be regenerated.");
      return;
    }
    setSelectedPool("all");
    await onGenerate(mode, poolCount, advancesPerPool);
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

  // Playoff Match Management & Winner Advancement — same "call the engine,
  // setTournament(updated)" shape as the pool handlers above, just routed
  // through PlayoffEngine (via lib/tournament.js's savePlayoffMatch*) and
  // operating on tournament.bracket instead of tournament.pools. This is
  // what makes "refresh the bracket immediately" free — the same live
  // `tournament` object already flows down to the Bracket tab.
  const handlePlayoffStartMatch = async (matchId) => {
    if (!tournament) return;
    setMatchError("");
    try {
      const updated = await savePlayoffMatchStart(tournament, matchId);
      setTournament(updated);
    } catch (e) {
      setMatchError(e.message);
    }
  };

  const handlePlayoffSaveResult = async (matchId, result) => {
    if (!tournament) return;
    setMatchError("");
    try {
      const updated = await savePlayoffMatchResult(tournament, matchId, result);
      setTournament(updated);
    } catch (e) {
      setMatchError(e.message);
    }
  };

  // Live Playoff Bracket & Match Operations — see PROJECT.md. Same shape
  // as every other playoff handler here.
  const handlePauseMatch = async (matchId) => {
    if (!tournament) return;
    setMatchError("");
    try {
      setTournament(await savePauseMatch(tournament, matchId));
    } catch (e) {
      setMatchError(e.message);
    }
  };

  const handleResumeMatch = async (matchId) => {
    if (!tournament) return;
    setMatchError("");
    try {
      setTournament(await saveResumeMatch(tournament, matchId));
    } catch (e) {
      setMatchError(e.message);
    }
  };

  const handleWalkover = async (matchId, winnerId) => {
    if (!tournament) return;
    setMatchError("");
    try {
      setTournament(await saveWalkover(tournament, matchId, winnerId));
    } catch (e) {
      setMatchError(e.message);
    }
  };

  // Round Robin Playoff Engine — see PROJECT.md. Same shape as every other
  // handler here; PlayoffEngine.reopenBracket does the actual unlocking.
  const handleReopenBracket = async () => {
    if (!tournament) return;
    setMatchError("");
    try {
      const updated = await saveReopenBracket(tournament);
      setTournament(updated);
    } catch (e) {
      setMatchError(e.message);
    }
  };

  // Tournament Court Assignment & Match Queue — same "call the lib
  // function, setTournament(updated)" shape as every other handler above,
  // now routed through CourtAssignmentService (via lib/tournament.js's
  // saveCourt* helpers).
  const handleAssignMatch = async (matchId, courtNumber) => {
    if (!tournament) return;
    setCourtError("");
    try {
      const updated = await saveCourtAssignment(tournament, matchId, courtNumber);
      setTournament(updated);
    } catch (e) {
      setCourtError(e.message);
    }
  };

  const handleReleaseCourt = async (courtNumber) => {
    if (!tournament) return;
    setCourtError("");
    try {
      const updated = await saveCourtRelease(tournament, courtNumber);
      setTournament(updated);
    } catch (e) {
      setCourtError(e.message);
    }
  };

  const handleReassignMatch = async (matchId, fromCourtNumber, toCourtNumber) => {
    if (!tournament) return;
    setCourtError("");
    try {
      const updated = await saveCourtReassignment(tournament, matchId, fromCourtNumber, toCourtNumber);
      setTournament(updated);
    } catch (e) {
      setCourtError(e.message);
    }
  };

  // Court Assignment & Match Queue Engine — same "call the lib function,
  // setTournament(updated)" shape as every other court handler here.
  const handleSwapCourts = async (courtNumberA, courtNumberB) => {
    if (!tournament) return;
    setCourtError("");
    try {
      const updated = await saveSwapCourts(tournament, courtNumberA, courtNumberB);
      setTournament(updated);
    } catch (e) {
      setCourtError(e.message);
    }
  };

  const handleDelayMatch = async (matchId) => {
    if (!tournament) return;
    setCourtError("");
    try {
      setTournament(await saveDelayMatch(tournament, matchId));
    } catch (e) {
      setCourtError(e.message);
    }
  };

  const handleUndelayMatch = async (matchId) => {
    if (!tournament) return;
    setCourtError("");
    try {
      setTournament(await saveUndelayMatch(tournament, matchId));
    } catch (e) {
      setCourtError(e.message);
    }
  };

  const handlePinMatch = async (matchId, courtNumber) => {
    if (!tournament) return;
    setCourtError("");
    try {
      setTournament(await savePinMatch(tournament, matchId, courtNumber));
    } catch (e) {
      setCourtError(e.message);
    }
  };

  const handleUnpinMatch = async (matchId) => {
    if (!tournament) return;
    setCourtError("");
    try {
      setTournament(await saveUnpinMatch(tournament, matchId));
    } catch (e) {
      setCourtError(e.message);
    }
  };

  const handleAddCourt = async (name) => {
    if (!tournament) return;
    setCourtError("");
    try {
      const updated = await saveAddCourt(tournament, name);
      setTournament(updated);
    } catch (e) {
      setCourtError(e.message);
    }
  };

  const handleRemoveCourt = async (courtId) => {
    if (!tournament) return;
    setCourtError("");
    try {
      const updated = await saveRemoveCourt(tournament, courtId);
      setTournament(updated);
    } catch (e) {
      setCourtError(e.message);
    }
  };

  const handleSetCourtStatus = async (courtId, status) => {
    if (!tournament) return;
    setCourtError("");
    try {
      const updated = await saveSetCourtStatus(tournament, courtId, status);
      setTournament(updated);
    } catch (e) {
      setCourtError(e.message);
    }
  };

  // Tournament Settings — same "call the lib function, setTournament
  // (updated)" shape every other tab's handlers already use. Court renames
  // reuse the existing Courts-tab helper directly (there's exactly one
  // place a court record gets edited); everything else goes through
  // saveTournamentSettings, which throws on any currently-locked field.
  const handleSaveSettings = async (changes) => {
    if (!tournament) return;
    setSettingsError("");
    try {
      const updated = await saveTournamentSettings(tournament, changes);
      setTournament(updated);
    } catch (e) {
      setSettingsError(e.message);
    }
  };

  const handleRenameCourt = async (courtId, name) => {
    if (!tournament) return;
    setSettingsError("");
    try {
      const updated = await saveRenameCourt(tournament, courtId, name);
      setTournament(updated);
    } catch (e) {
      setSettingsError(e.message);
    }
  };

  // Manual & Advanced Seeding — same "call the lib function, setTournament
  // (updated)" shape every other tab's handlers already use.
  const handleSaveManualSeeds = async (manualSeeds) => {
    if (!tournament) return;
    setSeedError("");
    try {
      setTournament(await saveManualSeeds(tournament, manualSeeds));
    } catch (e) {
      setSeedError(e.message);
    }
  };

  const handleGenerateBracket = async () => {
    if (!tournament) return;
    setSeedError("");
    try {
      setTournament(await saveGenerateBracket(tournament));
    } catch (e) {
      setSeedError(e.message);
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

      {tab === "qualification" && <TournamentQualificationView tournament={tournament} loading={loading} />}

      {tab === "seeding" && (
        <TournamentSeedingView
          tournament={tournament}
          loading={loading}
          seedError={seedError}
          onSaveManualSeeds={handleSaveManualSeeds}
          onGenerateBracket={handleGenerateBracket}
        />
      )}

      {tab === "bracket" && (
        <TournamentBracketView
          tournament={tournament}
          loading={loading}
          matchError={matchError}
          onStartMatch={handlePlayoffStartMatch}
          onSaveResult={handlePlayoffSaveResult}
          onReopenBracket={handleReopenBracket}
          onPauseMatch={handlePauseMatch}
          onResumeMatch={handleResumeMatch}
          onWalkover={handleWalkover}
          onAssignMatch={handleAssignMatch}
          onReassignMatch={handleReassignMatch}
        />
      )}

      {tab === "courts" && (
        <TournamentCourtsView
          tournament={tournament}
          loading={loading}
          courtError={courtError}
          onAssignMatch={handleAssignMatch}
          onReleaseCourt={handleReleaseCourt}
          onReassignMatch={handleReassignMatch}
          onSwapCourts={handleSwapCourts}
          onDelayMatch={handleDelayMatch}
          onUndelayMatch={handleUndelayMatch}
          onPinMatch={handlePinMatch}
          onUnpinMatch={handleUnpinMatch}
          onAddCourt={handleAddCourt}
          onRemoveCourt={handleRemoveCourt}
          onSetCourtStatus={handleSetCourtStatus}
          onStartPoolMatch={handleStartMatch}
          onStartPlayoffMatch={handlePlayoffStartMatch}
        />
      )}

      {tab === "reports" && <TournamentReportsView tournament={tournament} loading={loading} />}

      {tab === "settings" && (
        <TournamentSettingsView
          tournament={tournament}
          loading={loading}
          settingsError={settingsError}
          onSave={handleSaveSettings}
          onRenameCourt={handleRenameCourt}
        />
      )}
    </div>
  );
}

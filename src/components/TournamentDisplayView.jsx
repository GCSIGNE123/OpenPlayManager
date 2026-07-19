import { useEffect, useState } from "react";
import { Maximize, LogOut } from "lucide-react";
import { STORAGE_PREFIX, TOURNAMENT_PREFIX } from "../lib/constants.js";
import { getTournamentProgress } from "../lib/tournamentModel.js";
import { getTournamentEngine } from "../lib/tournament.js";
import { CourtAssignmentService } from "../engines/CourtAssignmentService.js";
import { displayStyles as ds } from "../displayStyles.js";

const courtAssignmentService = new CourtAssignmentService();

const STATUS_LABELS = { pending: "Pending", inProgress: "In Progress", completed: "Completed" };

function matchupLabel(match) {
  return `${match.teamA.label} vs ${match.teamB.label}`;
}

// Total matches (pool + bracket, whichever exist) — Overview's Matches
// Completed/Remaining needs to reflect the whole event, not just pool play,
// once playoffs are underway.
function getOverallProgress(tournament) {
  const pool = getTournamentProgress(tournament);
  if (!tournament.bracket) return pool;
  const bracketMatches = tournament.bracket.rounds.flatMap((r) => r.matches);
  const bracketTotal = bracketMatches.length;
  const bracketCompleted = bracketMatches.filter((m) => m.status === "completed").length;
  const total = pool.total + bracketTotal;
  const completed = pool.completed + bracketCompleted;
  return { total, completed, remaining: total - completed, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
}

// "Current Stage" — automatically reflects whichever phase is actually
// live, no manual toggle: no bracket yet -> pool play; bracket exists but
// not finished -> whichever round currently has an incomplete match;
// bracket finished -> champion crowned.
function currentStage(tournament) {
  if (!tournament.bracket) {
    return tournament.status === "completed" ? "Pool Play Complete" : "Pool Play";
  }
  if (tournament.bracket.status === "completed") return "Champion Crowned";
  const activeRound = tournament.bracket.rounds.find((r) => r.matches.some((m) => m.status !== "completed"));
  return `Playoffs — ${activeRound?.name ?? tournament.bracket.rounds[0].name}`;
}

// One pool's standings table, TV-sized — shown during pool play. Reuses
// RoundRobinStandingsService via the engine, the exact same data the
// organizer's Standings tab computes; this view never writes anything, it
// only ever reads.
function PoolStandingsBoard({ tournament, engine }) {
  return (
    <div style={ds.panel}>
      <h2 style={ds.panelTitle}>Standings</h2>
      <div style={ds.poolsGrid}>
        {tournament.pools.map((pool) => {
          const standings = engine.getStandings(tournament, pool.id);
          return (
            <div key={pool.id} style={ds.standingsCard}>
              {tournament.pools.length > 1 && <h3 style={ds.standingsPoolLabel}>{pool.label}</h3>}
              <table style={ds.standingsTable}>
                <thead>
                  <tr>
                    <th style={ds.standingsHeadCell}>#</th>
                    <th style={{ ...ds.standingsHeadCell, textAlign: "left" }}>{tournament.mode === "doubles" ? "Team" : "Player"}</th>
                    <th style={ds.standingsHeadCell}>W</th>
                    <th style={ds.standingsHeadCell}>L</th>
                    <th style={ds.standingsHeadCell}>+/-</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row) => (
                    <tr key={row.participantId}>
                      <td style={ds.standingsCell}>{row.rank}</td>
                      <td style={{ ...ds.standingsCell, textAlign: "left", fontWeight: 700 }}>{row.label}</td>
                      <td style={ds.standingsCell}>{row.wins}</td>
                      <td style={ds.standingsCell}>{row.losses}</td>
                      <td style={ds.standingsCell}>{row.pointDiff > 0 ? `+${row.pointDiff}` : row.pointDiff}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The live elimination bracket, TV-sized — shown during playoffs. Purely
// renders tournament.bracket, the same live-subscribed data driving
// everything else on this page — a winner completed elsewhere shows up here
// automatically on the next realtime update, no action needed on this
// screen.
function BracketBoard({ bracket }) {
  return (
    <div style={ds.panel}>
      <h2 style={ds.panelTitle}>Bracket</h2>
      <div style={ds.bracketScroll}>
        {bracket.rounds.map((round) => (
          <div key={round.roundNumber} style={ds.bracketColumn}>
            <h3 style={ds.bracketRoundName}>{round.name}</h3>
            {round.matches.map((m) => (
              <div key={m.id} style={ds.bracketMatchCard(m.status === "completed")}>
                {[m.teamA, m.teamB].map((team, i) => (
                  <div key={i} style={ds.bracketTeamLine}>
                    {team ? (
                      <>
                        <span style={ds.bracketSeed}>#{team.seed}</span>
                        <span>{team.label}</span>
                      </>
                    ) : (
                      <span style={ds.bracketTbd}>TBD</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
      {bracket.status === "completed" && (
        <div style={ds.championBanner}>
          🥇 {bracket.champion?.label} <span style={ds.championVs}>defeats</span> 🥈 {bracket.runnerUp?.label}
        </div>
      )}
    </div>
  );
}

// Tournament Display Mode ("TV Mode") — see PROJECT.md's Tournament Display
// Mode section. A strictly read-only spectator screen: it fetches its own
// session + tournament data independently of the organizer dashboard (so it
// works whether reached from within an already-loaded session or directly
// via a `?display=CODE` URL on a second device) and never imports or calls
// a single save*/mutate function — there's nothing here to disable, nothing
// mutating is wired in at all. Both the session and tournament records are
// realtime-subscribed (window.storage.subscribeToKey, the same mechanism
// the organizer app already uses for its own session), so every panel
// updates within about a second of any change made anywhere else — no
// manual refresh, no polling loop.
export default function TournamentDisplayView({ sessionCode, onExit }) {
  const [session, setSession] = useState(null);
  const [tournament, setTournament] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadSession = async () => {
      try {
        const res = await window.storage.get(`${STORAGE_PREFIX}${sessionCode}`, true);
        if (!cancelled) setSession(JSON.parse(res.value));
      } catch (e) {
        if (!cancelled) setError("Session not found — check the code and try again.");
      }
    };
    loadSession();
    const unsubscribe = window.storage.subscribeToKey(`${STORAGE_PREFIX}${sessionCode}`, true, loadSession);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sessionCode]);

  useEffect(() => {
    if (!session?.tournamentId) return undefined;
    let cancelled = false;
    const loadTournament = async () => {
      try {
        const res = await window.storage.get(`${TOURNAMENT_PREFIX}${session.tournamentId}`, true);
        if (!cancelled) setTournament(JSON.parse(res.value));
      } catch (e) {
        // tournament not generated yet, or was regenerated under a new id — not an error, just nothing to show yet
      }
    };
    loadTournament();
    const unsubscribe = window.storage.subscribeToKey(`${TOURNAMENT_PREFIX}${session.tournamentId}`, true, loadTournament);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [session?.tournamentId]);

  const enterFullscreen = () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  if (error) {
    return (
      <div style={ds.screen}>
        <div style={ds.centeredMessage}>{error}</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={ds.screen}>
        <div style={ds.centeredMessage}>Loading…</div>
      </div>
    );
  }

  if (session.sessionType !== "tournament") {
    return (
      <div style={ds.screen}>
        <div style={ds.centeredMessage}>Display Mode is available for tournament sessions.</div>
        <button style={ds.exitBtn} onClick={onExit}>
          <LogOut size={16} strokeWidth={2.5} /> Exit
        </button>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div style={ds.screen}>
        <div style={ds.centeredMessage}>Waiting for the schedule to be generated…</div>
        <button style={ds.exitBtn} onClick={onExit}>
          <LogOut size={16} strokeWidth={2.5} /> Exit
        </button>
      </div>
    );
  }

  const engine = getTournamentEngine(tournament.format);
  const progress = getOverallProgress(tournament);
  const { courts, queue } = courtAssignmentService.refreshQueue(tournament);

  return (
    <div style={ds.screen}>
      <div style={ds.topBar}>
        <div>
          <div style={ds.kicker}>OPEN PLAY MANAGER — TOURNAMENT DISPLAY</div>
          <h1 style={ds.title}>{tournament.name}</h1>
        </div>
        <div style={ds.topBarActions}>
          <button style={ds.exitBtn} onClick={enterFullscreen}>
            <Maximize size={16} strokeWidth={2.5} /> Fullscreen
          </button>
          <button style={ds.exitBtn} onClick={onExit}>
            <LogOut size={16} strokeWidth={2.5} /> Exit
          </button>
        </div>
      </div>

      <div style={ds.overviewRow}>
        <div style={ds.overviewStat}>
          <span style={ds.overviewLabel}>Current Stage</span>
          <span style={ds.overviewValue}>{currentStage(tournament)}</span>
        </div>
        <div style={ds.overviewStat}>
          <span style={ds.overviewLabel}>Courts</span>
          <span style={ds.overviewValue}>{tournament.courts.length}</span>
        </div>
        <div style={ds.overviewStat}>
          <span style={ds.overviewLabel}>Matches Completed</span>
          <span style={ds.overviewValue}>{progress.completed}</span>
        </div>
        <div style={ds.overviewStat}>
          <span style={ds.overviewLabel}>Matches Remaining</span>
          <span style={ds.overviewValue}>{progress.remaining}</span>
        </div>
      </div>

      <div style={ds.panel}>
        <h2 style={ds.panelTitle}>Live Court Board</h2>
        <div style={ds.courtsGrid}>
          {courts.map((court) => (
            <div key={court.id} style={ds.courtCard(court.derivedStatus)}>
              <div style={ds.courtCardHead}>
                <span style={ds.courtName}>{court.name}</span>
                <span style={ds.courtStatusBadge(court.derivedStatus)}>{court.derivedStatus}</span>
              </div>
              {court.currentMatch ? (
                <>
                  <div style={ds.courtMatchup}>{matchupLabel(court.currentMatch)}</div>
                  <div style={ds.courtMatchStatus}>{STATUS_LABELS[court.currentMatch.status]}</div>
                </>
              ) : (
                <div style={ds.courtEmpty}>{court.status === "maintenance" ? "Under maintenance" : "No match assigned"}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={ds.panel}>
        <h2 style={ds.panelTitle}>Next Matches</h2>
        {queue.length === 0 ? (
          <p style={ds.emptyNote}>No matches waiting.</p>
        ) : (
          <div style={ds.queueGrid}>
            {queue.map((entry) => (
              <div key={entry.match.id} style={ds.queueCard}>
                <span style={ds.queueCourtTag}>Court TBD</span>
                <span style={ds.queueMatchup}>{matchupLabel(entry.match)}</span>
                <span style={ds.queueSource}>{entry.sourceLabel}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {tournament.bracket ? <BracketBoard bracket={tournament.bracket} /> : <PoolStandingsBoard tournament={tournament} engine={engine} />}
    </div>
  );
}

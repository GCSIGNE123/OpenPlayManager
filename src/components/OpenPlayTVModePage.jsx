import { useEffect, useRef, useState } from "react";
import { Maximize, LogOut } from "lucide-react";
import { STORAGE_PREFIX } from "../lib/constants.js";
import { reservedMatchupIds, sortByGames } from "../lib/utils.js";
import { buildStandingsRows } from "../lib/performanceRating.js";
import { tvStyles as ts, tvKeyframes, courtGridDimensions, courtSizeTier } from "../tvOpenPlayStyles.js";
import Avatar from "./Avatar.jsx";

// Open Play TV Mode ("Live Court Display") — see PROJECT.md's Open Play TV
// Mode section. A strictly read-only spectator screen for casting to a
// Smart TV/projector, sibling to TournamentDisplayView.jsx (which covers
// tournament sessions only — see that file's own sessionType gate) rather
// than a replacement for it. Never imports or calls a single save*/mutate
// function — court/standings/queue data all comes straight from the
// session record via the same window.storage.subscribeToKey realtime
// mechanism TournamentDisplayView already uses, so every panel updates
// within about a second of any change made anywhere else — no manual
// refresh, no polling loop, no duplicated match/standings/queue logic
// (courts/players/nextMatchups/queueIds are read directly off the live
// session; standings reuse buildStandingsRows; queue ordering reuses
// reservedMatchupIds/sortByGames — the exact same functions QueueList.jsx
// and StandingsView.jsx already call).
function deriveCourtStatus(court) {
  if (court.status === "finished") return "finished";
  if (court.status === "live" && !court.awaitingPair) return "live";
  return "waiting"; // open (no match assigned) or awaitingPair — both genuinely "waiting for play"
}

// Player Photos & Broadcast Experience — see PROJECT.md. The one shared
// "team of large circular photos + names" building block every panel on
// this page renders through (court cards, Next Match, the winner
// celebration) — reuses Avatar.jsx unchanged for the actual photo-or-
// initials rendering (never duplicated here), just at a much larger
// `size` than anywhere else in the app. `leading`: true/false dims the
// losing side once a score actually separates the two teams;
// `undefined` (no score yet) renders every player at full opacity.
function TeamPhotoRow({ ids, players, size, nameFontSize, leading }) {
  return (
    <div style={ts.playerPhotoRow}>
      {ids.map((id) => {
        const player = players[id];
        return (
          <div key={id} style={ts.playerCard(leading)}>
            <div style={ts.playerPhotoRing(leading)}>
              <Avatar player={player} size={size} />
            </div>
            <span style={ts.playerName(nameFontSize, size, leading)}>{player?.name ?? "TBD"}</span>
          </div>
        );
      })}
    </div>
  );
}

function TVHeader({ session, playerCount, activeCourtCount, totalCourtCount, now, onEnterFullscreen, onExit }) {
  return (
    <div style={ts.header}>
      <div>
        <h1 style={ts.headerTitle}>{session.venue || "Open Play"}</h1>
      </div>
      <div style={ts.headerActions}>
        <div style={ts.headerStat}>
          <span style={ts.headerStatLabel}>Time</span>
          <span style={ts.headerStatValue}>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <div style={ts.headerStat}>
          <span style={ts.headerStatLabel}>Players</span>
          <span style={ts.headerStatValue}>{playerCount}</span>
        </div>
        <div style={ts.headerStat}>
          <span style={ts.headerStatLabel}>Active Courts</span>
          <span style={ts.headerStatValue}>
            {activeCourtCount}/{totalCourtCount}
          </span>
        </div>
        <button style={ts.exitBtn} onClick={onEnterFullscreen}>
          <Maximize size={16} strokeWidth={2.5} /> Full Screen
        </button>
        <button style={ts.exitBtn} onClick={onExit}>
          <LogOut size={16} strokeWidth={2.5} /> Exit
        </button>
      </div>
    </div>
  );
}

// One live court card. Tracks its own previous score/status locally (a
// page-level diff against 20+ courts every render would be far more code
// for the same result) purely to know WHEN to play an animation — the
// score/status values themselves are still 100% derived from the live
// court prop, nothing here is a separate source of truth.
function CourtCard({ court, players, columns }) {
  const status = deriveCourtStatus(court);
  const prevRef = useRef({ scoreA: court.scoreA, scoreB: court.scoreB, status });
  const [pulseSide, setPulseSide] = useState(null); // "A" | "B" | null
  const [showWinner, setShowWinner] = useState(false);

  useEffect(() => {
    const prev = prevRef.current;
    if (court.scoreA !== prev.scoreA) {
      setPulseSide("A");
      const t = setTimeout(() => setPulseSide(null), 600);
      prevRef.current = { ...prevRef.current, scoreA: court.scoreA };
      return () => clearTimeout(t);
    }
    if (court.scoreB !== prev.scoreB) {
      setPulseSide("B");
      const t = setTimeout(() => setPulseSide(null), 600);
      prevRef.current = { ...prevRef.current, scoreB: court.scoreB };
      return () => clearTimeout(t);
    }
  }, [court.scoreA, court.scoreB]);

  useEffect(() => {
    const prev = prevRef.current;
    if (status === "finished" && prev.status !== "finished") {
      setShowWinner(true);
      const t = setTimeout(() => setShowWinner(false), 2000);
      prevRef.current = { ...prevRef.current, status };
      return () => clearTimeout(t);
    }
    prevRef.current = { ...prevRef.current, status };
  }, [status]);

  const hasMatch = court.teamA.length > 0 || court.teamB.length > 0;
  const scoreKnown = court.scoreA !== court.scoreB;
  const leadingA = scoreKnown ? court.scoreA > court.scoreB : undefined;
  const leadingB = scoreKnown ? court.scoreB > court.scoreA : undefined;
  const winningIds = leadingA ? court.teamA : leadingB ? court.teamB : [];
  const tier = courtSizeTier(columns);

  return (
    <div style={ts.courtCard(status, columns)}>
      {showWinner && winningIds.length > 0 && (
        <div style={ts.winnerOverlay} className="tv-winner-pop">
          <span style={ts.winnerText}>🏆 WINNERS</span>
          <TeamPhotoRow ids={winningIds} players={players} size={tier.photo * 0.85} nameFontSize={tier.team} />
        </div>
      )}
      <div style={ts.courtHead}>
        <span style={ts.courtName(columns)}>Court {court.number}</span>
        <span style={ts.statusBadge(status, columns)}>{status.toUpperCase()}</span>
      </div>
      {hasMatch ? (
        <div style={ts.matchupBlock}>
          <TeamPhotoRow ids={court.teamA} players={players} size={tier.photo} nameFontSize={tier.team} leading={leadingA} />
          <div style={ts.scoreRow}>
            <span style={ts.scoreValue(columns)} className={pulseSide === "A" ? "tv-score-pulse tv-score-highlight" : ""}>
              {court.scoreA}
            </span>
            <span style={ts.vsLabel(columns)}>–</span>
            <span style={ts.scoreValue(columns)} className={pulseSide === "B" ? "tv-score-pulse tv-score-highlight" : ""}>
              {court.scoreB}
            </span>
          </div>
          <TeamPhotoRow ids={court.teamB} players={players} size={tier.photo} nameFontSize={tier.team} leading={leadingB} />
        </div>
      ) : (
        <div style={ts.matchupBlock}>
          <span style={ts.emptyCourtText(columns)}>{court.status === "maintenance" ? "Under maintenance" : "Court open"}</span>
        </div>
      )}
    </div>
  );
}

function CourtGrid({ courts, players }) {
  const { columns, rows } = courtGridDimensions(courts.length);
  return (
    <div style={ts.courtsGrid(columns, rows)}>
      {courts.map((court) => (
        <CourtCard key={court.number} court={court} players={players} columns={columns} />
      ))}
    </div>
  );
}

// 🥇🥈🥉 for the top three, animated via CSS transition on transform when a
// row's position in the sorted list changes — buildStandingsRows already
// returns rows in rank order, so a rank change is just this array
// reordering on the next live update; the transition on standingsRow's own
// `transform`/`background` (see tvOpenPlayStyles.js) is what makes that
// reorder read as a smooth shift rather than an instant jump.
const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

function StandingsPanel({ players }) {
  const rows = buildStandingsRows(players);
  return (
    <div style={ts.panelCard}>
      <h2 style={ts.panelTitle}>Standings</h2>
      {rows.length === 0 ? (
        <p style={ts.emptyNote}>Standings fill in as matches finish.</p>
      ) : (
        <div>
          <div style={ts.standingsHeadRow}>
            <span>#</span>
            <span />
            <span>Player</span>
            <span>W</span>
            <span>GP</span>
            <span>+/-</span>
          </div>
          {rows.map((row, i) => {
            const rank = i + 1;
            return (
              <div key={row.id} style={ts.standingsRow(rank)} className="tv-rank-pop">
                <span style={ts.standingsRank}>{MEDALS[rank] ?? rank}</span>
                <div style={ts.standingsPhotoRing(rank)}>
                  <Avatar player={row} size={40} />
                </div>
                <span style={ts.standingsName}>{row.name}</span>
                <span style={ts.standingsStat}>{row.wins}</span>
                <span style={ts.standingsStat}>{row.gp}</span>
                <span style={ts.standingsStat}>{row.diff > 0 ? `+${row.diff}` : row.diff}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NextMatchCard({ match, players }) {
  return (
    <div style={ts.panelCard}>
      <h2 style={ts.panelTitle}>Next Match</h2>
      {!match ? (
        <p style={ts.emptyNote}>No matchup queued yet.</p>
      ) : (
        <div>
          <div style={ts.nextMatchCourt}>Court TBD</div>
          <TeamPhotoRow ids={match.teamA} players={players} size={56} nameFontSize="clamp(11px, 0.95vw, 15px)" />
          <div style={ts.nextMatchVs}>VS</div>
          <TeamPhotoRow ids={match.teamB} players={players} size={56} nameFontSize="clamp(11px, 0.95vw, 15px)" />
        </div>
      )}
    </div>
  );
}

// Reuses reservedMatchupIds/sortByGames verbatim — the exact same "who's
// genuinely still waiting, ordered by fewest games played" computation
// QueueList.jsx already does for the organizer's own Live Board.
function QueuePanel({ queueIds, players, nextMatchups }) {
  const reserved = reservedMatchupIds(nextMatchups);
  const waitingIds = sortByGames(
    queueIds.filter((id) => !reserved.has(id)),
    players
  );
  return (
    <div style={ts.panelCard}>
      <h2 style={ts.panelTitle}>Waiting Queue</h2>
      {waitingIds.length === 0 ? (
        <p style={ts.emptyNote}>No one waiting.</p>
      ) : (
        waitingIds.map((id, i) => (
          <div key={id} style={ts.queueRow}>
            <span style={ts.queuePosition}>{i + 1}.</span>
            <Avatar player={players[id]} size={32} />
            <span>{players[id]?.name}</span>
          </div>
        ))
      )}
    </div>
  );
}

export default function OpenPlayTVModePage({ sessionCode, onExit }) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());

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

  // Header's "Current Time" — the one piece of this screen not driven by
  // the live session subscription, ticked locally once a second.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const enterFullscreen = () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  if (error) {
    return (
      <div style={ts.screen}>
        <div style={ts.centeredMessage}>{error}</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={ts.screen}>
        <div style={ts.centeredMessage}>Loading…</div>
      </div>
    );
  }

  if (session.sessionType === "tournament") {
    return (
      <div style={ts.screen}>
        <div style={ts.centeredMessage}>This is a tournament session — use TV Display Mode from the Tournament dashboard instead.</div>
        <button style={ts.exitBtn} onClick={onExit}>
          <LogOut size={16} strokeWidth={2.5} /> Exit
        </button>
      </div>
    );
  }

  const playerCount = Object.values(session.players).filter((p) => p.checkedIn).length;
  const activeCourtCount = session.courts.filter((c) => c.status === "live" || c.status === "finished").length;

  return (
    <div style={ts.screen}>
      <style>{tvKeyframes}</style>
      <TVHeader
        session={session}
        playerCount={playerCount}
        activeCourtCount={activeCourtCount}
        totalCourtCount={session.courts.length}
        now={now}
        onEnterFullscreen={enterFullscreen}
        onExit={onExit}
      />
      <div style={ts.body}>
        <div style={ts.courtsPanel}>
          <CourtGrid courts={session.courts} players={session.players} />
        </div>
        <div style={ts.sidePanel}>
          <StandingsPanel players={session.players} />
          <NextMatchCard match={session.nextMatchups?.[0] ?? null} players={session.players} />
          <QueuePanel queueIds={session.queueIds} players={session.players} nextMatchups={session.nextMatchups || []} />
        </div>
      </div>
    </div>
  );
}

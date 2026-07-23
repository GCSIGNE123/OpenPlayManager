import { useEffect, useRef, useState } from "react";
import { Maximize, LogOut } from "lucide-react";
import { STORAGE_PREFIX } from "../lib/constants.js";
import { fetchVenue } from "../lib/venueModel.js";
import { buildStandingsRows } from "../lib/performanceRating.js";
import { APP_NAME } from "../lib/brand.js";
import { tvStyles as ts, tvKeyframes, courtGridDimensions, courtSizeTier, upNextSizeTier, TV_LAYOUT_PRESETS } from "../tvOpenPlayStyles.js";
import Avatar from "./Avatar.jsx";

// Open Play TV Mode 2.0 (Broadcast Display) — see PROJECT.md's TV Mode 2.0
// section. A strictly read-only spectator screen for casting to a Smart
// TV/projector, sibling to TournamentDisplayView.jsx (tournament sessions
// only). Never imports or calls a single save*/mutate function — all data
// comes straight off the live session record via the same
// window.storage.subscribeToKey realtime mechanism TournamentDisplayView
// already uses, so every panel updates within about a second of any
// change made anywhere else — no manual refresh, no polling loop, no
// duplicated match/standings logic (standings reuse buildStandingsRows,
// the exact function StandingsView.jsx already calls).
//
// Three fixed columns — Live Courts 45% / Up Next 35% / Standings 20%
// (TV Mode Layout Optimization, Sprint 3.1 — tuned from TV Mode 2.0's
// original 40/40/20 after real-world field-testing showed players spend
// far more time looking for "who's playing now/next" than at standings).
// The read-only architecture and animation mechanisms (score pulse,
// winner overlay) are reused unchanged.
function deriveCourtStatus(court) {
  if (court.status === "finished") return "finished";
  if (court.status === "live" && !court.awaitingPair) return "live";
  return "waiting"; // open (no match assigned) or awaitingPair
}

// Player Photos & Broadcast Experience — see PROJECT.md. The shared "team
// of large circular photos + names" building block every panel renders
// through — reuses Avatar.jsx unchanged, just at a much larger `size`
// than anywhere else in the app.
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

// TV Mode Layout Optimization (Sprint 3.1) — one team, one line: a small
// overlapping photo pair + slash-joined names ("John / Mike"), replacing
// the old stacked "photo above name, per player" block in Up Next cards.
// Reuses Avatar.jsx unchanged, just smaller and laid out inline — this is
// the Up Next column's own compact team display, deliberately NOT reused
// by the Live Courts column (those cards still want full per-player
// photos+names, per the spec's own unchanged Live Courts content list).
function TeamInline({ ids, players, photoSize, fontSize }) {
  const names = ids.map((id) => players[id]?.name ?? "TBD").join(" / ");
  return (
    <div style={ts.teamInlineRow}>
      <div style={ts.teamInlinePhotos}>
        {ids.map((id, i) => (
          <div key={id} style={ts.teamInlinePhotoWrap(i)}>
            <Avatar player={players[id]} size={photoSize} />
          </div>
        ))}
      </div>
      <span style={ts.teamInlineNames(fontSize)}>{names}</span>
    </div>
  );
}

function EmptyState({ title, body }) {
  return (
    <div style={ts.emptyState}>
      <span style={ts.emptyStateTitle}>{title}</span>
      <span style={ts.emptyStateBody}>{body}</span>
    </div>
  );
}

// Header — Session Name is the large PRIMARY element (per explicit
// direction); Venue Name + a reserved logo slot render smaller/secondary
// above it. Session Progress is derived purely from existing fields
// (average completed games among currently-active players ÷
// expectedGamesPerPlayer, the same organizer-configured target
// Progressive Skill Rotation's own phase calc already reads) — no new
// session field added for this.
function TVHeader({ session, venue, playerCount, activeCourtCount, totalCourtCount, now, sessionProgressPct, onEnterFullscreen, onExit }) {
  return (
    <div style={ts.header}>
      <div>
        <div style={ts.headerVenueRow}>
          {venue?.logo ? (
            <img src={venue.logo} alt="" style={ts.headerVenueLogo} />
          ) : (
            <div style={ts.headerVenueLogoPlaceholder} />
          )}
          <span style={ts.headerVenueName}>🏓 {venue?.name || APP_NAME}</span>
        </div>
        <h1 style={ts.headerTitle}>{session.venue || "Open Play"}</h1>
      </div>
      <div style={ts.headerActions}>
        <div style={ts.headerStat}>
          <span style={ts.headerStatLabel}>Time</span>
          <span style={ts.headerStatValue}>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        {sessionProgressPct != null && (
          <div style={ts.progressStat}>
            <span style={ts.headerStatLabel}>Session Progress</span>
            <span style={ts.headerStatValue}>{sessionProgressPct}%</span>
            <div style={ts.progressBarTrack}>
              <div style={ts.progressBarFill(sessionProgressPct)} />
            </div>
          </div>
        )}
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

// One live match card. Tracks its own previous score/status locally purely
// to know WHEN to play an animation — the values themselves are still
// 100% derived from the live court prop, nothing here is a separate
// source of truth.
function CourtCard({ court, players, columns }) {
  const status = deriveCourtStatus(court);
  const prevRef = useRef({ scoreA: court.scoreA, scoreB: court.scoreB, status });
  const [pulseSide, setPulseSide] = useState(null);
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
    </div>
  );
}

// Left column, 45% — Live Courts (renamed from "Live Matches", Sprint
// 3.1). Only courts CURRENTLY live/finished render as cards (no
// empty-court placeholders, per explicit direction); an empty state
// covers "nothing live right now."
function LiveCourtsColumn({ courts, players }) {
  const liveCourts = courts.filter((c) => {
    const status = deriveCourtStatus(c);
    return status === "live" || status === "finished";
  });
  const { columns, rows } = courtGridDimensions(liveCourts.length);
  return (
    <div style={ts.column}>
      <h2 style={ts.columnTitle}>Live Courts</h2>
      {liveCourts.length === 0 ? (
        <EmptyState title="No Live Courts" body="Waiting for the next game…" />
      ) : (
        <div style={ts.courtsGrid(columns, rows)}>
          {liveCourts.map((court) => (
            <CourtCard key={court.number} court={court} players={players} columns={columns} />
          ))}
        </div>
      )}
    </div>
  );
}

// Center column, 35% — Up Next. Up to 4 upcoming matchups; the first
// gets an accent border/glow + "⭐ NEXT ON COURT" badge so waiting
// players instantly recognize who's up. Cards compressed (Sprint 3.1,
// real-world field-testing feedback) to a compact position/badge header
// row + one line per team (TeamInline — overlapping photos + "John /
// Mike"), replacing the old stacked-photo-block cards, so 4-5 fit on a
// 1080p display without scrolling. Court Assignment only renders once a
// matchup actually carries one — upcoming matchups don't have a
// pre-assigned court in this app today, so that line simply never
// appears yet (no "Court TBD" clutter), but the code path is ready for
// when Manual Court Assignment or a future scheduling feature attaches one.
function UpNextColumn({ nextMatchups, players }) {
  const upcoming = (nextMatchups || []).slice(0, 4);
  return (
    <div style={ts.column}>
      <h2 style={ts.columnTitle}>Up Next</h2>
      {upcoming.length === 0 ? (
        <EmptyState title="No Upcoming Matches" body="Waiting for players…" />
      ) : (
        <div style={ts.upNextList}>
          {upcoming.map((match, i) => {
            const isNext = i === 0;
            const tier = upNextSizeTier(upcoming.length, isNext);
            return (
              <div key={match.id} style={ts.upNextCard(isNext)} className={isNext ? "tv-next-glow" : ""}>
                <div style={ts.upNextHeadRow}>
                  <span style={ts.upNextPosition}>#{i + 1}</span>
                  {isNext && <span style={ts.nextBadge}>⭐ NEXT ON COURT</span>}
                  {match.court && <span style={ts.upNextCourt}>Court {match.court}</span>}
                </div>
                <TeamInline ids={match.teamA} players={players} photoSize={tier.photo} fontSize={tier.team} />
                <span style={ts.upNextVs}>vs</span>
                <TeamInline ids={match.teamB} players={players} photoSize={tier.photo} fontSize={tier.team} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Right column, 20% — Standings. Simplified further in Sprint 3.1 (Rank,
// Photo, Name, SPR only — the W-L readout dropped) — see PROJECT.md:
// "avoid displaying too many statistics... this panel is intended to
// provide awareness, not detailed analytics." "SPR" (Session Performance
// Rating) is this app's existing session-only Performance Rating
// (lib/performanceRating.js), just labeled SPR rather than "RTG".
const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

function StandingsColumn({ players }) {
  const rows = buildStandingsRows(players);
  return (
    <div style={ts.column}>
      <h2 style={ts.columnTitle}>Standings</h2>
      {rows.length === 0 ? (
        <EmptyState title="Standings" body="Standings will appear after the first completed match." />
      ) : (
        <div style={ts.standingsList}>
          {rows.map((row, i) => {
            const rank = i + 1;
            const spr = row.performance.rating ?? "—";
            return (
              <div key={row.id} style={ts.standingsRow(rank)} className="tv-rank-pop">
                <span style={ts.standingsRank}>{MEDALS[rank] ?? rank}</span>
                <div style={ts.standingsPhotoRing(rank)}>
                  <Avatar player={row} size={30} />
                </div>
                <span style={ts.standingsName}>{row.name}</span>
                <span style={ts.standingsCompactStat}>{spr} SPR</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function OpenPlayTVModePage({ sessionCode, onExit }) {
  const [session, setSession] = useState(null);
  const [venue, setVenue] = useState(null);
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

  // Reserved venue-branding slot — see Future Compatibility in
  // PROJECT.md. A session only optionally links to a Venue record
  // (session.venueId, from the Multi-Venue Workspace sprint); fetched
  // once per session/venueId change rather than subscribed live, since
  // venue name/logo essentially never change mid-session.
  useEffect(() => {
    if (!session?.venueId) {
      setVenue(null);
      return;
    }
    let cancelled = false;
    fetchVenue(session.venueId).then((v) => {
      if (!cancelled) setVenue(v);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.venueId]);

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

  // Players Checked In — excludes checked-out players (Player Checkout
  // During Session), consistent with that feature's own "no longer part
  // of active participation" meaning.
  const activePlayers = Object.values(session.players).filter((p) => p.checkedIn && p.status !== "CHECKED_OUT");
  const playerCount = activePlayers.length;
  const activeCourtCount = session.courts.filter((c) => c.status === "live" || c.status === "finished").length;

  // Session Progress — average completed games among active players
  // divided by the organizer's own Expected Games per Player target
  // (state.expectedGamesPerPlayer, already set at Create Session/editable
  // via Session Settings — the "current session configuration" this
  // derives from). null (hidden entirely) when there's no target or no
  // active players yet, rather than showing a misleading 0%.
  const expectedGames = session.expectedGamesPerPlayer;
  const sessionProgressPct =
    expectedGames > 0 && playerCount > 0
      ? Math.min(100, Math.round((activePlayers.reduce((sum, p) => sum + (p.games || 0), 0) / playerCount / expectedGames) * 100))
      : null;

  return (
    <div style={ts.screen}>
      <style>{tvKeyframes}</style>
      <TVHeader
        session={session}
        venue={venue}
        playerCount={playerCount}
        activeCourtCount={activeCourtCount}
        totalCourtCount={session.courts.length}
        now={now}
        sessionProgressPct={sessionProgressPct}
        onEnterFullscreen={enterFullscreen}
        onExit={onExit}
      />
      {/* Adaptive Layout — see PROJECT.md's TV Mode Layout Optimization
          section. Hardcoded to TV_LAYOUT_PRESETS.standard this sprint
          (explicit direction: prepare the seam, don't enable dynamic
          switching yet) — enabling it later is exactly
          selectLayoutPreset(activeCourtCount) in place of this constant,
          nothing else changes. */}
      <div style={ts.body(TV_LAYOUT_PRESETS.standard)}>
        <LiveCourtsColumn courts={session.courts} players={session.players} />
        <UpNextColumn nextMatchups={session.nextMatchups} players={session.players} />
        <StandingsColumn players={session.players} />
      </div>
      <div style={ts.footer} />
    </div>
  );
}

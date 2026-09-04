import { useState, useEffect, useCallback, useRef } from "react";
import { Copy, LogOut, Users, Tv } from "lucide-react";
import { styles, fontImport } from "./styles.js";
import { APP_NAME, FOOTER_TEXT } from "./lib/brand.js";
import { ACCESS_PREFIX, ACTIVE_SESSION_STORAGE_KEY, ADMIN_PIN, DEV_ACCESS_CODE, ROTATION_MODES, SCORER_PIN, SESSION_TYPES, STORAGE_PREFIX, TOURNAMENT_FORMATS, defaultState, emptyCourt, resetCourtForNextMatch } from "./lib/constants.js";
import { resolveDatabaseCheckIn, emptyPlayerRecord, savePlayerRecord, fetchPlayer } from "./lib/playerDatabase.js";
import {
  findUniqueAccessCode,
  findUniqueSessionCode,
  getRotationEngine,
  recordRotationHistory,
  refreshNextMatchups,
  regenerateNextMatchups,
  dissolveMatchupIfReserved,
  manuallyReservedIds,
  maxUpcomingMatchups,
  getPlayerQueueStatus,
  changePlayerSkill as changePlayerSkillAction,
  setPreCheckInSkill as setPreCheckInSkillAction,
  renameCourt as renameCourtAction,
  courtDisplayName,
  getRegisteredNotHere,
  nextLastMatchEndAt,
  uid,
  resizeImageToAvatar,
  computeLatecomerPriorityPreview,
} from "./lib/utils.js";
import {
  holdPlayer as holdPlayerAction,
  resumePlayer as resumePlayerAction,
  skipPlayer as skipPlayerAction,
  holdMatch as holdMatchAction,
  resumeMatch as resumeMatchAction,
  cancelMatch as cancelMatchAction,
  cancelLiveMatch as cancelLiveMatchAction,
  setFixedPartner as setFixedPartnerAction,
  clearFixedPartner as clearFixedPartnerAction,
  regenerate as regenerateQueue,
  noteDissolvedHeldMatchups,
  getPlayersNeedingHeldReminder,
  markHeldReminderShown,
  setPlayerPayment as setPlayerPaymentAction,
  derivePaymentStats,
  requestRemoveCourt as requestRemoveCourtAction,
  applyPendingCourtRemovals,
  editMatchHistoryScore,
} from "./lib/queueManagement.js";
import {
  selectNextDispatchableMatchup,
  dispatchAvailableCourts,
  confirmCourtLive as confirmCourtLiveAction,
  logDispatchEvent,
} from "./lib/courtDispatch.js";
import { buildAnnouncementText, buildNextMatchAnnouncementText, speakAnnouncement, emitDispatchEvent, DISPATCH_EVENTS } from "./lib/announcer.js";
import { resolveWinnerPoolMatch, isPoolingRotation, getPairPartnerIndex } from "./lib/winnerPoolRound.js";
import { progressiveSkillPhaseFor } from "./lib/progressiveSkillPhase.js";
import { buildAndSaveRoundRobinTournament, buildAndSaveDoubleEliminationTournament } from "./lib/tournament.js";
import { applyWaitingTimeTracking, computeSessionAnalyticsReport } from "./lib/sessionAnalytics.js";
import { saveSessionReport } from "./lib/sessionReportModel.js";
import { recordSessionCreated, recordSessionEnded } from "./lib/sessionIndexModel.js";
import { RatingEngine } from "./engines/RatingEngine.js";
import { fetchAllCourts as fetchAllClubCourts } from "./lib/courtDatabase.js";
import { fetchAllBookings } from "./lib/bookingModel.js";
import { getCourtsReservedNow } from "./engines/AvailabilityService.js";
import { AchievementService } from "./engines/AchievementService.js";
import { useActiveVenue } from "./context/ActiveVenueContext.jsx";
import LandingScreen from "./components/LandingScreen.jsx";
import AccessScreen from "./components/AccessScreen.jsx";
import AdminLogin from "./components/AdminLogin.jsx";
import AdminPanel from "./components/AdminPanel.jsx";
import CreateSessionScreen from "./components/CreateSessionScreen.jsx";
import BoardView from "./components/BoardView.jsx";
import CheckinView from "./components/CheckinView.jsx";
import ScorerLogin from "./components/ScorerLogin.jsx";
import ScorerView from "./components/ScorerView.jsx";
import StandingsView from "./components/StandingsView.jsx";
import HistoryView from "./components/HistoryView.jsx";
import SessionAnalyticsReport from "./components/SessionAnalyticsReport.jsx";
import OpenPlaySessionHistoryScreen from "./components/OpenPlaySessionHistoryScreen.jsx";
import PaymentView from "./components/PaymentView.jsx";
import TournamentDashboardView from "./components/TournamentDashboardView.jsx";
import TournamentDisplayView from "./components/TournamentDisplayView.jsx";
import OpenPlayTVModePage from "./components/OpenPlayTVModePage.jsx";
import TournamentTemplatesScreen from "./components/TournamentTemplatesScreen.jsx";
import DeveloperView from "./components/DeveloperView.jsx";
import PlayerPortalScreen from "./components/PlayerPortalScreen.jsx";
import UserManagementScreen from "./components/UserManagementScreen.jsx";
import LeagueManagerScreen from "./components/LeagueManagerScreen.jsx";
import PlayerManagementScreen from "./components/PlayerManagementScreen.jsx";
import VenueManagementScreen from "./components/VenueManagementScreen.jsx";
import CourtBookingScreen from "./components/CourtBookingScreen.jsx";
import RatingsScreen from "./components/RatingsScreen.jsx";
import TournamentHistoryScreen from "./components/TournamentHistoryScreen.jsx";

const ratingEngine = new RatingEngine();
const achievementService = new AchievementService();

// Club Rating & Ranking Engine's Open Play hook — see PROJECT.md. Fire-
// and-forget (not awaited by endMatch, which isn't async) so a rating-side
// hiccup can never block or delay ending a live match; ratingEngine
// itself silently skips any player without a Player Database id (a
// walk-in), per its own documented identity constraint.
function rateOpenPlayMatch(teamA, teamB, aWon, bWon) {
  if (!aWon && !bWon) return; // a tie has no winner to rate
  const winnerIds = aWon ? teamA : teamB;
  const loserIds = aWon ? teamB : teamA;
  ratingEngine
    .processMatchResult({ winnerIds, loserIds, matchId: uid(), source: "openPlay" })
    .then((rated) => {
      for (const { playerId, result, rating } of rated) {
        if (result === "win") achievementService.awardAchievements(playerId, { totalWins: rating.wins });
      }
    })
    .catch(() => {}); // best-effort — never surfaces an error into the live match flow
}

export default function PickleballOpenPlay() {
  const { activeVenueId } = useActiveVenue();
  const [screen, setScreen] = useState("landing"); // landing | access | create | admin | developer | app | display | templates | portal | users | leagues | playerManagement | venueManagement | courtBooking | ratings
  const [sessionCode, setSessionCode] = useState(null);
  // Tournament Display Mode ("TV Mode") — separate from `sessionCode`
  // above so a second device can land directly on Display Mode via a
  // `?display=CODE` URL without ever going through Create/Join at all.
  // When launched from within an already-loaded session instead (the "TV
  // Display" header button), this is just set to the same sessionCode.
  const [displayCode, setDisplayCode] = useState(null);

  // A `?display=CODE` URL param jumps straight into read-only Display Mode
  // — the only way to get a second browser (the actual TV/projector) onto
  // a session without typing a join code into the normal landing flow.
  // Still entirely local: no new sharing/QR infrastructure, just reading
  // this tab's own URL once on mount.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("display");
    if (code) {
      setDisplayCode(code.trim().toUpperCase());
      setScreen("display");
    }
  }, []);

  // Open Play TV Mode — see PROJECT.md. Same "read the URL once on mount"
  // precedent as `?display=CODE` above, extended two ways: a matching
  // `?openPlayDisplay=CODE` query param, and a real path route
  // (`/openplay/:sessionCode/tv`) so a Smart TV/projector/mini PC can be
  // pointed at a direct, bookmarkable URL without going through query
  // params at all. This app has no client-side router (no react-router
  // dependency) — the path is parsed by hand here with a plain regex, the
  // same lightweight approach `URLSearchParams` already uses for query
  // params; see vercel.json for the SPA-fallback rewrite that makes a cold
  // (non-SPA-navigated) hit to this path actually reach this code instead
  // of 404ing.
  useEffect(() => {
    const queryCode = new URLSearchParams(window.location.search).get("openPlayDisplay");
    const pathMatch = window.location.pathname.match(/^\/openplay\/([^/]+)\/tv\/?$/i);
    const code = queryCode || (pathMatch ? pathMatch[1] : null);
    if (code) {
      setDisplayCode(code.trim().toUpperCase());
      setScreen("openPlayDisplay");
    }
  }, []);

  // `?portal=CODE` mirrors the `?display=CODE` precedent above — a player
  // who's been sent a direct link lands straight in the Player Portal's
  // session-code-already-filled state, skipping the landing page's manual
  // entry box (see PlayerPortalScreen's `initialCode` prop).
  const [portalCode, setPortalCode] = useState(null);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("portal");
    if (code) {
      setPortalCode(code.trim().toUpperCase());
      setScreen("portal");
    }
  }, []);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);

  const [accessCodeInput, setAccessCodeInput] = useState("");
  const [accessError, setAccessError] = useState("");
  const [accessChecking, setAccessChecking] = useState(false);
  const [validatedAccessCode, setValidatedAccessCode] = useState(null);

  const [adminAuthed, setAdminAuthed] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [adminPinError, setAdminPinError] = useState("");
  const [recentCodes, setRecentCodes] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [lookupInput, setLookupInput] = useState("");
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupBusy, setLookupBusy] = useState(false);

  const [state, setState] = useState(defaultState);
  const [loaded, setLoaded] = useState(false);

  // Session Persistence Across Refresh — see PROJECT.md/FEATURES.md. On
  // mount, restores whatever session was open on this device before an F5/
  // refresh (including a mobile pull-to-refresh, or the browser tab being
  // backgrounded/killed by the OS and reopened later), instead of dropping
  // back to the landing page and forcing the facilitator to re-type the
  // join code mid-session. Skipped whenever any of the URL-driven screens
  // above (?display=, ?openPlayDisplay=, ?portal=, the /openplay/:code/tv
  // path) already claimed this load — those are explicit navigations and
  // always take priority. Reads localStorage (ACTIVE_SESSION_STORAGE_KEY —
  // see its own comment in lib/constants.js for why this is localStorage,
  // not sessionStorage) directly rather than a state variable since this
  // runs once, before any state depending on it exists yet.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hasUrlOverride =
      params.get("display") || params.get("openPlayDisplay") || params.get("portal") ||
      window.location.pathname.match(/^\/openplay\/([^/]+)\/tv\/?$/i);
    if (hasUrlOverride) return;
    const savedCode = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    if (!savedCode) return;
    (async () => {
      try {
        const res = await window.storage.get(`${STORAGE_PREFIX}${savedCode}`, true);
        if (res && res.value) {
          setState(JSON.parse(res.value));
          setSessionCode(savedCode);
          setLoaded(true);
          setScreen("app");
        } else {
          localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
        }
      } catch (e) {
        localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      }
    })();
  }, []);

  // Keeps localStorage in sync with whichever session is actually open —
  // one place, rather than writing it at every join/create call site.
  // leaveSession (below) is the one place that clears it, so ending a
  // session or explicitly switching sessions doesn't leave a stale code
  // behind for the next refresh to (harmlessly, since a deleted session
  // just fails the fetch above and clears itself) try to resume.
  useEffect(() => {
    if (screen === "app" && sessionCode) {
      localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, sessionCode);
    }
  }, [screen, sessionCode]);

  // Session Analytics Engine (Sprint 4A / V1) — set by endSession below,
  // before anything about the session is torn down. Non-null renders the
  // full-screen report in place of the app's normal view; the actual
  // teardown (delete + leaveSession) only happens once the facilitator
  // confirms from the report, see confirmEndSession/cancelEndSession.
  const [sessionReport, setSessionReport] = useState(null);

  // Court Booking & Reservations integration — see PROJECT.md and
  // fillCourt/fillAllCourts below. Polled (not a live realtime
  // subscription) every 30s while an Open Play session is actually
  // loaded — reservations changing mid-session is rare enough that a
  // light poll is the right amount of complexity for this integration, a
  // deliberate simplification over the full subscribeToKey treatment
  // every session's OWN data gets. An empty Set (the default) makes every
  // isCourtReserved() check a no-op, so a club that's never set up Court
  // Booking sees zero behavior change.
  const [reservedCourtNumbers, setReservedCourtNumbers] = useState(new Set());
  const isCourtReserved = useCallback(
    (courtNumber) => reservedCourtNumbers.has(courtNumber),
    [reservedCourtNumbers]
  );
  useEffect(() => {
    if (screen !== "app" || !loaded || state.sessionType === "tournament") return undefined;
    let cancelled = false;
    const refresh = () => {
      Promise.all([fetchAllClubCourts(), fetchAllBookings()])
        .then(([clubCourts, bookings]) => {
          if (!cancelled) setReservedCourtNumbers(getCourtsReservedNow(clubCourts, bookings));
        })
        .catch(() => {}); // Court Booking data being unreachable shouldn't break Open Play
    };
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [screen, loaded, state.sessionType]);
  const [view, setView] = useState("board"); // board | checkin | standings | scorer | payment
  const [scorerAuthed, setScorerAuthed] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  // Dedicated Payment tab — see PROJECT.md/FEATURES.md. Protected with the
  // exact same SCORER_PIN as the Scorer tab, but its OWN authed state — a
  // facilitator who's already unlocked Scorer still has to unlock Payment
  // separately, same security-boundary precedent as Scorer PIN auth itself
  // (deliberately not persisted across a refresh either).
  const [paymentAuthed, setPaymentAuthed] = useState(false);
  const [paymentPin, setPaymentPin] = useState("");
  const [paymentPinError, setPaymentPinError] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [skillInput, setSkillInput] = useState("beginner");
  const [photoDataUrl, setPhotoDataUrl] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [checkinMsg, setCheckinMsg] = useState("");
  const [skillChangeMsg, setSkillChangeMsg] = useState(""); // Adaptive Skill Rotation — facilitator toast for promotion/relegation/manual override, see endMatch/changePlayerSkill
  const [queueMsg, setQueueMsg] = useState(""); // Smart Queue Management — facilitator toast for Skip Player, see skipPlayer below
  // Scorer layout — Queue Activity Log collapse state. Deliberately lifted
  // up here (not local to ScorerView) since ScorerView unmounts/remounts
  // every time the facilitator switches tabs and back (view !== "scorer"
  // renders something else entirely) — a local useState would silently
  // reset to collapsed on every tab switch, breaking "remember the choice
  // for the remainder of the session." Living here means it survives tab
  // switches for as long as this app instance stays open, and naturally
  // resets to the default (collapsed) on a real page reload/new session —
  // never persisted to the session record itself, since a collapse
  // preference is a per-device UI choice, not something to sync to every
  // other connected scorer device.
  const [queueActivityLogExpanded, setQueueActivityLogExpanded] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [generatingSchedule, setGeneratingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  // one-shot, this-device-only undo for "Regenerate matchups" — not synced
  // to Supabase, so it only makes sense as a quick "oops" for whoever just
  // clicked Regenerate, not a durable multi-device feature. Cleared by any
  // action that could make restoring it unsafe (deploying a matchup to a
  // court, editing a matchup, another regenerate, skipping/removing a
  // player) so it can never resurrect a player who's since moved on.
  const [regenerateSnapshot, setRegenerateSnapshot] = useState(null);
  // one-shot, this-device-only undo for the most recently ended match — the
  // full app state from right before that endMatch call, so restoring it
  // puts back the court (still live, original teams/score), the players'
  // stats and rotation history, matchHistory, and queueIds all at once.
  // Same "unsafe to keep around" invalidation rules as regenerateSnapshot —
  // see clearOneShotSnapshots — so it can never resurrect a round whose
  // players have since moved on to something else.
  const [lastRoundSnapshot, setLastRoundSnapshot] = useState(null);
  // one-shot, this-device-only undo for the most recently applied Latecomer
  // Priority substitution — see applyLatecomerPriority/undoLatecomerPriority
  // below. Same "quick oops" precedent as regenerateSnapshot/lastRoundSnapshot:
  // captures state.nextMatchups from right before the substitution, restored
  // verbatim on Undo rather than by re-running any rotation engine (which
  // could produce a different matchup). Invalidated by the same
  // clearOneShotSnapshots every other mutating action already calls, plus
  // its own self-healing effect once the substituted matchup dispatches.
  const [latecomerPrioritySnapshot, setLatecomerPrioritySnapshot] = useState(null);
  const clearOneShotSnapshots = () => {
    setRegenerateSnapshot(null);
    setLastRoundSnapshot(null);
    setLatecomerPrioritySnapshot(null);
  };
  const stateRef = useRef(state);
  stateRef.current = state;
  // Smart Court Dispatch — breaks the circular dependency between save()
  // (which needs to trigger scheduling once a dispatch has been
  // persisted) and scheduleAnnouncements (which needs to call save() again
  // later, to log the announcement result / confirm the court live). A
  // ref avoids adding a function to save()'s own useCallback dependency
  // array that would otherwise have to be defined before save() itself.
  const scheduleAnnouncementsRef = useRef(() => {});

  const load = useCallback(async () => {
    if (!sessionCode) return;
    try {
      const res = await window.storage.get(`${STORAGE_PREFIX}${sessionCode}`, true);
      if (res && res.value) {
        const parsed = JSON.parse(res.value);
        // avoid clobbering local edits with a stale remote read mid-interaction
        if (parsed.updatedAt >= (stateRef.current.updatedAt || 0)) {
          setState(parsed);
        }
      }
    } catch (e) {
      // session may not exist yet on this poll — ignore
    } finally {
      setLoaded(true);
    }
  }, [sessionCode]);

  const save = useCallback(
    // 24-Hour Inactivity Auto-Close — see lib/constants.js's SESSION_INACTIVITY_AGE_MS
    // and lib/openPlaySessionLifecycle.js. `isActivity` (default true) marks whether
    // this particular save represents MEANINGFUL player/organizer movement. It is
    // false ONLY from the held-player-reminder timer's own save() call below — that
    // timer fires purely because 15s of wall-clock time elapsed, not because anything
    // actually happened, so it must never refresh lastActivityAt (it would otherwise
    // let a truly idle session with a held player in it stay "active" forever). Every
    // other save() call site in this file is real activity and needs no change.
    async (next, { isActivity = true } = {}) => {
      if (!sessionCode) return;
      // Dynamic Court Count — see PROJECT.md/FEATURES.md. Runs first, before
      // anything else in save(), so a court a pending removal is waiting on
      // gets removed the instant it's idle, rather than automatic dispatch
      // below immediately re-filling it with a fresh matchup first.
      next = applyPendingCourtRemovals(next);
      // recomputed on every save: appends any newly-possible matchups from
      // players not already locked into one, leaving existing (possibly
      // scorer-edited) matchups untouched — see refreshNextMatchups. Which
      // engine builds them depends on the session's rotation mode; in
      // Progressive Skill Rotation, the current phase also shapes pairing
      // (see progressiveSkillPhaseFor below). Players drafted or locked into
      // a Manual Court Assignment are excluded from this pool entirely —
      // the automatic engine must never touch them, per Manual Court
      // Assignment's "ignore players already assigned to manual courts".
      const engine = getRotationEngine(next.rotationMode);
      const phase = progressiveSkillPhaseFor(
        next.rotationMode,
        next.players,
        next.expectedGamesPerPlayer,
        next.progressiveSkillThresholds
      );
      const manualIds = manuallyReservedIds(next.courts);
      const autoQueueIds = manualIds.size > 0 ? next.queueIds.filter((id) => !manualIds.has(id)) : next.queueIds;
      // Smart Queue Management — see PROJECT.md/FEATURES.md. Caps how many
      // upcoming matchups are kept queued at once (Live Courts − 1 in
      // steady state; see maxUpcomingMatchups for the pre-session-start
      // special case) — this is what makes "Queue Regeneration" automatic
      // for every listed event (check-in, checkout, resume, skip, held-
      // player-resume, matchup-cancelled): they all flow through this same
      // save(), so every one of them re-evaluates the cap for free.
      // Stop Queueing — see PROJECT.md/FEATURES.md. While the session's
      // queueing is stopped, save() must never append a newly-generated
      // matchup — existing nextMatchups entries (and everything live) are
      // left completely untouched, and the facilitator can still manually
      // deploy whatever's already queued.
      //
      // Start Queuing — see lib/constants.js's defaultState.queueingStarted.
      // Same "don't generate" outcome as queueingStopped, checked here
      // too, ahead of it — `=== false` (not `!next.queueingStarted`) so an
      // older session that never had this field keeps behaving exactly as
      // it always has.
      const queueingNotYetStarted = next.queueingStarted === false;
      const withMatchups = {
        ...next,
        nextMatchups: queueingNotYetStarted || next.queueingStopped
          ? next.nextMatchups || []
          : refreshNextMatchups(
              autoQueueIds,
              next.players,
              next.nextMatchups || [],
              engine,
              phase,
              maxUpcomingMatchups(next.courts),
              next.matchmakingPriority
            ),
      };
      // Smart Court Dispatch — see PROJECT.md/FEATURES.md. A reusable
      // service that reacts here, in the single save() write path, to "a
      // court is open and there's an eligible upcoming matchup" — NOT to
      // any one specific action. This means any action that frees a court
      // (a completed match, an unlocked manual court, an undone round,
      // ...) triggers dispatch consideration automatically, the same way
      // refreshNextMatchups above already re-evaluates on every save().
      // Court assignment (this call) always happens synchronously, before
      // any voice announcement is ever attempted — see the announcement
      // scheduling right after this function, which never affects what
      // gets persisted here.
      const dispatchResult = dispatchAvailableCourts({
        courts: withMatchups.courts,
        nextMatchups: withMatchups.nextMatchups,
        queueIds: withMatchups.queueIds,
        players: withMatchups.players,
        // Next Match (facilitator announcement) — honored as a dispatch
        // tie-break only (see courtDispatch.js's selectNextDispatchableMatchup);
        // matchmaking/pairing/rotation are completely unaffected.
        nextMatchupId: withMatchups.nextMatchupId,
        // Stop Queueing — see PROJECT.md/FEATURES.md. "NO NEW auto dispatch"
        // while stopped, regardless of the Auto-fill Courts setting;
        // manual dispatch (fillCourt/fillAllCourts/generateRemainingCourts)
        // is untouched and keeps working from whatever's already queued.
        autoFillCourts: !withMatchups.queueingStopped && withMatchups.courtDispatchSettings?.autoFillCourts !== false,
        isCourtReserved,
      });
      let withDispatch = {
        ...withMatchups,
        courts: dispatchResult.courts,
        nextMatchups: dispatchResult.nextMatchups,
        queueIds: dispatchResult.queueIds,
      };
      dispatchResult.dispatched.forEach((d) => {
        const dispatchedCourt = withDispatch.courts.find((c) => c.number === d.courtNumber);
        withDispatch = logDispatchEvent(withDispatch, {
          kind: "courtDispatched",
          courtNumber: d.courtNumber,
          courtLabel: courtDisplayName(dispatchedCourt),
          teamANames: d.teamANames,
          teamBNames: d.teamBNames,
          reason: "Court automatically dispatched",
        });
      });
      // Session Analytics Engine — see PROJECT.md/FEATURES.md. Purely
      // observational: diffs the court layout right before this save
      // (stateRef.current, since `save` itself has no other reference to
      // the previous state) against the layout just decided above, and
      // accumulates wait-time/play-streak bookkeeping for anyone who just
      // transitioned from waiting onto a court — regardless of whether
      // that came from manual assignment, Fill all open courts, Generate
      // remaining courts, or Smart Court Dispatch above. Never influences
      // any of those decisions, only records their outcome.
      withDispatch = {
        ...withDispatch,
        players: applyWaitingTimeTracking(stateRef.current.courts, withDispatch.courts, withDispatch.players),
      };
      // updatedAt advances on EVERY save() (any write at all — still the right
      // signal for "is this row being touched"); lastActivityAt advances only
      // when isActivity is true (the default) — see save()'s own doc comment
      // above and lib/constants.js's defaultState.lastActivityAt.
      const now = Date.now();
      const withStamp = {
        ...withDispatch,
        updatedAt: now,
        lastActivityAt: isActivity ? now : withDispatch.lastActivityAt ?? withDispatch.sessionStartedAt ?? now,
      };
      setState(withStamp);
      try {
        await window.storage.set(`${STORAGE_PREFIX}${sessionCode}`, JSON.stringify(withStamp), true);
        setSaveError("");
      } catch (e) {
        setSaveError("Couldn't sync — check your connection.");
      }
      if (dispatchResult.dispatched.length > 0) {
        scheduleAnnouncementsRef.current(dispatchResult.dispatched, withStamp.courtDispatchSettings);
      }
    },
    [sessionCode, isCourtReserved]
  );

  // Smart Court Dispatch — Voice Announcements. Schedules the
  // announcement pipeline for every court dispatchAvailableCourts just
  // assigned this save() cycle. Runs entirely client/device-local (the
  // Web Speech API only exists in a browser, and only the device that
  // happened to be present when the court became available can speak) —
  // same precedent as this app's other client-local timers (toasts,
  // undo snapshots). Reads stateRef.current (not a captured `state`) so a
  // multi-second delay never acts on stale data. Dispatch itself (court
  // assignment, already persisted by the time this runs) never depends on
  // any of this succeeding — a muted or unsupported browser still logs
  // the event and, if Auto Start Match is on, still starts the match.
  const scheduleAnnouncements = useCallback(
    (dispatchedList, settings) => {
      const cfg = settings || defaultState.courtDispatchSettings;
      dispatchedList.forEach(({ courtNumber, teamANames, teamBNames }) => {
        setTimeout(() => {
          const liveCourt = stateRef.current.courts.find((c) => c.number === courtNumber);
          const text = buildAnnouncementText(courtNumber, teamANames, teamBNames, courtDisplayName(liveCourt));
          const finish = (kind, reason) => {
            let updated = logDispatchEvent(stateRef.current, {
              kind,
              courtNumber,
              courtLabel: courtDisplayName(liveCourt),
              teamANames,
              teamBNames,
              reason,
            });
            if (cfg.autoStartMatch !== false) {
              updated = confirmCourtLiveAction(updated, courtNumber);
            }
            save(updated);
          };
          if (!cfg.voiceEnabled) {
            finish("announcementMuted", "Announcement muted");
            return;
          }
          emitDispatchEvent(DISPATCH_EVENTS.ANNOUNCEMENT_STARTED, { courtNumber });
          speakAnnouncement(text, cfg, (result) => {
            if (result === "completed") {
              emitDispatchEvent(DISPATCH_EVENTS.ANNOUNCEMENT_COMPLETED, { courtNumber });
              finish("announcementCompleted", "Voice announcement completed");
            } else {
              // "skipped" (unsupported/errored) or any other non-"completed"
              // result — either way, dispatch already happened; this only
              // affects logging and the auto-start timing.
              finish("announcementSkipped", "Announcement skipped");
            }
          });
        }, cfg.announcementDelayMs ?? 2000);
      });
    },
    [save]
  );
  useEffect(() => {
    scheduleAnnouncementsRef.current = scheduleAnnouncements;
  }, [scheduleAnnouncements]);

  // Held Player Reminder — see PROJECT.md/FEATURES.md. The floating
  // reminder banner has been removed per direct facilitator feedback (it
  // was one more thing competing for attention during a busy session), but
  // the underlying safeguard bookkeeping is kept exactly as it was: on a
  // slow tick (15s, same cadence WaitingTimer.jsx already uses for its own
  // display), checks which held players have newly crossed the
  // configurable minutes/rounds threshold and haven't been reminded within
  // the configurable repeat interval (see lib/queueManagement.js's
  // getPlayersNeedingHeldReminder — the only reader of these settings), and
  // marks each one shown — which persists heldReminderLastShownAt AND logs
  // a "Held Player Reminder" entry to the same Queue Activity Log every
  // other Held Player action already writes to (see ScorerView's
  // QUEUE_ACTIVITY_KIND_META), so a facilitator can still see it there.
  // Held status, held timers (heldAt/heldAtRound), and this log are all
  // completely unchanged — only the floating popup UI is gone.
  useEffect(() => {
    if (!loaded || !scorerAuthed) return undefined;
    const tick = () => {
      const due = getPlayersNeedingHeldReminder(stateRef.current);
      if (due.length === 0) return;
      let next = stateRef.current;
      due.forEach(({ playerId, minutesHeld, roundsHeld }) => {
        next = markHeldReminderShown(next, playerId, { minutesHeld, roundsHeld });
      });
      // NOT meaningful activity — this tick fires purely because 15s of
      // wall-clock time passed, see save()'s own doc comment. Must never
      // refresh lastActivityAt / the 24-Hour Inactivity Auto-Close clock.
      save(next, { isActivity: false });
    };
    tick(); // check immediately on entering Scorer, don't wait a full interval
    const interval = setInterval(tick, 15000);
    return () => clearInterval(interval);
  }, [loaded, scorerAuthed, save]);

  // Manually starts a dispatched ("Calling Players...") court — for when
  // Auto Start Match is off, or a facilitator wants to start early instead
  // of waiting for the announcement/delay to finish on its own. A no-op
  // if the court isn't currently "dispatching".
  const startDispatchedMatch = (courtNumber) => {
    save(confirmCourtLiveAction(state, courtNumber));
  };

  // Repeat Announcement — available on both "dispatching" (Calling
  // Players...) and live/finished (Playing) courts, per explicit
  // direction. Recomputes the announcement text from the court's CURRENT
  // team assignment (never regenerates anything, never touches court
  // status) and always logs the repeat; the actual speech is skipped if
  // Voice Announcements is off, same as automatic dispatch.
  const repeatAnnouncement = (courtNumber) => {
    const court = state.courts.find((c) => c.number === courtNumber);
    if (!court || court.status === "open") return;
    const teamANames = court.teamA.map((id) => state.players[id]?.name || "Unknown player");
    const teamBNames = court.teamB.map((id) => state.players[id]?.name || "Unknown player");
    const text = buildAnnouncementText(courtNumber, teamANames, teamBNames, courtDisplayName(court));
    const cfg = state.courtDispatchSettings || defaultState.courtDispatchSettings;
    const logRepeat = () => {
      save(
        logDispatchEvent(stateRef.current, {
          kind: "announcementRepeated",
          courtNumber,
          courtLabel: courtDisplayName(court),
          teamANames,
          teamBNames,
          reason: "Voice announcement repeated",
        })
      );
    };
    if (!cfg.voiceEnabled) {
      logRepeat();
      return;
    }
    emitDispatchEvent(DISPATCH_EVENTS.ANNOUNCEMENT_STARTED, { courtNumber, repeat: true });
    speakAnnouncement(text, cfg, (result) => {
      if (result === "completed") {
        emitDispatchEvent(DISPATCH_EVENTS.ANNOUNCEMENT_COMPLETED, { courtNumber, repeat: true });
      }
      logRepeat();
    });
  };

  // Next Match (facilitator announcement) — Open Play. Designates one
  // already-generated nextMatchups entry for the organizer to announce next.
  // Purely a display/announcement flag on session state (persists/refreshes
  // exactly like nextMatchups/queueIds already do) — never removes the
  // matchup from nextMatchups, never touches queueIds, never re-orders or
  // regenerates anything. Only one designation can ever exist since this is
  // a single field; selecting a different matchup simply overwrites it.
  const setNextMatchup = (matchupId) => {
    save({ ...state, nextMatchupId: matchupId });
  };

  const [announcingNextMatchup, setAnnouncingNextMatchup] = useState(false);

  // Mirrors repeatAnnouncement's shape above — same buildNextMatchAnnouncementText
  // sibling of buildAnnouncementText, same speakAnnouncement call, same
  // queueActivityLog entry via logDispatchEvent so this shows up alongside
  // every other dispatch/announcement event. Guards rapid repeated clicks by
  // ignoring further clicks until the in-flight announcement's onDone fires.
  const announceNextMatchup = () => {
    const matchup = state.nextMatchups.find((m) => m.id === state.nextMatchupId);
    if (!matchup || announcingNextMatchup) return;
    const teamANames = matchup.teamA.map((id) => state.players[id]?.name || "Unknown player");
    const teamBNames = matchup.teamB.map((id) => state.players[id]?.name || "Unknown player");
    const text = buildNextMatchAnnouncementText(teamANames, teamBNames);
    const cfg = state.courtDispatchSettings || defaultState.courtDispatchSettings;
    const logAnnouncement = () => {
      save(
        logDispatchEvent(stateRef.current, {
          kind: "nextMatchAnnounced",
          matchupId: matchup.id,
          teamANames,
          teamBNames,
          reason: "Next Match announced",
        })
      );
    };
    setAnnouncingNextMatchup(true);
    if (!cfg.voiceEnabled) {
      logAnnouncement();
      setAnnouncingNextMatchup(false);
      return;
    }
    speakAnnouncement(text, cfg, () => {
      logAnnouncement();
      setAnnouncingNextMatchup(false);
    });
  };

  // Safely clears a stale Next Match designation — the matchup it pointed
  // at left nextMatchups (dispatched to a court, cancelled, substituted
  // away, or wiped by Regenerate) without ever going through
  // setNextMatchup itself, so nothing else would otherwise notice.
  useEffect(() => {
    if (!state.nextMatchupId) return;
    if (state.nextMatchups.some((m) => m.id === state.nextMatchupId)) return;
    save({ ...stateRef.current, nextMatchupId: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.nextMatchups, state.nextMatchupId]);

  // Latecomer Priority — see PROJECT.md/FEATURES.md and lib/utils.js's
  // computeLatecomerPriorityPreview (the pure proposal logic; nothing below
  // duplicates or overrides it). A facilitator-control override layer
  // around the existing nextMatchups system, deliberately separate from
  // "Set as Next Match"/"Announce Next Match" above — this designates which
  // LATECOMER(S) get inserted into the next matchup, not which already-built
  // matchup to announce.
  //
  // `latecomerPreview` is local, ephemeral UI state (not persisted, not even
  // one-shot-snapshotted) — just "what dialog is currently open," holding
  // the selected player ids and the last-computed proposal so the dialog can
  // render Current/Proposed/Displaced or a failure reason.
  const [latecomerPreview, setLatecomerPreview] = useState(null);

  // Opens the preview dialog — purely a read: computes the proposal fresh
  // from current state and stores it for rendering. No save(), so Cancel
  // (or just re-opening this) can never have modified anything.
  const previewLatecomerPriority = (latecomerIds) => {
    const result = computeLatecomerPriorityPreview(state.nextMatchups, state.players, latecomerIds);
    setLatecomerPreview({ latecomerIds, result });
  };

  const cancelLatecomerPriority = () => setLatecomerPreview(null);

  // Applies the previewed substitution — but re-derives the proposal fresh
  // from the CURRENT (not the possibly-stale previewed) state first, per
  // explicit stale-state requirements: another facilitator action may have
  // changed the queue in the time between Preview and this click. Only
  // applies if the fresh proposal is still `ok` AND targets the exact same
  // matchup with the exact same displaced/inserted players the dialog is
  // showing — any drift re-renders the dialog with the fresh proposal
  // instead of silently applying something the facilitator never actually
  // confirmed, and leaves the queue completely untouched.
  const applyLatecomerPriority = () => {
    if (!latecomerPreview) return;
    const fresh = computeLatecomerPriorityPreview(state.nextMatchups, state.players, latecomerPreview.latecomerIds);
    const shown = latecomerPreview.result;
    const matches =
      fresh.ok &&
      shown.ok &&
      fresh.matchupId === shown.matchupId &&
      JSON.stringify(fresh.displacedPlayerIds) === JSON.stringify(shown.displacedPlayerIds) &&
      JSON.stringify(fresh.insertedPlayerIds) === JSON.stringify(shown.insertedPlayerIds);
    if (!matches) {
      setLatecomerPreview({ latecomerIds: latecomerPreview.latecomerIds, result: fresh, stale: true });
      return;
    }

    const before = state.nextMatchups;
    // One substitution per displaced/inserted pair, applied in sequence —
    // the exact same primitive substituteInMatchup already uses
    // (dissolveMatchupIfReserved with exceptMatchupId so the matchup being
    // built up doesn't dissolve itself), just looped for however many
    // latecomers this proposal inserts.
    let nextMatchups = before;
    fresh.insertedPlayerIds.forEach((incomingId, i) => {
      const outgoingId = fresh.displacedPlayerIds[i];
      const dissolved = dissolveMatchupIfReserved(nextMatchups, incomingId, fresh.matchupId);
      nextMatchups = dissolved.map((m) => {
        if (m.id !== fresh.matchupId) return m;
        const teamA = m.teamA.map((id) => (id === outgoingId ? incomingId : id));
        const teamB = m.teamB.map((id) => (id === outgoingId ? incomingId : id));
        return { ...m, teamA, teamB };
      });
    });

    clearOneShotSnapshots();
    const names = fresh.insertedPlayerIds.map((id) => state.players[id]?.name || "A player").join(", ");
    const reason = `${names} were prioritized into the next matchup`;
    const latecomerPriority = {
      matchupId: fresh.matchupId,
      insertedPlayerIds: fresh.insertedPlayerIds,
      displacedPlayerIds: fresh.displacedPlayerIds,
      appliedAt: Date.now(),
    };
    const next = noteDissolvedHeldMatchups(
      { ...state, nextMatchups, latecomerPriority },
      before,
      nextMatchups,
      reason,
      { players: state.players, affectedPlayer: names }
    );
    save(next);
    notifyIfHeldMatchDissolved(next, reason);
    // Set AFTER clearOneShotSnapshots (which just cleared it) — this is the
    // one snapshot this action actually wants to keep. Records the exact
    // applied `after` shape too, so Undo can verify nothing else has
    // touched this matchup since (see undoLatecomerPriority below) by plain
    // equality rather than re-deriving "intactness" from ids.
    setLatecomerPrioritySnapshot({ nextMatchups: before, matchupId: fresh.matchupId, after: fresh.after });
    setLatecomerPreview(null);
  };

  const [latecomerUndoError, setLatecomerUndoError] = useState("");

  // Restores the EXACT prior nextMatchups array — never re-runs any
  // rotation engine, which could produce a different matchup than the one
  // being undone. Re-validates the live matchup's teamA/teamB still exactly
  // match what was applied (nothing else has touched it since — another
  // Fix Teams/Substitute, a further Priority application, etc.) before
  // restoring; fails safely (clears the snapshot, leaves the queue
  // untouched, shows a brief message) rather than risking a corrupted/
  // duplicated matchup if it doesn't.
  const undoLatecomerPriority = () => {
    if (!latecomerPrioritySnapshot) return;
    setLatecomerUndoError("");
    const current = state.nextMatchups.find((m) => m.id === latecomerPrioritySnapshot.matchupId);
    const stillIntact =
      current &&
      JSON.stringify(current.teamA) === JSON.stringify(latecomerPrioritySnapshot.after.teamA) &&
      JSON.stringify(current.teamB) === JSON.stringify(latecomerPrioritySnapshot.after.teamB);
    if (!stillIntact) {
      setLatecomerPrioritySnapshot(null);
      setLatecomerUndoError("This matchup has changed since Priority was applied — Undo is no longer available.");
      setTimeout(() => setLatecomerUndoError(""), 5000);
      return;
    }
    save({ ...state, nextMatchups: latecomerPrioritySnapshot.nextMatchups, latecomerPriority: null });
    setLatecomerPrioritySnapshot(null);
  };

  // Self-healing, identical in shape to nextMatchupId's own effect above:
  // once the matchup a Latecomer Priority designation points at leaves
  // nextMatchups for ANY reason (dispatched to a court — the "one-shot,
  // clears after dispatch" rule — cancelled, substituted again, wiped by
  // Regenerate), clear the designation AND the local Undo snapshot, since
  // restoring it would either be a no-op (already gone) or, worse, resurrect
  // a matchup that's since moved on. This is what makes Undo unavailable
  // after dispatch/start without any special-case dispatch-path code.
  useEffect(() => {
    if (!state.latecomerPriority) return;
    if (state.nextMatchups.some((m) => m.id === state.latecomerPriority.matchupId)) return;
    save({ ...stateRef.current, latecomerPriority: null });
    setLatecomerPrioritySnapshot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.nextMatchups, state.latecomerPriority]);

  useEffect(() => {
    if (screen !== "app" || !sessionCode) return;
    load();
    // Realtime replaces polling: re-fetch whenever Supabase reports a change
    // to this session's row, so every connected device updates within
    // roughly a second of any other device's edit.
    const unsubscribe = window.storage.subscribeToKey(`${STORAGE_PREFIX}${sessionCode}`, true, load);
    return unsubscribe;
  }, [screen, sessionCode, load]);

  // ---- session lifecycle ----

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      setJoinError("Enter the 6-character code.");
      return;
    }
    setJoining(true);
    setJoinError("");
    try {
      const res = await window.storage.get(`${STORAGE_PREFIX}${code}`, true);
      if (res && res.value) {
        setState(JSON.parse(res.value));
        setSessionCode(code);
        setLoaded(true);
        setScreen("app");
      } else {
        setJoinError("Session not found — check the code and try again.");
      }
    } catch (e) {
      setJoinError("Session not found — check the code and try again.");
    } finally {
      setJoining(false);
    }
  };

  const startSession = async (
    venue,
    courtsCount,
    roster,
    rotationMode = "continuous",
    expectedGamesPerPlayer = 6,
    sessionType = "openPlay",
    tournamentFormat = null,
    templateConfig = null
  ) => {
    setCreating(true);
    setCreateError("");
    try {
      const code = await findUniqueSessionCode();
      const players = {};
      roster.forEach((p) => {
        players[p.id] = {
          id: p.id,
          name: p.name,
          photo: p.photo,
          skill: p.skill === "intermediate" ? "intermediate" : "beginner",
          checkedIn: false,
          checkedInAt: null, // Smart Queue Management — see PickleballOpenPlay.jsx's checkInExisting/quickAddCheckIn; the Waiting Queue Timer's fallback when a player has never played yet
          paymentStatus: "unpaid", // Player Payment Tracking — see PROJECT.md/FEATURES.md. Session-scoped only (never carries into the Player Database or a future session): a brand-new player record is created fresh at every startSession/quickAddCheckIn, so this always resets automatically
          paymentMethod: null, // "cash" | "gcash" | null (null while unpaid)
          partnerId: null, // Permanent Partner Mode — see PROJECT.md/FEATURES.md, session-scoped mutual fixed-partner link (setFixedPartner/clearFixedPartner, lib/queueManagement.js)
          held: false, // Smart Queue Management (renamed from the old "skipped" — Hold Player, see lib/queueManagement.js)
          heldAt: null, // Held Player Reminder — set fresh by holdPlayer each time this player becomes held, cleared by resumePlayer
          heldAtRound: null,
          heldReminderLastShownAt: null,
          status: "ACTIVE", // Player Checkout — see PLAYER_STATUSES in lib/constants.js
          checkedOutAt: null,
          games: 0,
          wins: 0,
          losses: 0,
          streak: 0,
          lossStreak: 0, // Adaptive Skill Rotation only — consecutive-loss counter, mirrors `streak` (consecutive-win counter) but reset the opposite way, see endMatch
          lastMatchEndAt: null, // Smart Queue Management — see PickleballOpenPlay.jsx's endMatch; the Waiting Queue Timer's primary source once a player has played at least one match
          lastResult: null,
          pointsFor: 0,
          pointsAgainst: 0,
          partnerCounts: {},
          recentPartnerIds: [],
          opponentCounts: {},
          lastOpponentIds: [],
          recentOpponentIds: [],
          courtCounts: {},
          lastCourt: null,
          // Session Analytics Engine — see PROJECT.md/FEATURES.md and
          // save()'s waiting-time accumulation below. totalWaitMs/
          // waitPeriodsCount/longestWaitMs accumulate every time this
          // player goes from waiting back onto a live court (a "wait
          // period" ending); currentPlayStreak/longestPlayStreak track
          // consecutive matches played with essentially no wait in
          // between. All start at 0 and are read-only outside save().
          totalWaitMs: 0,
          longestWaitMs: 0,
          waitPeriodsCount: 0,
          currentPlayStreak: 0,
          longestPlayStreak: 0,
        };
      });
      const courts = Array.from({ length: courtsCount }, (_, i) => emptyCourt(i + 1));
      const initial = {
        venue,
        venueId: activeVenueId, // Multi-Venue Workspace Architecture — see PROJECT.md; a plain passthrough of the active venue context, nothing yet reads it to change behavior
        sessionStartedAt: Date.now(), // Session Analytics Engine — set once, here, never touched again
        courts,
        players,
        queueIds: [],
        nextMatchups: [],
        nextMatchupId: null,
        latecomerPriority: null,
        matchHistory: [],
        sessionType,
        tournamentFormat,
        tournamentId: null, // see lib/tournamentModel.js — points to a separate Tournament KV record once a schedule is generated
        rotationMode,
        expectedGamesPerPlayer,
        adaptiveSkillThresholds: { ...defaultState.adaptiveSkillThresholds },
        skillChangeLog: [],
        queueActivityLog: [],
        courtDispatchSettings: { ...defaultState.courtDispatchSettings },
        queueingStarted: false, // Start Queuing — see lib/constants.js's defaultState.queueingStarted for the full gate design; explicitly set here (not left implicit) so every NEW session begins check-in-only, generating no matchups until the organizer explicitly clicks "Start Queuing"
        pendingTournamentTemplate: templateConfig, // see lib/constants.js/TournamentTemplateService.js — read once by TournamentScheduleView to pre-fill its defaults, never touched again after that
        updatedAt: Date.now(),
        lastActivityAt: Date.now(), // 24-Hour Inactivity Auto-Close — seeded to session creation time, same as sessionStartedAt; first real save() (any meaningful action) advances it from there
      };
      await window.storage.set(`${STORAGE_PREFIX}${code}`, JSON.stringify(initial), true);

      // All Sessions — see PROJECT.md/FEATURES.md. Best-effort: a failure
      // here shouldn't block the session that was just successfully
      // created from actually starting.
      try {
        await recordSessionCreated({
          sessionCode: code,
          venue,
          rotationMode,
          sessionType,
          createdAt: initial.sessionStartedAt,
        });
      } catch (e) {
        // index bookkeeping failure shouldn't block the session from starting
      }

      // consume the access code now that a session was actually created —
      // if the organizer backed out earlier, the code stays unused/reusable.
      // Skipped entirely for DEV_ACCESS_CODE, which isn't a real Supabase
      // record to begin with and must stay usable indefinitely.
      if (validatedAccessCode && validatedAccessCode !== DEV_ACCESS_CODE) {
        try {
          const res = await window.storage.get(`${ACCESS_PREFIX}${validatedAccessCode}`, true);
          if (res && res.value) {
            const record = JSON.parse(res.value);
            await window.storage.set(
              `${ACCESS_PREFIX}${validatedAccessCode}`,
              JSON.stringify({ ...record, usedAt: Date.now() }),
              true
            );
          }
        } catch (e) {
          // access-code bookkeeping failure shouldn't block the session that was just created
        }
      }

      setState(initial);
      setSessionCode(code);
      setLoaded(true);
      setScreen("app");
    } catch (e) {
      setCreateError("Couldn't create the session — check your connection and try again.");
    } finally {
      setCreating(false);
    }
  };

  // Builds (or rebuilds) a Round Robin schedule from this session's
  // registered players and saves it as its own Tournament record (see
  // lib/tournamentModel.js) — the session only stores a `tournamentId`
  // pointer to it, never the schedule itself. Regenerating is safe: it
  // creates a brand-new record with a new id rather than overwriting the
  // old one, since nothing (scoring, standings) references match ids yet.
  // Tournament Format — see PROJECT.md/FEATURES.md. Wired for real: which
  // builder runs depends on state.tournamentFormat (set once at Create
  // Session, see CreateSessionScreen.jsx), not just Round Robin
  // unconditionally the way this used to silently ignore that selection
  // entirely (the root cause of a real Double Elimination event running as
  // plain Round Robin — see CHANGELOG.md). Round Robin's own path
  // (buildAndSaveRoundRobinTournament, pool-based) is completely
  // unchanged; Double Elimination is a new, separate, standalone builder
  // (buildAndSaveDoubleEliminationTournament, no pool stage) — see
  // lib/tournament.js/DoubleEliminationEngine.js.
  const generateTournamentSchedule = async (mode, poolCount = 1, advancesPerPool = 1, seedingMethod = "random") => {
    setGeneratingSchedule(true);
    setScheduleError("");
    try {
      const players = Object.values(state.players);
      const tournament =
        state.tournamentFormat === "doubleElimination"
          ? await buildAndSaveDoubleEliminationTournament({
              sessionCode,
              players,
              mode,
              courtsCount: state.courts.length,
              seedingMethod,
            })
          : await buildAndSaveRoundRobinTournament({
              sessionCode,
              players,
              mode,
              courtsCount: state.courts.length,
              poolCount,
              advancesPerPool,
              // Tournament Templates — carried through from Create Session if the
              // organizer picked "Use Template" (see pendingTournamentTemplate
              // above); undefined for every other session, which
              // buildAndSaveRoundRobinTournament already treats as "no override."
              courtNames: state.pendingTournamentTemplate?.defaultCourtNames ?? undefined,
              matchScoringRules: state.pendingTournamentTemplate?.matchScoringRules ?? undefined,
            });
      await save({ ...state, tournamentId: tournament.id });
    } catch (e) {
      setScheduleError(e.message || "Couldn't generate the schedule.");
    } finally {
      setGeneratingSchedule(false);
    }
  };

  const leaveSession = () => {
    localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    setScreen("landing");
    setSessionCode(null);
    setState(defaultState);
    setLoaded(false);
    setView("board");
    setScorerAuthed(false);
    setPin("");
    setPinError("");
    setPaymentAuthed(false);
    setPaymentPin("");
    setPaymentPinError("");
    setJoinCode("");
    setJoinError("");
    clearOneShotSnapshots();
  };

  const goToLanding = () => {
    setScreen("landing");
    setAccessCodeInput("");
    setAccessError("");
    setValidatedAccessCode(null);
    setAdminAuthed(false);
    setAdminPin("");
    setAdminPinError("");
    setLookupInput("");
    setLookupResult(null);
  };

  const submitAccessCode = async () => {
    const code = accessCodeInput.trim().toUpperCase();
    if (!code) {
      setAccessError("Enter your access code.");
      return;
    }
    setAccessChecking(true);
    setAccessError("");
    // dev-only escape hatch: never looked up in Supabase, never consumed —
    // see DEV_ACCESS_CODE in lib/constants.js
    if (code === DEV_ACCESS_CODE) {
      setValidatedAccessCode(code);
      setScreen("create");
      setAccessChecking(false);
      return;
    }
    try {
      const res = await window.storage.get(`${ACCESS_PREFIX}${code}`, true);
      if (!res || !res.value) {
        setAccessError("That code isn't valid. Double check it with your organizer.");
        return;
      }
      const record = JSON.parse(res.value);
      if (record.usedAt) {
        setAccessError("This code has already been used. Contact your organizer for a new one.");
        return;
      }
      setValidatedAccessCode(code);
      setScreen("create");
    } catch (e) {
      setAccessError("That code isn't valid. Double check it with your organizer.");
    } finally {
      setAccessChecking(false);
    }
  };

  const tryAdminLogin = () => {
    if (adminPin === ADMIN_PIN) {
      setAdminAuthed(true);
      setAdminPinError("");
    } else {
      setAdminPinError("Wrong PIN. Try again.");
    }
  };

  const generateAccessCode = async () => {
    setGenerating(true);
    try {
      const code = await findUniqueAccessCode();
      const record = { code, createdAt: Date.now(), usedAt: null };
      await window.storage.set(`${ACCESS_PREFIX}${code}`, JSON.stringify(record), true);
      setRecentCodes((r) => [record, ...r].slice(0, 25));
    } catch (e) {
      // admin can just try generating again
    } finally {
      setGenerating(false);
    }
  };

  const lookupCode = async () => {
    const code = lookupInput.trim().toUpperCase();
    if (!code) return;
    setLookupBusy(true);
    setLookupResult(null);
    try {
      const res = await window.storage.get(`${ACCESS_PREFIX}${code}`, true);
      if (res && res.value) setLookupResult(JSON.parse(res.value));
      else setLookupResult({ code, notFound: true });
    } catch (e) {
      setLookupResult({ code, notFound: true });
    } finally {
      setLookupBusy(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(sessionCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    } catch (e) {
      // clipboard access can fail silently — code is still visible on screen
    }
  };

  // ---- roster / check-in actions ----

  const handlePhotoSelect = async (file) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await resizeImageToAvatar(file);
      setPhotoDataUrl(dataUrl);
    } catch (e) {
      // photo is optional — a failed read just means no avatar for this player
    } finally {
      setPhotoBusy(false);
    }
  };

  const checkInExisting = (id) => {
    const p = state.players[id];
    if (!p || p.checkedIn) return;
    const players = { ...state.players, [id]: { ...p, checkedIn: true, checkedInAt: Date.now() } };
    const queueIds = [...state.queueIds, id];
    clearOneShotSnapshots(); // a snapshot from before this check-in would silently un-check them
    save({ ...state, players, queueIds });
    setCheckinMsg(`${p.name} is in the queue.`);
    setTimeout(() => setCheckinMsg(""), 2500);
  };

  // Registered Player Check-In (Player Database) — see CheckinView.jsx's own
  // header comment. `record` is a Player Database row (lib/playerDatabase.js
  // — id/displayName/skill/photo), found via search for a player who wasn't
  // pre-added to THIS session's roster at Create Session time. Two cases:
  //   - this session already has a player record under that same id (e.g.
  //     pre-registered, or previously added here another way) -> reuse the
  //     exact existing checkInExisting path unchanged, never a duplicate.
  //   - genuinely new to this session -> create a fresh session-player
  //     record using the Player Database's OWN id/name/skill/photo (never a
  //     new random id — see playerDatabase.js's header comment on why the
  //     shared id matters), same fresh-record shape quickAddCheckIn already
  //     uses for a walk-in, just keyed by the real identity instead.
  const checkInFromDatabase = (record) => {
    const decision = resolveDatabaseCheckIn(state.players, record);
    if (decision.action === "noop") return;
    if (decision.action === "checkInExisting") {
      checkInExisting(decision.id);
      return;
    }
    const { id, name, skill, photo } = decision;
    const players = {
      ...state.players,
      [id]: {
        id,
        name,
        skill,
        checkedIn: true,
        checkedInAt: Date.now(),
        paymentStatus: "unpaid",
        paymentMethod: null,
        partnerId: null,
        held: false,
        status: "ACTIVE",
        checkedOutAt: null,
        games: 0,
        wins: 0,
        losses: 0,
        streak: 0,
        lossStreak: 0,
        lastMatchEndAt: null,
        lastResult: null,
        pointsFor: 0,
        pointsAgainst: 0,
        partnerCounts: {},
        recentPartnerIds: [],
        opponentCounts: {},
        lastOpponentIds: [],
        recentOpponentIds: [],
        courtCounts: {},
        lastCourt: null,
        photo,
      },
    };
    const queueIds = [...state.queueIds, id];
    clearOneShotSnapshots();
    save({ ...state, players, queueIds });
    setCheckinMsg(`${name} is in the queue.`);
    setTimeout(() => setCheckinMsg(""), 2500);
  };

  // Walk-In Players Join the Player Database — see PROJECT.md. A walk-in
  // checked in here through CheckinView's quick-add form used to get a
  // throwaway, session-only `uid()` — never written anywhere else, so the
  // player didn't exist for "Search registered players" next time and had
  // to be re-entered from scratch. This now follows the EXACT same shape
  // CreateSessionScreen's own "Create new player" already uses
  // (emptyPlayerRecord + savePlayerRecord): a real Player Database record
  // is created first, and its own id — never a second, unrelated one — is
  // reused as this session's player id, exactly like checkInFromDatabase/
  // checkInExisting already do for a player found via search. A save
  // failure doesn't block the walk-in from joining today's session (same
  // "still added to this session" precedent CreateSessionScreen's own
  // createAndAddPlayer follows) — it just means this one walk-in won't be
  // findable in the Player Database next time.
  const quickAddCheckIn = async () => {
    const name = nameInput.trim();
    if (!name) return;
    // Player Photos & Broadcast Experience — see PROJECT.md. Required for
    // every newly checked-in walk-in going forward, same rule
    // CreateSessionScreen's new-player form now enforces — this button's
    // own `disabled` covers the mouse click, but the Enter-key shortcut
    // (CheckinView's onKeyDown) calls this function directly, so the guard
    // needs to live here too.
    if (!photoDataUrl) return;
    const skill = skillInput === "intermediate" ? "intermediate" : "beginner";
    const record = emptyPlayerRecord({ firstName: name, displayName: name, photo: photoDataUrl, skill });
    try {
      await savePlayerRecord(record);
    } catch (e) {
      // Player Database save failed — the walk-in still joins this
      // session below, using the id already generated for the record
      // (emptyPlayerRecord's uid() happens locally, before the network
      // call — never regenerated on failure), same as
      // CreateSessionScreen's own createAndAddPlayer.
    }
    const id = record.id;
    const players = {
      ...state.players,
      [id]: {
        id,
        name,
        skill,
        checkedIn: true,
        checkedInAt: Date.now(), // Smart Queue Management — see the Waiting Queue Timer
        paymentStatus: "unpaid", // Player Payment Tracking — see PROJECT.md/FEATURES.md, session-scoped only
        paymentMethod: null,
        partnerId: null, // Permanent Partner Mode — see PROJECT.md/FEATURES.md
        held: false, // Smart Queue Management (renamed from the old "skipped" — Hold Player, see lib/queueManagement.js)
        status: "ACTIVE",
        checkedOutAt: null,
        games: 0,
        wins: 0,
        losses: 0,
        streak: 0,
        lossStreak: 0, // Adaptive Skill Rotation only — see PickleballOpenPlay.jsx's endMatch
        lastMatchEndAt: null, // Smart Queue Management — see the Waiting Queue Timer
        lastResult: null,
        pointsFor: 0,
        pointsAgainst: 0,
        partnerCounts: {},
        recentPartnerIds: [],
        opponentCounts: {},
        lastOpponentIds: [],
        recentOpponentIds: [],
        courtCounts: {},
        lastCourt: null,
        photo: photoDataUrl || null,
      },
    };
    const queueIds = [...state.queueIds, id];
    clearOneShotSnapshots(); // a snapshot from before this check-in wouldn't know this player exists
    save({ ...state, players, queueIds });
    setNameInput("");
    setPhotoDataUrl(null);
    setCheckinMsg(`${name} is in the queue.`);
    setTimeout(() => setCheckinMsg(""), 2500);
  };

  // courts are filled from the front of nextMatchups — pre-built (and
  // possibly scorer-edited) upcoming matchups — rather than recomputed on
  // the spot, so what the scorer reviewed is exactly what gets deployed.
  // selectNextDispatchableMatchup (lib/courtDispatch.js) is the same
  // selection logic Smart Court Dispatch's automatic path uses — one
  // shared definition of "what's next," so manual and automatic dispatch
  // can never disagree. Manual dispatch always goes straight to "live"
  // (no "Calling Players..."/announcement pipeline — that's specific to
  // automatic dispatch).
  const fillCourt = (courtIdx) => {
    const court = state.courts[courtIdx];
    // manual courts are filled by lockManualCourt (the organizer's own
    // picks), never by deploying a pre-built rotation-engine matchup
    if (court.status !== "open" || court.assignmentMode === "manual" || isCourtReserved(court.number)) return;
    const { matchup: nextMatch, rest: restMatchups } = selectNextDispatchableMatchup(state.nextMatchups, state.players, state.nextMatchupId);
    if (!nextMatch) return;

    const { teamA, teamB } = nextMatch;
    const consumed = new Set([...teamA, ...teamB]);
    const queueIds = state.queueIds.filter((id) => !consumed.has(id));
    const courts = state.courts.map((c, i) =>
      i === courtIdx ? { ...c, status: "live", teamA, teamB, scoreA: 0, scoreB: 0 } : c
    );
    clearOneShotSnapshots(); // a deployed matchup can't be safely resurrected by undo
    save({ ...state, courts, queueIds, nextMatchups: restMatchups });
  };

  const fillAllCourts = () => {
    let queueIds = [...state.queueIds];
    let remainingMatchups = [...(state.nextMatchups || [])];
    const courts = state.courts.map((c) => {
      if (c.status !== "open" || c.assignmentMode === "manual" || isCourtReserved(c.number)) return c;
      const { matchup: nextMatch, rest } = selectNextDispatchableMatchup(remainingMatchups, state.players, state.nextMatchupId);
      if (!nextMatch) return c;
      remainingMatchups = rest;
      const { teamA, teamB } = nextMatch;
      const consumed = new Set([...teamA, ...teamB]);
      queueIds = queueIds.filter((id) => !consumed.has(id));
      return { ...c, status: "live", teamA, teamB, scoreA: 0, scoreB: 0 };
    });
    clearOneShotSnapshots();
    save({ ...state, courts, queueIds, nextMatchups: remainingMatchups });
  };

  // ---- Manual Court Assignment ----
  // Lets the organizer hand-pick a specific court's 4 players and 2 teams
  // instead of letting the rotation engine fill it — the rest of the
  // courts keep using whichever rotation mode is active. See
  // manuallyReservedIds (lib/utils.js) for how the automatic engine is
  // kept from ever touching these players, and PROJECT.md for the full
  // design.

  // toggling to "manual" only makes sense for a still-open court (nothing
  // to switch once it's live); toggling back to "automatic" clears
  // whatever draft picks were made, since they'd otherwise silently
  // reserve those players forever without ever becoming a real matchup
  const setCourtAssignmentMode = (courtIdx, mode) => {
    const court = state.courts[courtIdx];
    if (court.status !== "open") return;
    const courts = state.courts.map((c, i) =>
      i === courtIdx ? { ...c, assignmentMode: mode, teamA: [], teamB: [] } : c
    );
    save({ ...state, courts });
  };

  // fills one slot (side "teamA"/"teamB", slotIndex 0/1) of a manual
  // court's draft. If the incoming player is currently reserved in an
  // upcoming matchup, dissolveMatchupIfReserved frees the rest of that
  // matchup first — same mechanic substitutePlayer/substituteInMatchup use
  // — since Manual Court Assignment's player sources are explicitly the
  // waiting queue AND upcoming matchups, not just the queue.
  const setManualCourtPlayer = (courtIdx, side, slotIndex, playerId) => {
    const court = state.courts[courtIdx];
    if (court.status !== "open" || court.assignmentMode !== "manual") return;
    const before = state.nextMatchups;
    const nextMatchups = dissolveMatchupIfReserved(before, playerId);
    const courts = state.courts.map((c, i) => {
      if (i !== courtIdx) return c;
      const nextSide = [...c[side]];
      nextSide[slotIndex] = playerId;
      return { ...c, [side]: nextSide };
    });
    clearOneShotSnapshots();
    const name = state.players[playerId]?.name || "A player";
    const reason = `${name} was assigned to a manual court`;
    const next = noteDissolvedHeldMatchups({ ...state, courts, nextMatchups }, before, nextMatchups, reason, {
      players: state.players,
      affectedPlayer: name,
    });
    save(next);
    notifyIfHeldMatchDissolved(next, reason);
  };

  const clearManualCourtPlayer = (courtIdx, side, slotIndex) => {
    const courts = state.courts.map((c, i) => {
      if (i !== courtIdx) return c;
      const nextSide = [...c[side]];
      nextSide.splice(slotIndex, 1);
      return { ...c, [side]: nextSide };
    });
    save({ ...state, courts });
  };

  // "Lock court": commits a manual court's 4 draft picks and deploys it —
  // from here on it behaves exactly like any other live court (same
  // score/end-match flow). Validates all 4 slots are filled with unique
  // players ("incomplete courts... from being started" / "duplicate player
  // assignments" — Manual Court Assignment's required checks) before
  // allowing it.
  const lockManualCourt = (courtIdx) => {
    const court = state.courts[courtIdx];
    if (court.status !== "open" || court.assignmentMode !== "manual") return;
    const teamA = court.teamA.filter(Boolean);
    const teamB = court.teamB.filter(Boolean);
    const allIds = [...teamA, ...teamB];
    const allUnique = new Set(allIds).size === allIds.length;
    if (teamA.length !== 2 || teamB.length !== 2 || !allUnique) return;

    const queueIds = state.queueIds.filter((id) => !allIds.includes(id));
    const courts = state.courts.map((c, i) =>
      i === courtIdx ? { ...c, status: "live", teamA, teamB, scoreA: 0, scoreB: 0, manualLocked: true } : c
    );
    clearOneShotSnapshots();
    save({ ...state, courts, queueIds });
  };

  // "Unlock": reverses a lock before the match is decided — sends its 4
  // players back to the waiting queue and clears the draft, same as if the
  // organizer were starting the manual pick over. Once a match is
  // "finished" (or ended), the lock has already served its purpose and
  // releases on its own via the normal end-match flow instead.
  const unlockManualCourt = (courtIdx) => {
    const court = state.courts[courtIdx];
    if (!court.manualLocked || court.status !== "live") return;
    const playedIds = [...court.teamA, ...court.teamB];
    const queueIds = [...state.queueIds, ...playedIds];
    const courts = state.courts.map((c, i) =>
      i === courtIdx
        ? { ...c, status: "open", teamA: [], teamB: [], scoreA: 0, scoreB: 0, manualLocked: false, assignmentMode: "manual" }
        : c
    );
    clearOneShotSnapshots();
    save({ ...state, courts, queueIds });
  };

  // "Generate Remaining Courts": explicitly rebuilds nextMatchups from
  // scratch (same as Regenerate) using only players not spoken for by a
  // manual court, then immediately deploys them onto every open automatic
  // court — the one-click version of the organizer workflow's last step,
  // for when they've finished setting up their manual court(s) and want
  // the rest filled in right away rather than waiting on the next
  // automatic refresh.
  const generateRemainingCourts = () => {
    const manualIds = manuallyReservedIds(state.courts);
    const queueIds = state.queueIds.filter((id) => !manualIds.has(id));
    // Smart Queue Management — a held matchup (like a locked one) must
    // survive this rebuild untouched, not get silently dissolved just
    // because it's not explicitly locked.
    const protectedMatchups = (state.nextMatchups || []).filter((m) => m.locked || m.held);
    const engine = getRotationEngine(state.rotationMode);
    const phase = progressiveSkillPhaseFor(
      state.rotationMode,
      state.players,
      state.expectedGamesPerPlayer,
      state.progressiveSkillThresholds
    );
    // Stop Queueing — see PROJECT.md/FEATURES.md. "Generate remaining
    // courts" explicitly rebuilds nextMatchups from scratch; while queueing
    // is stopped it must not create anything new either, so it falls back
    // to just deploying whatever's already queued onto open courts below.
    // Start Queuing — same gate save() uses (see lib/constants.js's
    // defaultState.queueingStarted); before it's explicitly started, this
    // manual action must not generate anything either.
    const generated = state.queueingStopped || state.queueingStarted === false
      ? state.nextMatchups || []
      : regenerateNextMatchups(
          queueIds,
          state.players,
          protectedMatchups,
          engine,
          phase,
          maxUpcomingMatchups(state.courts),
          state.matchmakingPriority
        );

    let remainingIds = [...state.queueIds];
    let remainingMatchups = [...generated];
    const courts = state.courts.map((c) => {
      if (c.status !== "open" || c.assignmentMode === "manual") return c;
      const { matchup: nextMatch, rest } = selectNextDispatchableMatchup(remainingMatchups, state.players, state.nextMatchupId);
      if (!nextMatch) return c;
      remainingMatchups = rest;
      const consumed = new Set([...nextMatch.teamA, ...nextMatch.teamB]);
      remainingIds = remainingIds.filter((id) => !consumed.has(id));
      return { ...c, status: "live", teamA: nextMatch.teamA, teamB: nextMatch.teamB, scoreA: 0, scoreB: 0 };
    });
    setRegenerateSnapshot(state.nextMatchups || []);
    save({ ...state, courts, queueIds: remainingIds, nextMatchups: remainingMatchups });
  };

  const adjustScore = (courtIdx, team, delta) => {
    const courts = state.courts.map((c, i) => {
      if (i !== courtIdx) return c;
      const key = team === "A" ? "scoreA" : "scoreB";
      const next = Math.max(0, c[key] + delta);
      const updated = { ...c, [key]: next };
      const a = updated.scoreA, b = updated.scoreB;
      // win by 1 / sudden death: first team to reach 11 wins outright, no deuce
      if (a >= 11 || b >= 11) {
        updated.status = "finished";
      } else if (updated.status === "finished") {
        updated.status = "live";
      }
      return updated;
    });
    save({ ...state, courts });
  };

  // quick path for casual games that don't need point-by-point scoring —
  // sets the score straight to 11-0 for the declared winner (still counts
  // as a normal win in stats/history, just without the play-by-play) and
  // marks the court "finished" so "End match" is immediately available
  const declareWinner = (courtIdx, team) => {
    const courts = state.courts.map((c, i) =>
      i === courtIdx ? { ...c, scoreA: team === "A" ? 11 : 0, scoreB: team === "B" ? 11 : 0, status: "finished" } : c
    );
    save({ ...state, courts });
  };

  const endMatch = (courtIdx) => {
    // "Undo last round" restores this exact pre-match state (court still
    // live with its original teams/score, players' stats and rotation
    // history, matchHistory, queueIds) in one shot — see undoLastRound.
    const preMatchState = state;
    const court = state.courts[courtIdx];
    const { teamA, teamB, scoreA, scoreB } = court;
    const playedIds = [...teamA, ...teamB];
    let players = { ...state.players };
    const aWon = scoreA > scoreB;
    const bWon = scoreB > scoreA;
    const matchEndedAt = Date.now(); // Smart Queue Management — Waiting Queue Timer's source once a player has played
    // End Match Early — see PROJECT.md/FEATURES.md. A court that never
    // reached "finished" (no Won/declared winner — the facilitator just hit
    // "End match early" on a still-"live" court) doesn't get its 4 players'
    // waiting clock reset to right now. Their `lastMatchEndAt` (the
    // Waiting Queue Timer's basis, see WaitingTimer.jsx) is left exactly as
    // it was BEFORE this match started, so their wait continues counting
    // from their true last stopping point instead of restarting at zero —
    // an early-ended match shouldn't make 4 players look freshly rested
    // when they were really just interrupted. A normally-completed match
    // (status already "finished" — Won/declareWinner already ran, this is
    // just "Confirm result") still resets the clock as before, since that
    // player genuinely did just finish playing.
    const isEarlyEnd = court.status !== "finished";
    teamA.forEach((id) => {
      if (!players[id]) return;
      const p = players[id];
      players[id] = {
        ...p,
        games: (p.games || 0) + 1,
        wins: (p.wins || 0) + (aWon ? 1 : 0),
        losses: (p.losses || 0) + (bWon ? 1 : 0),
        streak: aWon ? (p.streak || 0) + 1 : 0,
        lossStreak: bWon ? (p.lossStreak || 0) + 1 : 0,
        lastResult: aWon ? "win" : bWon ? "loss" : p.lastResult,
        lastMatchEndAt: nextLastMatchEndAt(p, matchEndedAt, isEarlyEnd),
        pointsFor: (p.pointsFor || 0) + scoreA,
        pointsAgainst: (p.pointsAgainst || 0) + scoreB,
      };
    });
    teamB.forEach((id) => {
      if (!players[id]) return;
      const p = players[id];
      players[id] = {
        ...p,
        games: (p.games || 0) + 1,
        wins: (p.wins || 0) + (bWon ? 1 : 0),
        losses: (p.losses || 0) + (aWon ? 1 : 0),
        streak: bWon ? (p.streak || 0) + 1 : 0,
        lossStreak: aWon ? (p.lossStreak || 0) + 1 : 0,
        lastResult: bWon ? "win" : aWon ? "loss" : p.lastResult,
        lastMatchEndAt: nextLastMatchEndAt(p, matchEndedAt, isEarlyEnd),
        pointsFor: (p.pointsFor || 0) + scoreB,
        pointsAgainst: (p.pointsAgainst || 0) + scoreA,
      };
    });
    // partner/opponent/court history feeds the rotation engine's recency
    // scoring for the next round — see recordRotationHistory
    players = recordRotationHistory(players, teamA, teamB, court.number);

    // Adaptive Skill Rotation — automatic promotion/relegation. Runs only
    // here, AFTER every stat/streak update above has already landed in
    // `players` — so this always reads the freshly-updated streak, and
    // since the court itself isn't touched until further below (or not at
    // all, in the pooling branch, until resolveWinnerPoolMatch runs), a
    // live match is never interrupted by a skill change. Thresholds are
    // organizer-configurable (state.adaptiveSkillThresholds, see Session
    // Settings) rather than hardcoded. A manual override
    // (changePlayerSkill) always wins going forward, since it resets both
    // streaks to 0 the moment it runs, so this check simply won't have a
    // streak to act on again until enough new consecutive results pile up
    // under the overridden skill.
    const skillChangeEntries = [];
    if (state.rotationMode === "adaptiveSkill") {
      const { promotionWins = 3, relegationLosses = 3 } = state.adaptiveSkillThresholds || {};
      playedIds.forEach((id) => {
        const p = players[id];
        if (!p) return;
        if (p.skill !== "intermediate" && (p.streak || 0) >= promotionWins) {
          players[id] = { ...p, skill: "intermediate", streak: 0 };
          skillChangeEntries.push({
            id: uid(),
            playerId: id,
            playerName: p.name,
            previousSkill: "beginner",
            newSkill: "intermediate",
            reason: `${promotionWins} consecutive wins`,
            source: "automatic", // Session Analytics Engine — distinguishes this from a manual override without string-matching `reason`
            timestamp: Date.now(),
          });
        } else if (p.skill === "intermediate" && (p.lossStreak || 0) >= relegationLosses) {
          players[id] = { ...p, skill: "beginner", lossStreak: 0 };
          skillChangeEntries.push({
            id: uid(),
            playerId: id,
            playerName: p.name,
            previousSkill: "intermediate",
            newSkill: "beginner",
            reason: `${relegationLosses} consecutive losses`,
            source: "automatic",
            timestamp: Date.now(),
          });
        }
      });
    }
    const skillChangeLog = skillChangeEntries.length
      ? [...skillChangeEntries, ...(state.skillChangeLog || [])].slice(0, 50)
      : state.skillChangeLog;
    if (skillChangeEntries.length) {
      const msg = skillChangeEntries
        .map((e) =>
          e.newSkill === "intermediate"
            ? `${e.playerName} has been promoted to Intermediate.`
            : `${e.playerName} has been moved to Beginner.`
        )
        .join(" ");
      setSkillChangeMsg(msg);
      setTimeout(() => setSkillChangeMsg(""), 4000);
    }

    // the phase this match was actually played under — computed from
    // pre-match progress, since games/wins only increment above, after the
    // match is already over. Progressive Skill Rotation only; null
    // otherwise. Feeds the per-phase match counts in Scorer's stats panel.
    const phasePlayed = progressiveSkillPhaseFor(
      preMatchState.rotationMode,
      preMatchState.players,
      preMatchState.expectedGamesPerPlayer,
      preMatchState.progressiveSkillThresholds
    );
    const matchRecord = {
      round: (state.matchHistory || []).length + 1,
      court: court.number,
      teamA,
      teamB,
      winner: aWon ? "A" : bWon ? "B" : null,
      scoreA,
      scoreB,
      endedAt: Date.now(),
      phase: phasePlayed,
    };
    const matchHistory = [...(state.matchHistory || []), matchRecord];

    rateOpenPlayMatch(teamA, teamB, aWon, bWon);

    // pooling applies to standalone Winner Pool Rotation, and to Progressive
    // Skill Rotation while it's in the Mentorship phase (see
    // isPoolingRotation) — plus, regardless of the phase *this* match just
    // finished under, if this court's pair partner is already sitting
    // "awaitingPair" (committed to pooling when *it* finished), so a phase
    // boundary crossed between the two courts finishing can't strand the
    // partner in that held state forever.
    const partnerIdx = getPairPartnerIndex(state.courts, courtIdx);
    const partnerAwaitingPair = partnerIdx !== null && state.courts[partnerIdx]?.awaitingPair;
    if (isPoolingRotation(state.rotationMode, phasePlayed) || partnerAwaitingPair) {
      // hold this court (and its pair partner, if also done) instead of
      // requeuing everyone individually — see winnerPoolRound.js. Once both
      // courts in the pair are done, their pooled teams go to the BACK of
      // the queue/nextMatchups (not straight back onto the same 2 courts),
      // so other waiting players get first turn on the courts that just
      // opened up.
      const { courts, requeueIds, newMatchups } = resolveWinnerPoolMatch(state.courts, players, courtIdx);
      const queueIds = [...state.queueIds, ...requeueIds];
      const nextMatchups = [...(state.nextMatchups || []), ...newMatchups];
      setRegenerateSnapshot(null); // stale after this round's requeue/repool
      setLastRoundSnapshot(preMatchState);
      save({ ...state, courts, players, queueIds, nextMatchups, matchHistory, skillChangeLog });
      return;
    }

    const queueIds = [...state.queueIds, ...playedIds];
    const courts = state.courts.map((c, i) => (i === courtIdx ? resetCourtForNextMatch(c) : c));
    setRegenerateSnapshot(null); // stale after this round's requeue
    setLastRoundSnapshot(preMatchState);
    save({ ...state, courts, players, queueIds, matchHistory, skillChangeLog });
  };

  // restores the full app state from right before the last "End match"
  // click on this device — court back to live with its original
  // teams/score, players' stats and rotation history reverted, the match
  // removed from matchHistory, and queueIds back to not having those
  // players requeued. One-shot and device-local, same as undoRegenerate.
  const undoLastRound = () => {
    if (!lastRoundSnapshot) return;
    save(lastRoundSnapshot);
    setLastRoundSnapshot(null);
  };

  // Game History — score correction (see lib/queueManagement.js's
  // editMatchHistoryScore for the full "why same-winner-only" reasoning).
  // A thin wrapper, same "call the pure function, save() what it returns"
  // shape as every other handler here — errors (wrong-winner attempt,
  // negative score, match no longer found) are caught and surfaced to the
  // History tab rather than thrown into the console. Returns true/false so
  // HistoryView's edit form knows whether to close itself (success) or
  // stay open with the error visible (rejected) — the form closing itself
  // unconditionally would otherwise hide a rejection's error message the
  // instant it appeared.
  const [historyEditError, setHistoryEditError] = useState("");
  const editHistoryScore = (round, scoreA, scoreB) => {
    setHistoryEditError("");
    try {
      save(editMatchHistoryScore(state, round, scoreA, scoreB));
      return true;
    } catch (e) {
      setHistoryEditError(e.message);
      return false;
    }
  };

  const setExpectedGamesPerPlayer = (count) => {
    const expectedGamesPerPlayer = Math.max(1, Number(count) || 1);
    save({ ...state, expectedGamesPerPlayer });
  };

  // Session Settings dialog (Scorer) — venue name, expected games/player,
  // and (when Progressive Skill Rotation is active) its phase thresholds,
  // all in one save. Deliberately excludes rotationMode: chosen once at
  // Create Session and not editable after, see ROTATION_MODES usage above.
  const updateSessionSettings = (updates) => {
    save({ ...state, ...updates });
  };

  // Progressive Skill Rotation's phase boundaries (% of expected games) —
  // buildPhases (lib/progressiveSkillPhase.js) clamps/orders these, so any
  // input here (partial edits while typing, an inverted pair, etc.) always
  // resolves to a valid non-zero-width zone once it reaches the engine.
  const setProgressiveSkillThresholds = (thresholds) => {
    save({
      ...state,
      progressiveSkillThresholds: {
        ...state.progressiveSkillThresholds,
        ...thresholds,
      },
    });
  };

  const reassignTeams = (courtIdx, teamA, teamB) => {
    const courts = state.courts.map((c, i) => (i === courtIdx ? { ...c, teamA, teamB } : c));
    save({ ...state, courts });
  };

  // swap one player out of a live court for someone else not currently
  // playing — for injuries, phone calls, or other mid-game emergencies.
  // The replacement can come from the waiting queue OR from an upcoming
  // (not-yet-started) matchup — see buildReplacementCandidates. If they're
  // coming from an upcoming matchup, dissolveMatchupIfReserved tears that
  // matchup down first (freeing its other 3 players back to the pool,
  // where the next refreshNextMatchups picks them up again) — a no-op if
  // they were already unassigned. The outgoing player goes back to the
  // waiting queue either way.
  const substitutePlayer = (courtIdx, outgoingId, incomingId) => {
    const before = state.nextMatchups;
    const nextMatchups = dissolveMatchupIfReserved(before, incomingId);
    const court = state.courts[courtIdx];
    const teamA = court.teamA.map((id) => (id === outgoingId ? incomingId : id));
    const teamB = court.teamB.map((id) => (id === outgoingId ? incomingId : id));
    const courts = state.courts.map((c, i) => (i === courtIdx ? { ...c, teamA, teamB } : c));
    const queueIds = [...state.queueIds.filter((id) => id !== incomingId), outgoingId];
    clearOneShotSnapshots();
    const incomingName = state.players[incomingId]?.name || "A player";
    const reason = `${incomingName} was substituted onto Court ${court.number}`;
    const next = noteDissolvedHeldMatchups({ ...state, courts, queueIds, nextMatchups }, before, nextMatchups, reason, {
      players: state.players,
      affectedPlayer: incomingName,
    });
    save(next);
    notifyIfHeldMatchDissolved(next, reason);
  };

  // ---- next-matchup editing (before a matchup is assigned to a court) ----

  const reassignMatchup = (matchupId, teamA, teamB) => {
    const nextMatchups = (state.nextMatchups || []).map((m) =>
      m.id === matchupId ? { ...m, teamA, teamB } : m
    );
    clearOneShotSnapshots();
    save({ ...state, nextMatchups });
  };

  // swaps a player out of an upcoming (not-yet-deployed) matchup for
  // someone else — from the waiting queue, or from a different upcoming
  // matchup (dissolveMatchupIfReserved tears that one down first, same as
  // substitutePlayer; exceptMatchupId keeps it from dissolving the very
  // matchup being edited). Either way both players stay in queueIds the
  // whole time, since neither one leaves the waiting pool.
  const substituteInMatchup = (matchupId, outgoingId, incomingId) => {
    const before = state.nextMatchups;
    const dissolved = dissolveMatchupIfReserved(before, incomingId, matchupId);
    const nextMatchups = dissolved.map((m) => {
      if (m.id !== matchupId) return m;
      const teamA = m.teamA.map((id) => (id === outgoingId ? incomingId : id));
      const teamB = m.teamB.map((id) => (id === outgoingId ? incomingId : id));
      return { ...m, teamA, teamB };
    });
    clearOneShotSnapshots();
    const incomingName = state.players[incomingId]?.name || "A player";
    const reason = `${incomingName} was moved into another matchup`;
    const next = noteDissolvedHeldMatchups({ ...state, nextMatchups }, before, dissolved, reason, {
      players: state.players,
      affectedPlayer: incomingName,
    });
    save(next);
    notifyIfHeldMatchDissolved(next, reason);
  };

  // Organizer-initiated "Move to Queue": pulls a player out of an upcoming
  // matchup they haven't started yet and sends them straight back to the
  // waiting queue, available as an immediate replacement for anyone else.
  // A matchup can't exist with only 3 players, so this dissolves the whole
  // matchup — freeing its other 3 players back to the pool too, exactly
  // like dissolveMatchupIfReserved does for a substitution's incoming
  // player. Nothing here touches completed matches, matchHistory, or
  // player stats — only state.nextMatchups. The next refreshNextMatchups
  // (every save() runs one) automatically rebuilds fresh matchups from the
  // now-larger unassigned pool using the session's active rotation engine,
  // so Progressive Skill Rotation's pairing logic still decides who plays
  // whom next — this doesn't bypass or duplicate it.
  const moveToQueue = (playerId) => {
    const before = state.nextMatchups;
    const nextMatchups = dissolveMatchupIfReserved(before, playerId);
    clearOneShotSnapshots();
    const name = state.players[playerId]?.name || "A player";
    const reason = `${name} was moved to the queue`;
    const next = noteDissolvedHeldMatchups({ ...state, nextMatchups }, before, nextMatchups, reason, {
      players: state.players,
      affectedPlayer: name,
    });
    save(next);
    notifyIfHeldMatchDissolved(next, reason);
  };

  // locking a matchup protects it from "Regenerate matchups" — everything
  // else (Fix teams / Substitute) still works on a locked matchup
  const toggleLockMatchup = (matchupId) => {
    const nextMatchups = (state.nextMatchups || []).map((m) =>
      m.id === matchupId ? { ...m, locked: !m.locked } : m
    );
    save({ ...state, nextMatchups });
  };

  // dissolves every not-locked-and-not-held upcoming matchup and reruns the
  // rotation engine over the full eligible pool — same players, fresh
  // pairings. Remembers what nextMatchups looked like beforehand (this
  // device only) so "Undo regenerate" can put it back. Smart Queue
  // Management's reusable regenerate() (lib/queueManagement.js) does the
  // actual work — this is just its thin UI wrapper (snapshot bookkeeping +
  // save).
  const regenerateMatchups = () => {
    // Stop Queueing — "Regenerate matchups" explicitly builds NEW matchups
    // from scratch, so it's a no-op while queueing is stopped (see the
    // matching disabled state in ScorerView).
    // Start Queuing — same no-op before the organizer has explicitly
    // started queueing (see lib/constants.js's defaultState.queueingStarted)
    // — regenerateQueue below computes its own fresh nextMatchups
    // unconditionally, so this early return is what actually prevents it
    // from leaking a generated matchup through save()'s own gate (which
    // only ever PRESERVES whatever nextMatchups it's handed while gated,
    // rather than clearing it).
    if (state.queueingStopped || state.queueingStarted === false) return;
    const before = state.nextMatchups || [];
    setRegenerateSnapshot(before);
    save(regenerateQueue(state));
  };

  // Stop Queueing — see PROJECT.md/FEATURES.md. A Session Control, not a
  // Session Setting: toggled directly from the Scorer toolbar, takes effect
  // on the very next save() (see save()'s own queueingStopped checks
  // above). Existing live matches and existing nextMatchups entries are
  // never touched by this flip either way.
  const toggleQueueing = () => {
    save({ ...state, queueingStopped: !state.queueingStopped });
  };

  // Start Queuing — see lib/constants.js's defaultState.queueingStarted.
  // A one-way transition: `if (state.queueingStarted)` guards against a
  // double-click/duplicate event re-triggering anything (there's nothing
  // to "restart" — the very next save() below just stops being gated,
  // and refreshNextMatchups runs over queueIds/players exactly as it
  // always has, generating the FIRST batch of matchups from whoever's
  // already checked in — no separate "initialize the queue" step, no
  // rotation-history reset, no touch to any matchmaking engine).
  const startQueuing = () => {
    if (state.queueingStarted) return;
    save({ ...state, queueingStarted: true });
  };

  // restores nextMatchups to how it looked right before the last
  // "Regenerate matchups" click on this device
  const undoRegenerate = () => {
    if (!regenerateSnapshot) return;
    save({ ...state, nextMatchups: regenerateSnapshot });
    setRegenerateSnapshot(null);
  };

  // Smart Queue Management — see PROJECT.md/FEATURES.md. Every handler
  // below is a thin wrapper: the actual logic is a reusable, UI-agnostic
  // function in lib/queueManagement.js (so any future feature — Smart
  // Court Dispatch, voice announcements — can call the exact same
  // functions directly); this layer only adds save() + a facilitator
  // toast, same pattern as changePlayerSkill's wrapper in Sprint 1.

  // Held Match dissolution notice — see PROJECT.md/FEATURES.md. If holding
  // one player, checking them out, changing their skill division,
  // substituting them, moving them to queue, or removing them turns out to
  // have dissolved a matchup that was HELD (a facilitator's deliberate
  // reservation), noteDissolvedHeldMatchups (lib/queueManagement.js) has
  // already recorded it in queueActivityLog by the time `next` gets here —
  // this only handles the UI-specific toast half. Detected by reference
  // equality (a new queueActivityLog array only exists if something was
  // actually logged), so this is a no-op the vast majority of the time
  // (dissolving an ordinary, not-held matchup is expected and silent).
  const notifyIfHeldMatchDissolved = (next, reason) => {
    if (next.queueActivityLog !== state.queueActivityLog) {
      setQueueMsg(`Held Match dissolved: ${reason}.`);
      setTimeout(() => setQueueMsg(""), 4000);
    }
  };

  // Hold Player — temporarily excludes a player from matchmaking. Preserves
  // stats/streaks/payment status; player stays checked in.
  const holdPlayer = (id) => {
    const before = state.nextMatchups;
    let next = holdPlayerAction(state, id);
    if (next === state) return;
    clearOneShotSnapshots();
    const name = state.players[id]?.name || "A player";
    next = noteDissolvedHeldMatchups(next, before, next.nextMatchups, `${name} was held`, {
      players: state.players,
      affectedPlayer: name,
    });
    save(next);
    notifyIfHeldMatchDissolved(next, `${name} was held`);
  };

  // Resume Player — returns a held player to the waiting queue.
  const resumePlayer = (id) => {
    const next = resumePlayerAction(state, id);
    if (next === state) return;
    save(next);
  };

  // Skip Player — a brief "let others go first" nudge (restroom, water,
  // stepping away): moves the player to the back of the waiting queue but
  // they stay fully eligible for matchmaking the whole time — unlike Hold,
  // this never excludes them.
  const skipPlayer = (id) => {
    const p = state.players[id];
    const next = skipPlayerAction(state, id);
    if (next === state) return;
    save(next);
    if (p) {
      setQueueMsg(`${p.name} moved to the back of the queue.`);
      setTimeout(() => setQueueMsg(""), 2500);
    }
  };

  // Hold Match — reserves an upcoming matchup and removes it from
  // automatic court assignment without dissolving it.
  const holdMatch = (matchupId) => {
    save(holdMatchAction(state, matchupId));
  };

  // Resume Match — returns a held matchup to normal automatic assignment,
  // keeping its original queue position (never sent to the back).
  const resumeMatch = (matchupId) => {
    save(resumeMatchAction(state, matchupId));
  };

  // Cancel Match — dissolves the matchup; all of its players are
  // automatically back in the waiting queue (they never left queueIds).
  const cancelMatch = (matchupId) => {
    clearOneShotSnapshots();
    save(cancelMatchAction(state, matchupId));
  };

  // Cancel Live Match — see PROJECT.md/FEATURES.md. The Live Board/Scorer
  // equivalent of Cancel Match, for a match already assigned to a court
  // (a player stepping away for a toilet break, etc.): frees the court and
  // reinserts the same 4 players' exact pairing at the front of Next
  // Matchups, without recording any result. Thin wrapper around the pure
  // cancelLiveMatchAction (lib/queueManagement.js).
  const cancelLiveMatch = (courtNumber) => {
    clearOneShotSnapshots();
    save(cancelLiveMatchAction(state, courtNumber));
  };

  // Partner Requests — thin wrappers around the pure
  // setFixedPartner/clearFixedPartner (lib/queueManagement.js). Facilitator
  // action in the Waiting Players panel; takes effect immediately for that
  // pair, at any point during the session, no session-wide setting needed.
  const setFixedPartner = (playerIdA, playerIdB) => {
    const next = setFixedPartnerAction(state, playerIdA, playerIdB);
    if (next === state) return;
    save(next);
  };
  const clearFixedPartner = (playerId) => {
    const next = clearFixedPartnerAction(state, playerId);
    if (next === state) return;
    save(next);
  };

  // Player Checkout During Open Play — see PROJECT.md. Unlike
  // removePlayer below, this NEVER deletes the player record: history,
  // stats (games/wins/losses/rating), and court/partner/opponent history
  // all stay exactly as they are — only future participation ends. Safe
  // to call whether the player is currently waiting, in an upcoming
  // matchup, or on a live court (mid-match): if they're on a live court,
  // this deliberately does NOT touch that court/teamA/teamB — the match
  // finishes normally, and the player simply won't be requeued into
  // eligibility once it ends (see isEligibleForMatchmaking in
  // lib/utils.js, and the checked-in/waiting render filters below).
  const checkoutPlayer = (id) => {
    const p = state.players[id];
    if (!p || p.status === "CHECKED_OUT") return;
    const players = { ...state.players, [id]: { ...p, status: "CHECKED_OUT", checkedOutAt: Date.now() } };
    const queueIds = state.queueIds.filter((qid) => qid !== id);
    const before = state.nextMatchups || [];
    const nextMatchups = before.filter((m) => !m.teamA.includes(id) && !m.teamB.includes(id));
    clearOneShotSnapshots();
    const reason = `${p.name} checked out`;
    const next = noteDissolvedHeldMatchups({ ...state, players, queueIds, nextMatchups }, before, nextMatchups, reason, {
      players: state.players,
      affectedPlayer: p.name,
    });
    save(next);
    notifyIfHeldMatchDissolved(next, reason);
  };

  // Adaptive Skill Rotation — facilitator manual override. Reusable
  // wrapper around lib/utils.js's changePlayerSkill (a pure function so any
  // screen — Waiting Players panel today, Standings, a future Player
  // Details screen — can call the same action). Never touches a live
  // court: a player mid-match keeps playing untouched, they just re-enter
  // matchmaking under the new skill once they're back in the pool.
  const changePlayerSkill = (id, newSkill) => {
    const before = state.nextMatchups;
    let next = changePlayerSkillAction(state, id, newSkill);
    if (next === state) return;
    clearOneShotSnapshots();
    const entry = next.skillChangeLog[0];
    const reason = `${entry.playerName} ${newSkill === "intermediate" ? "promoted to Intermediate" : "moved to Beginner"}`;
    next = noteDissolvedHeldMatchups(next, before, next.nextMatchups, reason, {
      players: state.players,
      affectedPlayer: entry.playerName,
    });
    save(next);
    setSkillChangeMsg(
      newSkill === "intermediate"
        ? `${entry.playerName} has been promoted to Intermediate.`
        : `${entry.playerName} has been moved to Beginner.`
    );
    setTimeout(() => setSkillChangeMsg(""), 4000);
    notifyIfHeldMatchDissolved(next, reason);
  };

  // Pre-Check-In Skill Correction — one-click roster correction, Check-In
  // tab only, before the player is checked in. Thin wrapper around the
  // pure setPreCheckInSkill (lib/utils.js), mirroring changePlayerSkill's
  // own wrapper shape above but deliberately NOT reusing changePlayerSkill
  // itself — that one logs to skillChangeLog and dissolves reserved
  // matchups, both meaningless (and undesired, per spec) for a player who
  // isn't in the queue yet. No toast, no activity log entry — this is
  // roster data being corrected, not an in-session event.
  // Last Open Play Category — see PROJECT.md. A pre-check-in skill change
  // is also the organizer correcting/updating this player's remembered
  // "current" category for NEXT time, not just today's roster — so it's
  // persisted back to the Player Database's own existing `skill` field
  // (no second category system introduced) the same best-effort way
  // quickAddCheckIn's own Player Database save is: this session's roster
  // is already updated synchronously above regardless of whether the
  // network write below succeeds. A player with no matching Player
  // Database record (fetchPlayer returns null — e.g. an older
  // session-only id) is simply left alone, never fabricated.
  const setPreCheckInSkill = (id, newSkill) => {
    const next = setPreCheckInSkillAction(state, id, newSkill);
    if (next === state) return;
    save(next);
    fetchPlayer(id)
      .then((record) => {
        if (record) return savePlayerRecord({ ...record, skill: newSkill });
      })
      .catch(() => {});
  };

  // Player Payment Tracking — thin wrapper around the pure setPlayerPayment
  // (lib/queueManagement.js). One click marks Paid with the given method,
  // or corrects an already-paid player's method — same handler either way.
  const setPlayerPayment = (id, method) => {
    const next = setPlayerPaymentAction(state, id, method);
    if (next === state) return;
    save(next);
  };

  // permanently removes a waiting (not currently on a live court) player
  // from the session — substitute them off a court first if needed
  const removePlayer = (id) => {
    const p = state.players[id];
    if (!p) return;
    if (!window.confirm(`Remove ${p.name} from this session? This can't be undone.`)) return;
    const players = { ...state.players };
    delete players[id];
    const queueIds = state.queueIds.filter((qid) => qid !== id);
    const before = state.nextMatchups || [];
    const nextMatchups = before.filter((m) => !m.teamA.includes(id) && !m.teamB.includes(id));
    clearOneShotSnapshots();
    const reason = `${p.name} was removed from the session`;
    const next = noteDissolvedHeldMatchups({ ...state, players, queueIds, nextMatchups }, before, nextMatchups, reason, {
      players: state.players,
      affectedPlayer: p.name,
    });
    save(next);
    notifyIfHeldMatchDissolved(next, reason);
  };

  const tryScorerLogin = () => {
    if (pin === SCORER_PIN) {
      setScorerAuthed(true);
      setPinError("");
    } else {
      setPinError("Wrong PIN. Try again.");
    }
  };

  // Dedicated Payment tab — same SCORER_PIN as Scorer, own authed state —
  // see the paymentAuthed comment above.
  const tryPaymentLogin = () => {
    if (paymentPin === SCORER_PIN) {
      setPaymentAuthed(true);
      setPaymentPinError("");
    } else {
      setPaymentPinError("Wrong PIN. Try again.");
    }
  };

  // ---- court management ----

  const addCourt = () => {
    if (state.courts.length >= 8) return;
    const courts = [...state.courts, emptyCourt(state.courts.length + 1)];
    save({ ...state, courts });
  };

  // Dynamic Court Count — see PROJECT.md/FEATURES.md. Thin wrapper around
  // the pure requestRemoveCourt (lib/queueManagement.js): removes the last
  // court immediately if it's idle right now, otherwise queues the removal
  // (pendingCourtRemovals) for save()'s own applyPendingCourtRemovals to
  // complete automatically the instant that court frees up — never loses a
  // live match, never drops below 1 court.
  const removeCourt = () => {
    const next = requestRemoveCourtAction(state);
    if (next === state) return;
    save(next);
  };

  // Court Renaming — thin wrapper around the pure renameCourt (lib/utils.js).
  // A blank name resets the court back to its default "Court {number}"
  // display. Purely a display-label change; never touches `number`,
  // status, teams, or anything matchmaking/dispatch/history rely on.
  const renameCourt = (courtNumber, name) => {
    const next = renameCourtAction(state, courtNumber, name);
    if (next === state) return;
    save(next);
  };

  // Session Analytics Engine (Sprint 4A / V1) — clicking "End session" no
  // longer ends anything immediately. It computes the report from the
  // still-live session state and shows it; the facilitator reviews it,
  // then either confirms (actually ending the session, see
  // confirmEndSession) or cancels (dismissing the report, session
  // continues exactly as before — see cancelEndSession). V1 does not
  // persist the report anywhere; closing/confirming discards it, per this
  // sprint's explicit scope.
  const endSession = () => {
    setSessionReport(computeSessionAnalyticsReport(state));
  };

  const confirmEndSession = async () => {
    // Session Report Persistence (Sprint 4B) — saved BEFORE the live
    // session record is deleted below, under its own registry
    // (SESSION_REPORT_PREFIX, see lib/sessionReportModel.js) so it survives
    // independently of the session it was generated from. A save failure
    // shouldn't block the facilitator from actually ending the session.
    try {
      await saveSessionReport(sessionReport, sessionCode);
    } catch (e) {
      // report save failure shouldn't block ending the session
    }
    try {
      await window.storage.delete(`${STORAGE_PREFIX}${sessionCode}`, true);
    } catch (e) {
      // deletion failure shouldn't block leaving — session data may already be gone
    }
    // All Sessions — see PROJECT.md/FEATURES.md. Best-effort, same as the
    // report save above — a failure here shouldn't block leaving.
    try {
      await recordSessionEnded(sessionCode, { reason: "Ended by facilitator" });
    } catch (e) {
      // index bookkeeping failure shouldn't block leaving
    }
    setSessionReport(null);
    leaveSession();
  };

  const cancelEndSession = () => {
    setSessionReport(null);
  };

  return (
    <div style={screen === "landing" ? styles.appLanding : styles.app}>
      <style>{fontImport}</style>

      {sessionReport && (
        <SessionAnalyticsReport report={sessionReport} onConfirm={confirmEndSession} onCancel={cancelEndSession} />
      )}

      {screen === "landing" && (
        <LandingScreen
          onCreate={() => setScreen("access")}
          onAdmin={() => setScreen("admin")}
          onDeveloper={() => setScreen("developer")}
          onTemplates={() => setScreen("templates")}
          onPlayerPortal={() => setScreen("portal")}
          onLeagues={() => setScreen("leagues")}
          onPlayerManagement={() => setScreen("playerManagement")}
          onVenueManagement={() => setScreen("venueManagement")}
          onCourtBooking={() => setScreen("courtBooking")}
          onRatings={() => setScreen("ratings")}
          onTournamentHistory={() => setScreen("tournamentHistory")}
          onSessionHistory={() => setScreen("sessionHistory")}
          joinCode={joinCode}
          setJoinCode={setJoinCode}
          handleJoin={handleJoin}
          joinError={joinError}
          joining={joining}
        />
      )}

      {screen === "developer" && <DeveloperView onBack={goToLanding} />}

      {screen === "templates" && <TournamentTemplatesScreen onBack={goToLanding} />}

      {screen === "users" && adminAuthed && (
        <UserManagementScreen onBack={() => setScreen("admin")} />
      )}

      {screen === "leagues" && <LeagueManagerScreen onBack={goToLanding} />}

      {screen === "playerManagement" && <PlayerManagementScreen onBack={goToLanding} />}

      {screen === "venueManagement" && <VenueManagementScreen onBack={goToLanding} />}

      {screen === "courtBooking" && <CourtBookingScreen onBack={goToLanding} />}

      {screen === "ratings" && <RatingsScreen onBack={goToLanding} />}

      {screen === "tournamentHistory" && <TournamentHistoryScreen onBack={goToLanding} />}

      {screen === "sessionHistory" && <OpenPlaySessionHistoryScreen onBack={goToLanding} />}

      {screen === "portal" && (
        <PlayerPortalScreen
          initialCode={portalCode}
          onExit={() => {
            setPortalCode(null);
            goToLanding();
          }}
        />
      )}

      {screen === "access" && (
        <AccessScreen
          onBack={goToLanding}
          accessCodeInput={accessCodeInput}
          setAccessCodeInput={setAccessCodeInput}
          submitAccessCode={submitAccessCode}
          accessError={accessError}
          accessChecking={accessChecking}
        />
      )}

      {screen === "admin" && !adminAuthed && (
        <AdminLogin
          onBack={goToLanding}
          adminPin={adminPin}
          setAdminPin={setAdminPin}
          tryAdminLogin={tryAdminLogin}
          adminPinError={adminPinError}
        />
      )}

      {screen === "admin" && adminAuthed && (
        <AdminPanel
          onBack={goToLanding}
          onManageUsers={() => setScreen("users")}
          generateAccessCode={generateAccessCode}
          generating={generating}
          recentCodes={recentCodes}
          lookupInput={lookupInput}
          setLookupInput={setLookupInput}
          lookupCode={lookupCode}
          lookupResult={lookupResult}
          lookupBusy={lookupBusy}
        />
      )}

      {screen === "create" && (
        <CreateSessionScreen
          onStart={startSession}
          onBack={() => setScreen("access")}
          creating={creating}
          createError={createError}
          rotationModes={ROTATION_MODES}
          sessionTypes={SESSION_TYPES}
          tournamentFormats={TOURNAMENT_FORMATS}
        />
      )}

      {screen === "display" && displayCode && (
        <TournamentDisplayView sessionCode={displayCode} onExit={() => setScreen(sessionCode ? "app" : "landing")} />
      )}

      {screen === "openPlayDisplay" && displayCode && (
        <OpenPlayTVModePage sessionCode={displayCode} onExit={() => setScreen(sessionCode ? "app" : "landing")} />
      )}

      {screen === "app" && (() => {
        // Checked-out players must never appear in the Waiting Queue —
        // filtered here (not just at the matchmaking level) so this holds
        // even right after a mid-match checkout's court finishes and the
        // existing requeue logic pushes them back into queueIds.
        const waitingPlayers = state.queueIds
          .map((id) => state.players[id])
          .filter((p) => p && p.status !== "CHECKED_OUT");
        const checkedOutPlayers = Object.values(state.players)
          .filter((p) => p.status === "CHECKED_OUT")
          .sort((a, b) => (b.checkedOutAt || 0) - (a.checkedOutAt || 0));
        const registeredNotHere = getRegisteredNotHere(state.players);
        const openCourtsCount = state.courts.filter((c) => c.status === "open").length;

        return (
          <>
            <header style={styles.header}>
              <div style={styles.headerInner}>
                <div>
                  <div style={styles.kickerOnDark}>{APP_NAME.toUpperCase()} · {FOOTER_TEXT.toUpperCase()}</div>
                  <h1 style={styles.title}>{state.venue}</h1>
                </div>
                <div style={styles.headerStats}>
                  <button style={styles.codePill} onClick={copyCode} title="Copy session code">
                    <span>{codeCopied ? "Copied!" : `CODE ${sessionCode}`}</span>
                    <Copy size={12} strokeWidth={2.5} />
                  </button>
                  <div style={styles.statPill}>
                    <Users size={14} strokeWidth={2.5} />
                    <span>{waitingPlayers.length} waiting</span>
                  </div>
                  <div style={styles.statPill}>
                    <span style={styles.dot(openCourtsCount > 0)} />
                    <span>{openCourtsCount} court{openCourtsCount === 1 ? "" : "s"} open</span>
                  </div>
                  {state.sessionType === "tournament" && (
                    <button
                      style={styles.leaveBtn}
                      onClick={() => {
                        setDisplayCode(sessionCode);
                        setScreen("display");
                      }}
                      aria-label="TV display mode"
                      title="Open TV Display Mode"
                    >
                      <Tv size={14} strokeWidth={2.5} />
                    </button>
                  )}
                  {/* Open Play TV Mode — see PROJECT.md. Mirror-image gating
                      of the tournament button above (openPlay vs.
                      tournament are mutually exclusive sessionType values),
                      so a session only ever shows the one TV button that
                      actually applies to it. */}
                  {state.sessionType !== "tournament" && (
                    <button
                      style={styles.leaveBtn}
                      onClick={() => {
                        setDisplayCode(sessionCode);
                        setScreen("openPlayDisplay");
                      }}
                      aria-label="Open TV Mode"
                      title="📺 Open TV Mode"
                    >
                      <Tv size={14} strokeWidth={2.5} />
                    </button>
                  )}
                  <button style={styles.leaveBtn} onClick={leaveSession} aria-label="switch session" title="Switch session">
                    <LogOut size={14} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
              <nav style={styles.nav}>
                {[
                  { id: "board", label: "Live Board" },
                  { id: "checkin", label: "Check In" },
                  { id: "standings", label: "Standings" },
                  { id: "scorer", label: "Scorer" },
                  { id: "payment", label: "Payment" },
                  { id: "history", label: "History" },
                  ...(state.sessionType === "tournament" ? [{ id: "tournament", label: "Tournament" }] : []),
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setView(t.id)}
                    style={{ ...styles.navBtn, ...(view === t.id ? styles.navBtnActive : {}) }}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
            </header>

            <div style={styles.kitchenLine} />

            <main style={styles.main}>
              {!loaded && <div style={styles.loading}>Loading session…</div>}

              {loaded && view === "board" && <BoardView state={state} />}

              {loaded && view === "checkin" && (
                <CheckinView
                  sessionCode={sessionCode}
                  registeredNotHere={registeredNotHere}
                  checkInExisting={checkInExisting}
                  checkInFromDatabase={checkInFromDatabase}
                  onChangeSkillPreCheckIn={setPreCheckInSkill}
                  nameInput={nameInput}
                  setNameInput={setNameInput}
                  skillInput={skillInput}
                  setSkillInput={setSkillInput}
                  quickAddCheckIn={quickAddCheckIn}
                  checkinMsg={checkinMsg}
                  waitingPlayers={waitingPlayers}
                  players={state.players}
                  nextMatchups={state.nextMatchups || []}
                  photoDataUrl={photoDataUrl}
                  setPhotoDataUrl={setPhotoDataUrl}
                  handlePhotoSelect={handlePhotoSelect}
                  photoBusy={photoBusy}
                />
              )}

              {loaded && view === "standings" && (
                <StandingsView players={state.players} state={state} />
              )}

              {loaded && view === "history" && (
                <HistoryView
                  matchHistory={state.matchHistory || []}
                  players={state.players}
                  canEdit={scorerAuthed}
                  onEditScore={editHistoryScore}
                  editError={historyEditError}
                />
              )}

              {loaded && view === "payment" && !paymentAuthed && (
                <ScorerLogin
                  pin={paymentPin}
                  setPin={setPaymentPin}
                  tryScorerLogin={tryPaymentLogin}
                  pinError={paymentPinError}
                  title="Payment access"
                  subtitle="Enter the scorer PIN to manage player payments."
                  buttonLabel="Enter Payment"
                />
              )}

              {loaded && view === "payment" && paymentAuthed && (
                <PaymentView
                  players={state.players}
                  onSetPayment={setPlayerPayment}
                  paymentStats={derivePaymentStats(state.players)}
                />
              )}

              {loaded && view === "tournament" && state.sessionType === "tournament" && (
                <TournamentDashboardView
                  state={state}
                  tournamentId={state.tournamentId}
                  onGenerate={generateTournamentSchedule}
                  generating={generatingSchedule}
                  generateError={scheduleError}
                />
              )}

              {loaded && view === "scorer" && !scorerAuthed && (
                <ScorerLogin pin={pin} setPin={setPin} tryScorerLogin={tryScorerLogin} pinError={pinError} />
              )}

              {loaded && view === "scorer" && scorerAuthed && (
                <ScorerView
                  state={state}
                  fillCourt={fillCourt}
                  fillAllCourts={fillAllCourts}
                  adjustScore={adjustScore}
                  declareWinner={declareWinner}
                  endMatch={endMatch}
                  reassignTeams={reassignTeams}
                  substitutePlayer={substitutePlayer}
                  reassignMatchup={reassignMatchup}
                  substituteInMatchup={substituteInMatchup}
                  moveToQueue={moveToQueue}
                  setCourtAssignmentMode={setCourtAssignmentMode}
                  setManualCourtPlayer={setManualCourtPlayer}
                  clearManualCourtPlayer={clearManualCourtPlayer}
                  lockManualCourt={lockManualCourt}
                  unlockManualCourt={unlockManualCourt}
                  generateRemainingCourts={generateRemainingCourts}
                  toggleLockMatchup={toggleLockMatchup}
                  regenerateMatchups={regenerateMatchups}
                  canUndoRegenerate={!!regenerateSnapshot}
                  undoRegenerate={undoRegenerate}
                  canUndoLastRound={!!lastRoundSnapshot}
                  undoLastRound={undoLastRound}
                  holdPlayer={holdPlayer}
                  resumePlayer={resumePlayer}
                  skipPlayer={skipPlayer}
                  holdMatch={holdMatch}
                  resumeMatch={resumeMatch}
                  cancelMatch={cancelMatch}
                  cancelLiveMatch={cancelLiveMatch}
                  queueMsg={queueMsg}
                  removePlayer={removePlayer}
                  checkoutPlayer={checkoutPlayer}
                  changePlayerSkill={changePlayerSkill}
                  setFixedPartner={setFixedPartner}
                  clearFixedPartner={clearFixedPartner}
                  skillChangeMsg={skillChangeMsg}
                  skillChangeLog={state.skillChangeLog || []}
                  queueActivityLog={state.queueActivityLog || []}
                  queueActivityLogExpanded={queueActivityLogExpanded}
                  setQueueActivityLogExpanded={setQueueActivityLogExpanded}
                  startDispatchedMatch={startDispatchedMatch}
                  repeatAnnouncement={repeatAnnouncement}
                  courtDispatchSettings={state.courtDispatchSettings || defaultState.courtDispatchSettings}
                  rotationMode={state.rotationMode || "continuous"}
                  expectedGamesPerPlayer={state.expectedGamesPerPlayer || 6}
                  setExpectedGamesPerPlayer={setExpectedGamesPerPlayer}
                  progressiveSkillThresholds={state.progressiveSkillThresholds}
                  setProgressiveSkillThresholds={setProgressiveSkillThresholds}
                  adaptiveSkillThresholds={state.adaptiveSkillThresholds}
                  progressiveSkillPhase={progressiveSkillPhaseFor(
                    state.rotationMode,
                    state.players,
                    state.expectedGamesPerPlayer,
                    state.progressiveSkillThresholds
                  )}
                  matchHistory={state.matchHistory || []}
                  waitingCount={waitingPlayers.length}
                  addCourt={addCourt}
                  removeCourt={removeCourt}
                  renameCourt={renameCourt}
                  endSession={endSession}
                  updateSessionSettings={updateSessionSettings}
                  reservedCourtNumbers={reservedCourtNumbers}
                  matchmakingPriority={state.matchmakingPriority}
                  queueingStopped={state.queueingStopped}
                  onToggleQueueing={toggleQueueing}
                  queueingStarted={state.queueingStarted}
                  onStartQueuing={startQueuing}
                  pendingCourtRemovals={state.pendingCourtRemovals || 0}
                  nextMatchupId={state.nextMatchupId}
                  onSetNextMatchup={setNextMatchup}
                  onAnnounceNextMatchup={announceNextMatchup}
                  announcingNextMatchup={announcingNextMatchup}
                  latecomerPriority={state.latecomerPriority}
                  latecomerPreview={latecomerPreview}
                  onPreviewLatecomerPriority={previewLatecomerPriority}
                  onCancelLatecomerPriority={cancelLatecomerPriority}
                  onApplyLatecomerPriority={applyLatecomerPriority}
                  canUndoLatecomerPriority={!!latecomerPrioritySnapshot}
                  onUndoLatecomerPriority={undoLatecomerPriority}
                  latecomerUndoError={latecomerUndoError}
                />
              )}

              {saveError && <div style={styles.syncError}>{saveError}</div>}
            </main>

            <footer style={styles.footer}>
              Scores sync live across everyone viewing this session. Share code{" "}
              <strong>{sessionCode}</strong> so others can join this session.
              <br />
              {FOOTER_TEXT}
            </footer>
          </>
        );
      })()}
    </div>
  );
}

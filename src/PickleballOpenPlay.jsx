import { useState, useEffect, useCallback, useRef } from "react";
import { Copy, LogOut, Users } from "lucide-react";
import { styles, fontImport } from "./styles.js";
import { ACCESS_PREFIX, ADMIN_PIN, ROTATION_MODES, SCORER_PIN, STORAGE_PREFIX, defaultState, emptyCourt } from "./lib/constants.js";
import {
  findUniqueAccessCode,
  findUniqueSessionCode,
  getRotationEngine,
  recordRotationHistory,
  refreshNextMatchups,
  regenerateNextMatchups,
  dissolveMatchupIfReserved,
  uid,
  resizeImageToAvatar,
} from "./lib/utils.js";
import { resolveWinnerPoolMatch, isPoolingRotation, getPairPartnerIndex } from "./lib/winnerPoolRound.js";
import { progressiveSkillPhaseFor } from "./lib/progressiveSkillPhase.js";
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
import DeveloperView from "./components/DeveloperView.jsx";

export default function PickleballOpenPlay() {
  const [screen, setScreen] = useState("landing"); // landing | access | create | admin | developer | app
  const [sessionCode, setSessionCode] = useState(null);
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
  const [view, setView] = useState("board"); // board | checkin | standings | scorer
  const [scorerAuthed, setScorerAuthed] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [skillInput, setSkillInput] = useState("beginner");
  const [photoDataUrl, setPhotoDataUrl] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [checkinMsg, setCheckinMsg] = useState("");
  const [saveError, setSaveError] = useState("");
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
  const clearOneShotSnapshots = () => {
    setRegenerateSnapshot(null);
    setLastRoundSnapshot(null);
  };
  const stateRef = useRef(state);
  stateRef.current = state;

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
    async (next) => {
      if (!sessionCode) return;
      // recomputed on every save: appends any newly-possible matchups from
      // players not already locked into one, leaving existing (possibly
      // scorer-edited) matchups untouched — see refreshNextMatchups. Which
      // engine builds them depends on the session's rotation mode; in
      // Progressive Skill Rotation, the current phase also shapes pairing
      // (see progressiveSkillPhaseFor below).
      const engine = getRotationEngine(next.rotationMode);
      const phase = progressiveSkillPhaseFor(
        next.rotationMode,
        next.players,
        next.expectedGamesPerPlayer,
        next.progressiveSkillThresholds
      );
      const withMatchups = {
        ...next,
        nextMatchups: refreshNextMatchups(next.queueIds, next.players, next.nextMatchups || [], engine, phase),
      };
      const withStamp = { ...withMatchups, updatedAt: Date.now() };
      setState(withStamp);
      try {
        await window.storage.set(`${STORAGE_PREFIX}${sessionCode}`, JSON.stringify(withStamp), true);
        setSaveError("");
      } catch (e) {
        setSaveError("Couldn't sync — check your connection.");
      }
    },
    [sessionCode]
  );

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

  const startSession = async (venue, courtsCount, roster) => {
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
          skipped: false,
          games: 0,
          wins: 0,
          losses: 0,
          streak: 0,
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
        };
      });
      const courts = Array.from({ length: courtsCount }, (_, i) => emptyCourt(i + 1));
      const initial = {
        venue,
        courts,
        players,
        queueIds: [],
        nextMatchups: [],
        matchHistory: [],
        updatedAt: Date.now(),
      };
      await window.storage.set(`${STORAGE_PREFIX}${code}`, JSON.stringify(initial), true);

      // consume the access code now that a session was actually created —
      // if the organizer backed out earlier, the code stays unused/reusable
      if (validatedAccessCode) {
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

  const leaveSession = () => {
    setScreen("landing");
    setSessionCode(null);
    setState(defaultState);
    setLoaded(false);
    setView("board");
    setScorerAuthed(false);
    setPin("");
    setPinError("");
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
    const players = { ...state.players, [id]: { ...p, checkedIn: true } };
    const queueIds = [...state.queueIds, id];
    clearOneShotSnapshots(); // a snapshot from before this check-in would silently un-check them
    save({ ...state, players, queueIds });
    setCheckinMsg(`${p.name} is in the queue.`);
    setTimeout(() => setCheckinMsg(""), 2500);
  };

  const quickAddCheckIn = () => {
    const name = nameInput.trim();
    if (!name) return;
    const id = uid();
    const players = {
      ...state.players,
      [id]: {
        id,
        name,
        skill: skillInput === "intermediate" ? "intermediate" : "beginner",
        checkedIn: true,
        skipped: false,
        games: 0,
        wins: 0,
        losses: 0,
        streak: 0,
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
  // the spot, so what the scorer reviewed is exactly what gets deployed
  const fillCourt = (courtIdx) => {
    const court = state.courts[courtIdx];
    if (court.status !== "open") return;
    const [nextMatch, ...restMatchups] = state.nextMatchups || [];
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
      if (c.status !== "open") return c;
      const [nextMatch, ...rest] = remainingMatchups;
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
    teamA.forEach((id) => {
      if (!players[id]) return;
      const p = players[id];
      players[id] = {
        ...p,
        games: (p.games || 0) + 1,
        wins: (p.wins || 0) + (aWon ? 1 : 0),
        losses: (p.losses || 0) + (bWon ? 1 : 0),
        streak: aWon ? (p.streak || 0) + 1 : 0,
        lastResult: aWon ? "win" : bWon ? "loss" : p.lastResult,
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
        lastResult: bWon ? "win" : aWon ? "loss" : p.lastResult,
        pointsFor: (p.pointsFor || 0) + scoreB,
        pointsAgainst: (p.pointsAgainst || 0) + scoreA,
      };
    });
    // partner/opponent/court history feeds the rotation engine's recency
    // scoring for the next round — see recordRotationHistory
    players = recordRotationHistory(players, teamA, teamB, court.number);

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
      save({ ...state, courts, players, queueIds, nextMatchups, matchHistory });
      return;
    }

    const queueIds = [...state.queueIds, ...playedIds];
    const courts = state.courts.map((c, i) => (i === courtIdx ? emptyCourt(c.number) : c));
    setRegenerateSnapshot(null); // stale after this round's requeue
    setLastRoundSnapshot(preMatchState);
    save({ ...state, courts, players, queueIds, matchHistory });
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

  const setRotationMode = (mode) => {
    save({ ...state, rotationMode: mode });
  };

  const setExpectedGamesPerPlayer = (count) => {
    const expectedGamesPerPlayer = Math.max(1, Number(count) || 1);
    save({ ...state, expectedGamesPerPlayer });
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
    const nextMatchups = dissolveMatchupIfReserved(state.nextMatchups, incomingId);
    const court = state.courts[courtIdx];
    const teamA = court.teamA.map((id) => (id === outgoingId ? incomingId : id));
    const teamB = court.teamB.map((id) => (id === outgoingId ? incomingId : id));
    const courts = state.courts.map((c, i) => (i === courtIdx ? { ...c, teamA, teamB } : c));
    const queueIds = [...state.queueIds.filter((id) => id !== incomingId), outgoingId];
    clearOneShotSnapshots();
    save({ ...state, courts, queueIds, nextMatchups });
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
    const dissolved = dissolveMatchupIfReserved(state.nextMatchups, incomingId, matchupId);
    const nextMatchups = dissolved.map((m) => {
      if (m.id !== matchupId) return m;
      const teamA = m.teamA.map((id) => (id === outgoingId ? incomingId : id));
      const teamB = m.teamB.map((id) => (id === outgoingId ? incomingId : id));
      return { ...m, teamA, teamB };
    });
    clearOneShotSnapshots();
    save({ ...state, nextMatchups });
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
    const nextMatchups = dissolveMatchupIfReserved(state.nextMatchups, playerId);
    clearOneShotSnapshots();
    save({ ...state, nextMatchups });
  };

  // locking a matchup protects it from "Regenerate matchups" — everything
  // else (Fix teams / Substitute) still works on a locked matchup
  const toggleLockMatchup = (matchupId) => {
    const nextMatchups = (state.nextMatchups || []).map((m) =>
      m.id === matchupId ? { ...m, locked: !m.locked } : m
    );
    save({ ...state, nextMatchups });
  };

  // dissolves every not-locked upcoming matchup and reruns the rotation
  // engine over the full eligible pool — same players, fresh pairings.
  // Remembers what nextMatchups looked like beforehand (this device only)
  // so "Undo regenerate" can put it back.
  const regenerateMatchups = () => {
    const before = state.nextMatchups || [];
    const engine = getRotationEngine(state.rotationMode);
    const phase = progressiveSkillPhaseFor(
      state.rotationMode,
      state.players,
      state.expectedGamesPerPlayer,
      state.progressiveSkillThresholds
    );
    const nextMatchups = regenerateNextMatchups(state.queueIds, state.players, before, engine, phase);
    setRegenerateSnapshot(before);
    save({ ...state, nextMatchups });
  };

  // restores nextMatchups to how it looked right before the last
  // "Regenerate matchups" click on this device
  const undoRegenerate = () => {
    if (!regenerateSnapshot) return;
    save({ ...state, nextMatchups: regenerateSnapshot });
    setRegenerateSnapshot(null);
  };

  // sitting a waiting player out: they stay visible in the waiting list but
  // the rotation engine skips them when building new matchups
  const toggleSkipPlayer = (id) => {
    const p = state.players[id];
    if (!p) return;
    const players = { ...state.players, [id]: { ...p, skipped: !p.skipped } };
    clearOneShotSnapshots();
    save({ ...state, players });
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
    const nextMatchups = (state.nextMatchups || []).filter(
      (m) => !m.teamA.includes(id) && !m.teamB.includes(id)
    );
    clearOneShotSnapshots();
    save({ ...state, players, queueIds, nextMatchups });
  };

  const tryScorerLogin = () => {
    if (pin === SCORER_PIN) {
      setScorerAuthed(true);
      setPinError("");
    } else {
      setPinError("Wrong PIN. Try again.");
    }
  };

  // ---- court management ----

  const addCourt = () => {
    if (state.courts.length >= 8) return;
    const courts = [...state.courts, emptyCourt(state.courts.length + 1)];
    save({ ...state, courts });
  };

  const removeCourt = () => {
    const last = state.courts[state.courts.length - 1];
    if (state.courts.length <= 1 || !last || last.status !== "open") return;
    const courts = state.courts.slice(0, -1);
    save({ ...state, courts });
  };

  const endSession = async () => {
    if (!window.confirm("End this session for everyone? This can't be undone.")) return;
    try {
      await window.storage.delete(`${STORAGE_PREFIX}${sessionCode}`, true);
    } catch (e) {
      // deletion failure shouldn't block leaving — session data may already be gone
    }
    leaveSession();
  };

  return (
    <div style={styles.app}>
      <style>{fontImport}</style>

      {screen === "landing" && (
        <LandingScreen
          onCreate={() => setScreen("access")}
          onAdmin={() => setScreen("admin")}
          onDeveloper={() => setScreen("developer")}
          joinCode={joinCode}
          setJoinCode={setJoinCode}
          handleJoin={handleJoin}
          joinError={joinError}
          joining={joining}
        />
      )}

      {screen === "developer" && <DeveloperView onBack={goToLanding} />}

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
        />
      )}

      {screen === "app" && (() => {
        const waitingPlayers = state.queueIds.map((id) => state.players[id]).filter(Boolean);
        const registeredNotHere = Object.values(state.players).filter((p) => !p.checkedIn);
        const openCourtsCount = state.courts.filter((c) => c.status === "open").length;

        return (
          <>
            <header style={styles.header}>
              <div style={styles.headerInner}>
                <div>
                  <div style={styles.kickerOnDark}>OPEN PLAY MANAGER - POWERED BY CONNECTPH</div>
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
                  registeredNotHere={registeredNotHere}
                  checkInExisting={checkInExisting}
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

              {loaded && view === "standings" && <StandingsView players={state.players} />}

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
                  toggleLockMatchup={toggleLockMatchup}
                  regenerateMatchups={regenerateMatchups}
                  canUndoRegenerate={!!regenerateSnapshot}
                  undoRegenerate={undoRegenerate}
                  canUndoLastRound={!!lastRoundSnapshot}
                  undoLastRound={undoLastRound}
                  toggleSkipPlayer={toggleSkipPlayer}
                  removePlayer={removePlayer}
                  rotationMode={state.rotationMode || "continuous"}
                  setRotationMode={setRotationMode}
                  rotationModes={ROTATION_MODES}
                  expectedGamesPerPlayer={state.expectedGamesPerPlayer || 6}
                  setExpectedGamesPerPlayer={setExpectedGamesPerPlayer}
                  progressiveSkillThresholds={state.progressiveSkillThresholds}
                  setProgressiveSkillThresholds={setProgressiveSkillThresholds}
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
                  endSession={endSession}
                />
              )}

              {saveError && <div style={styles.syncError}>{saveError}</div>}
            </main>

            <footer style={styles.footer}>
              Scores sync live across everyone viewing this session. Share code{" "}
              <strong>{sessionCode}</strong> so others can join this session.
            </footer>
          </>
        );
      })()}
    </div>
  );
}

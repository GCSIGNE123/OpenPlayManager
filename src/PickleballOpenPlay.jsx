import { useState, useEffect, useCallback, useRef } from "react";
import { Copy, LogOut, Users } from "lucide-react";
import { styles, fontImport } from "./styles.js";
import { ACCESS_PREFIX, ADMIN_PIN, SCORER_PIN, STORAGE_PREFIX, defaultState, emptyCourt } from "./lib/constants.js";
import { findUniqueAccessCode, findUniqueSessionCode, refreshNextMatchups, uid, resizeImageToAvatar } from "./lib/utils.js";
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

export default function PickleballOpenPlay() {
  const [screen, setScreen] = useState("landing"); // landing | access | create | admin | app
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
      // scorer-edited) matchups untouched — see refreshNextMatchups
      const withMatchups = {
        ...next,
        nextMatchups: refreshNextMatchups(next.queueIds, next.players, next.nextMatchups || []),
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
          games: 0,
          wins: 0,
          losses: 0,
          streak: 0,
          lastResult: null,
          lastPartnerId: null,
          pointsFor: 0,
          pointsAgainst: 0,
        };
      });
      const courts = Array.from({ length: courtsCount }, (_, i) => emptyCourt(i + 1));
      const initial = { venue, courts, players, queueIds: [], nextMatchups: [], updatedAt: Date.now() };
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
        games: 0,
        wins: 0,
        losses: 0,
        streak: 0,
        lastResult: null,
        lastPartnerId: null,
        pointsFor: 0,
        pointsAgainst: 0,
        photo: photoDataUrl || null,
      },
    };
    const queueIds = [...state.queueIds, id];
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

  const endMatch = (courtIdx) => {
    const court = state.courts[courtIdx];
    const { teamA, teamB, scoreA, scoreB } = court;
    const playedIds = [...teamA, ...teamB];
    const players = { ...state.players };
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
        // remembered so the next match can avoid reuniting the same pair —
        // see pairTeamsAvoidingRematch
        lastPartnerId: teamA.find((otherId) => otherId !== id) ?? p.lastPartnerId,
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
        lastPartnerId: teamB.find((otherId) => otherId !== id) ?? p.lastPartnerId,
        pointsFor: (p.pointsFor || 0) + scoreB,
        pointsAgainst: (p.pointsAgainst || 0) + scoreA,
      };
    });
    const queueIds = [...state.queueIds, ...playedIds];
    const courts = state.courts.map((c, i) => (i === courtIdx ? emptyCourt(c.number) : c));
    save({ ...state, courts, players, queueIds });
  };

  const reassignTeams = (courtIdx, teamA, teamB) => {
    const courts = state.courts.map((c, i) => (i === courtIdx ? { ...c, teamA, teamB } : c));
    save({ ...state, courts });
  };

  // swap one player out of a live court for someone from the waiting queue —
  // for injuries, phone calls, or other mid-game emergencies. The outgoing
  // player automatically goes back to the waiting queue.
  const substitutePlayer = (courtIdx, outgoingId, incomingId) => {
    const court = state.courts[courtIdx];
    const teamA = court.teamA.map((id) => (id === outgoingId ? incomingId : id));
    const teamB = court.teamB.map((id) => (id === outgoingId ? incomingId : id));
    const courts = state.courts.map((c, i) => (i === courtIdx ? { ...c, teamA, teamB } : c));
    const queueIds = [...state.queueIds.filter((id) => id !== incomingId), outgoingId];
    save({ ...state, courts, queueIds });
  };

  // ---- next-matchup editing (before a matchup is assigned to a court) ----

  const reassignMatchup = (matchupId, teamA, teamB) => {
    const nextMatchups = (state.nextMatchups || []).map((m) =>
      m.id === matchupId ? { ...m, teamA, teamB } : m
    );
    save({ ...state, nextMatchups });
  };

  // swaps a player out of an upcoming (not-yet-deployed) matchup for someone
  // else still waiting — both players simply stay in the same queueIds the
  // whole time, since neither one leaves the waiting queue
  const substituteInMatchup = (matchupId, outgoingId, incomingId) => {
    const nextMatchups = (state.nextMatchups || []).map((m) => {
      if (m.id !== matchupId) return m;
      const teamA = m.teamA.map((id) => (id === outgoingId ? incomingId : id));
      const teamB = m.teamB.map((id) => (id === outgoingId ? incomingId : id));
      return { ...m, teamA, teamB };
    });
    save({ ...state, nextMatchups });
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
          joinCode={joinCode}
          setJoinCode={setJoinCode}
          handleJoin={handleJoin}
          joinError={joinError}
          joining={joining}
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
                  <div style={styles.kicker}>OPEN PLAY · ORMOC CITY, LEYTE</div>
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
                  endMatch={endMatch}
                  reassignTeams={reassignTeams}
                  substitutePlayer={substitutePlayer}
                  reassignMatchup={reassignMatchup}
                  substituteInMatchup={substituteInMatchup}
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

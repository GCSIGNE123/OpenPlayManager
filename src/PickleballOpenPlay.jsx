import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  Minus,
  Shuffle,
  Users,
  LogIn,
  Lock,
  Unlock,
  Trophy,
  RotateCcw,
  Check,
  Camera,
  X,
  Flame,
  Repeat,
  Copy,
  ArrowLeft,
  LogOut,
} from "lucide-react";

const STORAGE_PREFIX = "opl-session-";
const ACCESS_PREFIX = "opl-access-";
const SCORER_PIN = "1234"; // demo-only gate — a real deploy would use real umpire accounts
const ADMIN_PIN = "918273"; // demo-only gate — the organizer's PIN for generating access codes
const POLL_MS = 3000;
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L — easy to read aloud

const emptyCourt = (number) => ({
  number,
  status: "open", // 'open' | 'live' | 'finished'
  teamA: [],
  teamB: [],
  scoreA: 0,
  scoreB: 0,
});

const defaultState = {
  venue: "",
  courts: [],
  players: {}, // id -> { id, name, photo, checkedIn, games, wins, losses, streak, lastResult, pointsFor, pointsAgainst }
  queueIds: [],
  updatedAt: 0,
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function generateRandomCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// shrink a photo to a small square thumbnail so many player photos stay well
// under the shared-session storage limit
function resizeImageToAvatar(file, size = 128) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Couldn't load image"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

const AVATAR_COLORS = ["#1F5C43", "#E85D4C", "#8A6D3B", "#3E6B8A", "#7A4C8A", "#3D7A5C"];
function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function sortByGames(ids, players) {
  return [...ids].sort((a, b) => (players[a]?.games || 0) - (players[b]?.games || 0));
}

// picks the next 4 players for a court: prefers a full group who just won
// their last match, then a full group who just lost, so winners keep
// playing winners and losers keep playing losers — falls back to whoever's
// waited longest (by fewest games played) when there aren't 4 of a kind yet
function pickNextGroup(queueIds, players) {
  const winners = queueIds.filter((id) => players[id]?.lastResult === "win");
  const losers = queueIds.filter((id) => players[id]?.lastResult === "loss");
  if (winners.length >= 4) return sortByGames(winners, players).slice(0, 4);
  if (losers.length >= 4) return sortByGames(losers, players).slice(0, 4);
  return sortByGames(queueIds, players).slice(0, 4);
}

// tries a handful of random codes and returns the first one not already in
// use — collisions are astronomically unlikely with a 6-char code, but a
// quick check costs nothing
async function findUniqueSessionCode() {
  for (let i = 0; i < 6; i++) {
    const code = generateRandomCode(6);
    try {
      const existing = await window.storage.get(`${STORAGE_PREFIX}${code}`, true);
      if (!existing) return code;
    } catch (e) {
      return code; // get() throws when the key doesn't exist — code is free
    }
  }
  return generateRandomCode(6);
}

// access codes are longer (8 chars) than session codes (6) so the two are
// never visually confused — an access code is a paid unlock, a session
// code is just "which open play am I looking at"
async function findUniqueAccessCode() {
  for (let i = 0; i < 6; i++) {
    const code = generateRandomCode(8);
    try {
      const existing = await window.storage.get(`${ACCESS_PREFIX}${code}`, true);
      if (!existing) return code;
    } catch (e) {
      return code;
    }
  }
  return generateRandomCode(8);
}

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
      const withStamp = { ...next, updatedAt: Date.now() };
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
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
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
          checkedIn: false,
          games: 0,
          wins: 0,
          losses: 0,
          streak: 0,
          lastResult: null,
          pointsFor: 0,
          pointsAgainst: 0,
        };
      });
      const courts = Array.from({ length: courtsCount }, (_, i) => emptyCourt(i + 1));
      const initial = { venue, courts, players, queueIds: [], updatedAt: Date.now() };
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
        checkedIn: true,
        games: 0,
        wins: 0,
        losses: 0,
        streak: 0,
        lastResult: null,
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

  const fillCourt = (courtIdx) => {
    const court = state.courts[courtIdx];
    if (court.status !== "open") return;
    if (state.queueIds.length < 4) return;

    const chosen = pickNextGroup(state.queueIds, state.players);
    const remaining = state.queueIds.filter((id) => !chosen.includes(id));
    const [p1, p2, p3, p4] = shuffle(chosen);

    const courts = state.courts.map((c, i) =>
      i === courtIdx
        ? { ...c, status: "live", teamA: [p1, p2], teamB: [p3, p4], scoreA: 0, scoreB: 0 }
        : c
    );
    save({ ...state, courts, queueIds: remaining });
  };

  const fillAllCourts = () => {
    let queueIds = [...state.queueIds];
    const players = state.players;
    const courts = state.courts.map((c) => {
      if (c.status !== "open" || queueIds.length < 4) return c;
      const chosen = pickNextGroup(queueIds, players);
      queueIds = queueIds.filter((id) => !chosen.includes(id));
      const [p1, p2, p3, p4] = shuffle(chosen);
      return { ...c, status: "live", teamA: [p1, p2], teamB: [p3, p4], scoreA: 0, scoreB: 0 };
    });
    save({ ...state, courts, queueIds });
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
    const queueIds = [...state.queueIds, ...playedIds];
    const courts = state.courts.map((c, i) => (i === courtIdx ? emptyCourt(c.number) : c));
    save({ ...state, courts, players, queueIds });
  };

  const reassignTeams = (courtIdx, teamA, teamB) => {
    const courts = state.courts.map((c, i) => (i === courtIdx ? { ...c, teamA, teamB } : c));
    save({ ...state, courts });
  };

  // swap one player out of a live court for someone from the waiting queue —
  // for injuries, phone calls, or other mid-game emergencies
  const substitutePlayer = (courtIdx, outgoingId, incomingId, returnOutgoingToQueue) => {
    const court = state.courts[courtIdx];
    const teamA = court.teamA.map((id) => (id === outgoingId ? incomingId : id));
    const teamB = court.teamB.map((id) => (id === outgoingId ? incomingId : id));
    const courts = state.courts.map((c, i) => (i === courtIdx ? { ...c, teamA, teamB } : c));
    let queueIds = state.queueIds.filter((id) => id !== incomingId);
    if (returnOutgoingToQueue) queueIds = [...queueIds, outgoingId];
    save({ ...state, courts, queueIds });
  };

  const tryScorerLogin = () => {
    if (pin === SCORER_PIN) {
      setScorerAuthed(true);
      setPinError("");
    } else {
      setPinError("Wrong PIN. Try again.");
    }
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

              {loaded && view === "board" && <BoardView state={state} waitingPlayers={waitingPlayers} />}

              {loaded && view === "checkin" && (
                <CheckinView
                  registeredNotHere={registeredNotHere}
                  checkInExisting={checkInExisting}
                  nameInput={nameInput}
                  setNameInput={setNameInput}
                  quickAddCheckIn={quickAddCheckIn}
                  checkinMsg={checkinMsg}
                  waitingPlayers={waitingPlayers}
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
                  waitingCount={waitingPlayers.length}
                />
              )}

              {saveError && <div style={styles.syncError}>{saveError}</div>}
            </main>

            <footer style={styles.footer}>
              Prototype — scores sync across everyone viewing this app roughly every {POLL_MS / 1000}s. Share code{" "}
              <strong>{sessionCode}</strong> so others can join this session.
            </footer>
          </>
        );
      })()}
    </div>
  );
}

function LandingScreen({ onCreate, onAdmin, joinCode, setJoinCode, handleJoin, joinError, joining }) {
  return (
    <div style={styles.landingWrap}>
      <div style={styles.landingHero}>
        <div style={styles.kicker}>ORMOC CITY, LEYTE</div>
        <h1 style={styles.landingTitle}>Pickleball Open Play Manager</h1>
        <p style={styles.landingSub}>
          Run check-ins, auto-matchmaking, and live scores for your open play sessions.
        </p>
      </div>
      <div style={styles.landingCards}>
        <div style={styles.landingCard}>
          <h2 style={styles.landingCardTitle}>Start a new session</h2>
          <p style={styles.landingCardText}>
            You'll need an access code from your organizer to set one up.
          </p>
          <button style={styles.primaryBtn} onClick={onCreate}>
            <Plus size={16} strokeWidth={2.5} />
            Create session
          </button>
        </div>
        <div style={styles.landingCard}>
          <h2 style={styles.landingCardTitle}>Join a session</h2>
          <p style={styles.landingCardText}>Enter the 6-character code shared by your session organizer.</p>
          <div style={styles.checkinRow}>
            <input
              style={{ ...styles.input, ...styles.codeInput }}
              placeholder="ABC123"
              value={joinCode}
              maxLength={6}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
            <button
              style={{ ...styles.primaryBtn, ...(joining ? styles.btnDisabled : {}) }}
              onClick={handleJoin}
              disabled={joining}
            >
              <LogIn size={16} strokeWidth={2.5} />
              {joining ? "Joining…" : "Join"}
            </button>
          </div>
          {joinError && <div style={styles.pinError}>{joinError}</div>}
        </div>
      </div>
      <button style={styles.adminLink} onClick={onAdmin}>
        Organizer? Manage access codes →
      </button>
    </div>
  );
}

function AccessScreen({ onBack, accessCodeInput, setAccessCodeInput, submitAccessCode, accessError, accessChecking }) {
  return (
    <div style={styles.landingWrap}>
      <button style={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>
      <div style={styles.landingHero}>
        <div style={styles.kicker}>ACCESS REQUIRED</div>
        <h1 style={styles.landingTitle}>Enter your access code</h1>
        <p style={styles.landingSub}>
          This code comes from your session organizer after payment is confirmed.
        </p>
      </div>
      <div style={styles.landingCard}>
        <div style={styles.checkinRow}>
          <input
            style={{ ...styles.input, ...styles.codeInput }}
            placeholder="ABCD2345"
            value={accessCodeInput}
            maxLength={8}
            onChange={(e) => setAccessCodeInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && submitAccessCode()}
          />
          <button
            style={{ ...styles.primaryBtn, ...(accessChecking ? styles.btnDisabled : {}) }}
            onClick={submitAccessCode}
            disabled={accessChecking}
          >
            <Unlock size={16} strokeWidth={2.5} />
            {accessChecking ? "Checking…" : "Continue"}
          </button>
        </div>
        {accessError && <div style={styles.pinError}>{accessError}</div>}
      </div>
    </div>
  );
}

function AdminLogin({ onBack, adminPin, setAdminPin, tryAdminLogin, adminPinError }) {
  return (
    <div style={styles.loginWrap}>
      <button style={{ ...styles.backBtn, alignSelf: "flex-start" }} onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>
      <Lock size={28} strokeWidth={1.75} color="var(--ink)" />
      <h2 style={styles.loginTitle}>Organizer access</h2>
      <p style={styles.loginSub}>Enter your admin PIN to generate and manage access codes.</p>
      <input
        style={styles.pinInput}
        type="password"
        inputMode="numeric"
        placeholder="PIN"
        value={adminPin}
        onChange={(e) => setAdminPin(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && tryAdminLogin()}
      />
      <button style={styles.primaryBtn} onClick={tryAdminLogin}>
        <Unlock size={16} strokeWidth={2.5} />
        Enter as organizer
      </button>
      {adminPinError && <div style={styles.pinError}>{adminPinError}</div>}
      <p style={styles.loginNote}>Demo PIN: 918273 — a real deploy would use a real owner login.</p>
    </div>
  );
}

function AdminPanel({
  onBack,
  generateAccessCode,
  generating,
  recentCodes,
  lookupInput,
  setLookupInput,
  lookupCode,
  lookupResult,
  lookupBusy,
}) {
  const [copiedCode, setCopiedCode] = useState(null);

  const copy = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1500);
    } catch (e) {
      // clipboard access can fail silently — code is still visible on screen
    }
  };

  return (
    <div style={styles.createWrap}>
      <button style={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>

      <SectionLabel>Sell access</SectionLabel>
      <p style={styles.editHint}>
        Once payment is received, generate a code and send it to the buyer. Each code unlocks exactly one new
        session and can't be reused after that.
      </p>
      <button
        style={{ ...styles.primaryBtn, ...(generating ? styles.btnDisabled : {}) }}
        onClick={generateAccessCode}
        disabled={generating}
      >
        <Plus size={16} strokeWidth={2.5} />
        {generating ? "Generating…" : "Generate new access code"}
      </button>

      {recentCodes.length > 0 && (
        <>
          <SectionLabel>Recently generated ({recentCodes.length})</SectionLabel>
          <ul style={styles.rosterList}>
            {recentCodes.map((r) => (
              <li key={r.code} style={styles.rosterItem}>
                <span style={styles.adminCode}>{r.code}</span>
                <span style={styles.resultTag(r.usedAt ? "loss" : "win")}>
                  {r.usedAt ? "USED" : "UNUSED"}
                </span>
                <button style={styles.checkInTapBtn} onClick={() => copy(r.code)}>
                  <Copy size={12} strokeWidth={2.5} />
                  {copiedCode === r.code ? "Copied" : "Copy"}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <SectionLabel>Check a code's status</SectionLabel>
      <div style={styles.checkinRow}>
        <input
          style={{ ...styles.input, ...styles.codeInput }}
          placeholder="ABCD2345"
          value={lookupInput}
          maxLength={8}
          onChange={(e) => setLookupInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && lookupCode()}
        />
        <button
          style={{ ...styles.primaryBtn, ...(lookupBusy ? styles.btnDisabled : {}) }}
          onClick={lookupCode}
          disabled={lookupBusy}
        >
          {lookupBusy ? "Checking…" : "Check"}
        </button>
      </div>
      {lookupResult && (
        <p style={styles.editHint}>
          {lookupResult.notFound
            ? `${lookupResult.code} doesn't exist.`
            : `${lookupResult.code} is ${lookupResult.usedAt ? "already used" : "still unused"}.`}
        </p>
      )}
    </div>
  );
}

function CreateSessionScreen({ onStart, onBack, creating, createError }) {
  const [venue, setVenue] = useState("Ormoc City Pickleball — Open Play");
  const [courts, setCourts] = useState(4);
  const [roster, setRoster] = useState([]);
  const [nameInput, setNameInput] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  const handlePhotoSelect = async (file) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await resizeImageToAvatar(file);
      setPhotoDataUrl(dataUrl);
    } catch (e) {
      // photo is optional
    } finally {
      setPhotoBusy(false);
    }
  };

  const addPlayer = () => {
    const name = nameInput.trim();
    if (!name) return;
    setRoster((r) => [...r, { id: uid(), name, photo: photoDataUrl || null }]);
    setNameInput("");
    setPhotoDataUrl(null);
  };

  const removePlayer = (id) => setRoster((r) => r.filter((p) => p.id !== id));
  const adjustCourts = (delta) => setCourts((c) => Math.min(8, Math.max(1, c + delta)));
  const canStart = venue.trim().length > 0 && courts >= 1 && !creating;

  return (
    <div style={styles.createWrap}>
      <button style={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>

      <SectionLabel>1. Name your open play</SectionLabel>
      <input
        style={styles.input}
        value={venue}
        onChange={(e) => setVenue(e.target.value)}
        placeholder="e.g. Ormoc City Saturday Open Play"
      />

      <SectionLabel>2. Number of courts</SectionLabel>
      <div style={styles.courtStepper}>
        <button style={styles.scoreBtn} onClick={() => adjustCourts(-1)} aria-label="fewer courts">
          <Minus size={14} strokeWidth={3} />
        </button>
        <span style={styles.courtStepperCount}>{courts}</span>
        <button style={styles.scoreBtn} onClick={() => adjustCourts(1)} aria-label="more courts">
          <Plus size={14} strokeWidth={3} />
        </button>
      </div>

      <SectionLabel>3. Register players joining today ({roster.length})</SectionLabel>
      <p style={styles.editHint}>
        This is just the guest list — everyone still needs to Check In once they're actually at the courts.
      </p>
      <div style={styles.photoRow}>
        <div style={styles.photoPreviewWrap}>
          {photoDataUrl ? (
            <img src={photoDataUrl} alt="" style={styles.photoPreview} />
          ) : (
            <div style={styles.photoPlaceholder}>
              <Camera size={18} strokeWidth={2} color="#a3a89a" />
            </div>
          )}
          {photoDataUrl && (
            <button style={styles.photoClearBtn} onClick={() => setPhotoDataUrl(null)} aria-label="remove photo">
              <X size={11} strokeWidth={3} />
            </button>
          )}
        </div>
        <label style={styles.photoLabel}>
          <input
            type="file"
            accept="image/*"
            capture="user"
            style={{ display: "none" }}
            onChange={(e) => handlePhotoSelect(e.target.files?.[0])}
          />
          {photoBusy ? "Adding photo…" : photoDataUrl ? "Change photo" : "Add a photo (optional)"}
        </label>
      </div>
      <div style={styles.checkinRow}>
        <input
          style={styles.input}
          placeholder="Player name"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addPlayer()}
        />
        <button style={styles.primaryBtn} onClick={addPlayer}>
          <Plus size={16} strokeWidth={2.5} />
          Add
        </button>
      </div>

      {roster.length > 0 && (
        <ul style={styles.rosterList}>
          {roster.map((p) => (
            <li key={p.id} style={styles.rosterItem}>
              <Avatar player={p} size={26} />
              <span style={styles.queueName}>{p.name}</span>
              <button
                style={styles.rosterRemoveBtn}
                onClick={() => removePlayer(p.id)}
                aria-label={`remove ${p.name}`}
              >
                <X size={11} strokeWidth={3} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {createError && <div style={styles.pinError}>{createError}</div>}

      <button
        style={{ ...styles.primaryBtn, ...styles.startBtn, ...(!canStart ? styles.btnDisabled : {}) }}
        onClick={() => canStart && onStart(venue.trim(), courts, roster)}
        disabled={!canStart}
      >
        <LogIn size={16} strokeWidth={2.5} />
        {creating ? "Starting…" : "Start session"}
      </button>
    </div>
  );
}

function BoardView({ state, waitingPlayers }) {
  return (
    <div>
      <div style={styles.courtGrid}>
        {state.courts.map((court, i) => (
          <CourtCard key={i} court={court} players={state.players} readOnly />
        ))}
      </div>
      <SectionLabel>Waiting queue</SectionLabel>
      <QueueList waitingPlayers={waitingPlayers} />
    </div>
  );
}

function CheckinView({
  registeredNotHere,
  checkInExisting,
  nameInput,
  setNameInput,
  quickAddCheckIn,
  checkinMsg,
  waitingPlayers,
  photoDataUrl,
  setPhotoDataUrl,
  handlePhotoSelect,
  photoBusy,
}) {
  return (
    <div style={styles.checkinWrap}>
      <SectionLabel>Registered players not yet here ({registeredNotHere.length})</SectionLabel>
      {registeredNotHere.length === 0 ? (
        <p style={styles.emptyQueue}>No one registered is waiting to check in.</p>
      ) : (
        <ul style={styles.rosterList}>
          {registeredNotHere.map((p) => (
            <li key={p.id} style={styles.rosterItem}>
              <Avatar player={p} size={26} />
              <span style={styles.queueName}>{p.name}</span>
              <button style={styles.checkInTapBtn} onClick={() => checkInExisting(p.id)}>
                <LogIn size={12} strokeWidth={2.5} />
                Check in
              </button>
            </li>
          ))}
        </ul>
      )}

      <SectionLabel>Walk-in (not registered)</SectionLabel>
      <div style={styles.photoRow}>
        <div style={styles.photoPreviewWrap}>
          {photoDataUrl ? (
            <img src={photoDataUrl} alt="" style={styles.photoPreview} />
          ) : (
            <div style={styles.photoPlaceholder}>
              <Camera size={18} strokeWidth={2} color="#a3a89a" />
            </div>
          )}
          {photoDataUrl && (
            <button
              style={styles.photoClearBtn}
              onClick={() => setPhotoDataUrl(null)}
              aria-label="remove photo"
            >
              <X size={11} strokeWidth={3} />
            </button>
          )}
        </div>
        <label style={styles.photoLabel}>
          <input
            type="file"
            accept="image/*"
            capture="user"
            style={{ display: "none" }}
            onChange={(e) => handlePhotoSelect(e.target.files?.[0])}
          />
          {photoBusy ? "Adding photo…" : photoDataUrl ? "Change photo" : "Add a photo (optional)"}
        </label>
      </div>
      <div style={styles.checkinRow}>
        <input
          style={styles.input}
          placeholder="Player name"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && quickAddCheckIn()}
        />
        <button style={styles.primaryBtn} onClick={quickAddCheckIn}>
          <LogIn size={16} strokeWidth={2.5} />
          Check in
        </button>
      </div>
      {checkinMsg && (
        <div style={styles.confirmMsg}>
          <Check size={14} strokeWidth={3} /> {checkinMsg}
        </div>
      )}
      <SectionLabel>Currently waiting ({waitingPlayers.length})</SectionLabel>
      <QueueList waitingPlayers={waitingPlayers} />
    </div>
  );
}

function ScorerLogin({ pin, setPin, tryScorerLogin, pinError }) {
  return (
    <div style={styles.loginWrap}>
      <Lock size={28} strokeWidth={1.75} color="var(--ink)" />
      <h2 style={styles.loginTitle}>Umpire / Scorer access</h2>
      <p style={styles.loginSub}>Enter your scorer PIN to manage courts and update live scores.</p>
      <input
        style={styles.pinInput}
        type="password"
        inputMode="numeric"
        placeholder="PIN"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && tryScorerLogin()}
      />
      <button style={styles.primaryBtn} onClick={tryScorerLogin}>
        <Unlock size={16} strokeWidth={2.5} />
        Enter as scorer
      </button>
      {pinError && <div style={styles.pinError}>{pinError}</div>}
      <p style={styles.loginNote}>Demo PIN: 1234 — a real version would use per-umpire accounts.</p>
    </div>
  );
}

function ScorerView({
  state,
  fillCourt,
  fillAllCourts,
  adjustScore,
  endMatch,
  reassignTeams,
  substitutePlayer,
  waitingCount,
}) {
  const waitingPlayers = state.queueIds.map((id) => state.players[id]).filter(Boolean);
  return (
    <div>
      <div style={styles.scorerToolbar}>
        <div style={styles.toolbarText}>
          <strong>{waitingCount}</strong> players waiting
        </div>
        <button
          style={{ ...styles.primaryBtn, ...(waitingCount < 4 ? styles.btnDisabled : {}) }}
          onClick={fillAllCourts}
          disabled={waitingCount < 4}
        >
          <Shuffle size={16} strokeWidth={2.5} />
          Fill all open courts
        </button>
      </div>
      <div style={styles.courtGrid}>
        {state.courts.map((court, i) => (
          <CourtCard
            key={i}
            court={court}
            players={state.players}
            waitingPlayers={waitingPlayers}
            onFill={() => fillCourt(i)}
            onScore={(team, delta) => adjustScore(i, team, delta)}
            onEnd={() => endMatch(i)}
            onReassign={(teamA, teamB) => reassignTeams(i, teamA, teamB)}
            onSubstitute={(outgoingId, incomingId, returnOutgoing) =>
              substitutePlayer(i, outgoingId, incomingId, returnOutgoing)
            }
            canFill={waitingCount >= 4}
          />
        ))}
      </div>
    </div>
  );
}

function CourtCard({ court, players, waitingPlayers, readOnly, onFill, onScore, onEnd, onReassign, onSubstitute, canFill }) {
  const isLive = court.status === "live" || court.status === "finished";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [subbingId, setSubbingId] = useState(null);
  const [subChoice, setSubChoice] = useState(null);
  const [subReturn, setSubReturn] = useState(false);

  const startEdit = () => {
    const map = {};
    court.teamA.forEach((id) => (map[id] = "A"));
    court.teamB.forEach((id) => (map[id] = "B"));
    setDraft(map);
    setSubbingId(null);
    setEditing(true);
  };

  const startSub = (id) => {
    setSubbingId(id);
    setSubChoice(null);
    setSubReturn(false);
    setEditing(false);
  };

  const cancelSub = () => setSubbingId(null);

  const confirmSub = () => {
    if (!subChoice) return;
    onSubstitute(subbingId, subChoice, subReturn);
    setSubbingId(null);
  };

  const toggleSide = (id) => {
    setDraft((d) => ({ ...d, [id]: d[id] === "A" ? "B" : "A" }));
  };

  const allIds = [...court.teamA, ...court.teamB];
  const draftACount = allIds.filter((id) => draft[id] === "A").length;
  const draftValid = draftACount === 2;

  const saveEdit = () => {
    if (!draftValid) return;
    const teamA = allIds.filter((id) => draft[id] === "A");
    const teamB = allIds.filter((id) => draft[id] === "B");
    onReassign(teamA, teamB);
    setEditing(false);
  };

  return (
    <div style={styles.courtCard(court.status)}>
      <div style={styles.courtHeadRow}>
        <span style={styles.courtBadge}>COURT {court.number}</span>
        <span style={styles.statusTag(court.status)}>
          {court.status === "open" ? "OPEN" : court.status === "finished" ? "MATCH POINT" : "LIVE"}
        </span>
      </div>

      {!isLive && (
        <div style={styles.openCourtBody}>
          <p style={styles.openCourtText}>Court is free</p>
          {!readOnly && (
            <button
              style={{ ...styles.secondaryBtn, ...(!canFill ? styles.btnDisabled : {}) }}
              onClick={onFill}
              disabled={!canFill}
            >
              <Shuffle size={14} strokeWidth={2.5} />
              Assign match
            </button>
          )}
        </div>
      )}

      {isLive && editing && (
        <div>
          <p style={styles.editHint}>Tap a player to move them to the other side.</p>
          <div style={styles.editGrid}>
            {allIds.map((id) => (
              <button
                key={id}
                style={{
                  ...styles.editChip,
                  ...(draft[id] === "A" ? styles.editChipA : styles.editChipB),
                }}
                onClick={() => toggleSide(id)}
              >
                <Avatar player={players[id]} size={22} />
                <span style={styles.editChipName}>{players[id]?.name}</span>
                <span style={styles.editChipSide}>{draft[id]}</span>
              </button>
            ))}
          </div>
          {!draftValid && <p style={styles.editWarning}>Each side needs exactly 2 players.</p>}
          <div style={styles.editActions}>
            <button style={styles.secondaryBtn} onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              style={{ ...styles.primaryBtn, ...(!draftValid ? styles.btnDisabled : {}) }}
              onClick={saveEdit}
              disabled={!draftValid}
            >
              <Check size={14} strokeWidth={3} />
              Save teams
            </button>
          </div>
        </div>
      )}

      {isLive && subbingId && (
        <div>
          <p style={styles.editHint}>Substitute for {players[subbingId]?.name}</p>
          {waitingPlayers.length === 0 ? (
            <p style={styles.editWarning}>No one is waiting to sub in right now.</p>
          ) : (
            <div style={styles.editGrid}>
              {waitingPlayers.map((p) => (
                <button
                  key={p.id}
                  style={{
                    ...styles.editChip,
                    ...(subChoice === p.id ? styles.editChipA : {}),
                  }}
                  onClick={() => setSubChoice(p.id)}
                >
                  <Avatar player={p} size={22} />
                  <span style={styles.editChipName}>{p.name}</span>
                </button>
              ))}
            </div>
          )}
          <label style={styles.subReturnLabel}>
            <input
              type="checkbox"
              checked={subReturn}
              onChange={(e) => setSubReturn(e.target.checked)}
            />
            Send {players[subbingId]?.name} back to the waiting queue
          </label>
          <div style={styles.editActions}>
            <button style={styles.secondaryBtn} onClick={cancelSub}>
              Cancel
            </button>
            <button
              style={{ ...styles.primaryBtn, ...(!subChoice ? styles.btnDisabled : {}) }}
              onClick={confirmSub}
              disabled={!subChoice}
            >
              <Repeat size={14} strokeWidth={3} />
              Confirm sub
            </button>
          </div>
        </div>
      )}

      {isLive && !editing && !subbingId && (
        <div>
          <TeamRow
            ids={court.teamA}
            players={players}
            score={court.scoreA}
            onMinus={() => onScore && onScore("A", -1)}
            onPlus={() => onScore && onScore("A", 1)}
            readOnly={readOnly}
            leading={court.scoreA > court.scoreB}
            onRequestSub={!readOnly ? startSub : null}
          />
          <div style={styles.vsLine} />
          <TeamRow
            ids={court.teamB}
            players={players}
            score={court.scoreB}
            onMinus={() => onScore && onScore("B", -1)}
            onPlus={() => onScore && onScore("B", 1)}
            readOnly={readOnly}
            leading={court.scoreB > court.scoreA}
            onRequestSub={!readOnly ? startSub : null}
          />
          {!readOnly && (
            <div style={styles.courtActionsRow}>
              <button style={styles.fixTeamsBtn} onClick={startEdit}>
                <Shuffle size={12} strokeWidth={2.5} />
                Fix teams
              </button>
              <button
                style={{
                  ...styles.endMatchBtn,
                  ...(court.status !== "finished" ? { opacity: 0.55 } : {}),
                }}
                onClick={onEnd}
              >
                {court.status === "finished" ? (
                  <>
                    <Trophy size={14} strokeWidth={2.5} /> End match & requeue players
                  </>
                ) : (
                  <>
                    <RotateCcw size={14} strokeWidth={2.5} /> End match early
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TeamRow({ ids, players, score, onMinus, onPlus, readOnly, leading, onRequestSub }) {
  return (
    <div style={styles.teamRow}>
      <div style={styles.teamPlayers}>
        {ids.map((id) => (
          <PlayerChip
            key={id}
            player={players[id]}
            highlight={leading}
            onSubClick={onRequestSub ? () => onRequestSub(id) : null}
          />
        ))}
      </div>
      <div style={styles.scoreControl}>
        {!readOnly && (
          <button style={styles.scoreBtn} onClick={onMinus} aria-label="decrease score">
            <Minus size={14} strokeWidth={3} />
          </button>
        )}
        <span style={styles.scoreDigit}>{score}</span>
        {!readOnly && (
          <button style={styles.scoreBtn} onClick={onPlus} aria-label="increase score">
            <Plus size={14} strokeWidth={3} />
          </button>
        )}
      </div>
    </div>
  );
}

function Avatar({ player, size = 26 }) {
  if (!player) return null;
  const dim = { width: size, height: size, minWidth: size };
  if (player.photo) {
    return <img src={player.photo} alt="" style={{ ...styles.avatarImg, ...dim }} />;
  }
  return (
    <div style={{ ...styles.avatarInitials, ...dim, background: colorForName(player.name) }}>
      {initials(player.name)}
    </div>
  );
}

function PlayerChip({ player, highlight, onSubClick }) {
  if (!player) return null;
  return (
    <div style={styles.playerChip}>
      <Avatar player={player} />
      <span style={{ ...styles.teamName, ...(highlight ? { color: "var(--ink)" } : {}) }}>
        {player.name}
      </span>
      {onSubClick && (
        <button style={styles.subBtn} onClick={onSubClick} aria-label={`substitute ${player.name}`}>
          <Repeat size={11} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

// groups the waiting list into upcoming 2v2 matchups using the same
// winner/loser-aware logic used to actually fill a court, so the preview
// matches what "Fill all open courts" will really do
function buildQueueMatchups(waitingPlayers) {
  const playersById = {};
  waitingPlayers.forEach((p) => (playersById[p.id] = p));
  let remainingIds = waitingPlayers.map((p) => p.id);
  const matchups = [];
  while (remainingIds.length >= 4) {
    const group = pickNextGroup(remainingIds, playersById);
    remainingIds = remainingIds.filter((id) => !group.includes(id));
    matchups.push({
      teamA: [playersById[group[0]], playersById[group[1]]],
      teamB: [playersById[group[2]], playersById[group[3]]],
    });
  }
  return { matchups, leftover: remainingIds.map((id) => playersById[id]) };
}

function QueueList({ waitingPlayers }) {
  if (waitingPlayers.length === 0) {
    return <p style={styles.emptyQueue}>No one waiting right now — check in to join.</p>;
  }

  const { matchups, leftover } = buildQueueMatchups(waitingPlayers);

  return (
    <div>
      {matchups.map((m, i) => (
        <div key={i} style={styles.matchupCard(i === 0)}>
          <div style={styles.matchupHeader(i === 0)}>{i === 0 ? "Next up" : `Then · matchup ${i + 1}`}</div>
          <div style={styles.matchupTeams}>
            <div style={styles.matchupTeam}>
              {m.teamA.map((p) => (
                <PlayerChip key={p.id} player={p} />
              ))}
            </div>
            <span style={styles.matchupVs}>VS</span>
            <div style={styles.matchupTeam}>
              {m.teamB.map((p) => (
                <PlayerChip key={p.id} player={p} />
              ))}
            </div>
          </div>
        </div>
      ))}
      {leftover.length > 0 && (
        <>
          <div style={styles.matchupHeader(false)}>
            Waiting for {4 - leftover.length} more player{4 - leftover.length === 1 ? "" : "s"}
          </div>
          <ol style={styles.queueList}>
            {leftover.map((p, i) => (
              <li key={p.id} style={styles.queueItem}>
                <span style={styles.queueNum}>{i + 1}</span>
                <Avatar player={p} size={22} />
                <span style={styles.queueName}>{p.name}</span>
                {p.lastResult && (
                  <span style={styles.resultTag(p.lastResult)}>{p.lastResult === "win" ? "W" : "L"}</span>
                )}
                <span style={styles.queueGames}>
                  {p.games} game{p.games === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function StandingsView({ players }) {
  const rows = Object.values(players)
    .filter((p) => (p.games || 0) > 0)
    .map((p) => ({
      ...p,
      wins: p.wins || 0,
      losses: p.losses || 0,
      streak: p.streak || 0,
      diff: (p.pointsFor || 0) - (p.pointsAgainst || 0),
    }))
    .sort((a, b) => b.wins - a.wins || b.diff - a.diff || a.losses - b.losses);

  const notPlayed = Object.values(players).filter((p) => !(p.games > 0));

  return (
    <div>
      <SectionLabel>Standings</SectionLabel>
      {rows.length === 0 ? (
        <p style={styles.emptyQueue}>No completed games yet — standings fill in as matches end.</p>
      ) : (
        <div style={styles.standingsTable}>
          <div style={styles.standingsHeadRow}>
            <span style={styles.standingsRankCol}>#</span>
            <span style={styles.standingsNameCol}>Player</span>
            <span style={styles.standingsStatCol}>W</span>
            <span style={styles.standingsStatCol}>L</span>
            <span style={styles.standingsStatCol}>+/-</span>
          </div>
          {rows.map((p, i) => (
            <div key={p.id} style={styles.standingsRow}>
              <span style={styles.standingsRankCol}>{i + 1}</span>
              <span style={styles.standingsNameCol}>
                <Avatar player={p} size={24} />
                <span style={styles.standingsName}>{p.name}</span>
                {p.streak >= 3 && (
                  <Flame
                    size={14}
                    strokeWidth={2.5}
                    color="var(--coral)"
                    fill="var(--coral)"
                    style={{ flexShrink: 0 }}
                    aria-label={`${p.streak} game win streak`}
                  />
                )}
              </span>
              <span style={styles.standingsStatCol}>{p.wins}</span>
              <span style={styles.standingsStatCol}>{p.losses}</span>
              <span
                style={{
                  ...styles.standingsStatCol,
                  color: p.diff > 0 ? "var(--court)" : p.diff < 0 ? "var(--coral)" : "#8a8f83",
                  fontWeight: 700,
                }}
              >
                {p.diff > 0 ? `+${p.diff}` : p.diff}
              </span>
            </div>
          ))}
        </div>
      )}
      {notPlayed.length > 0 && (
        <p style={styles.standingsNote}>
          {notPlayed.length} checked-in player{notPlayed.length === 1 ? "" : "s"} haven't finished a game yet.
        </p>
      )}
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={styles.sectionLabel}>{children}</div>;
}

const fontImport = `
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap');
:root {
  --ink: #16241F;
  --court: #1F5C43;
  --court-dark: #163F2E;
  --chalk: #F3F1E4;
  --ball: #D4E157;
  --coral: #E85D4C;
  --line: #C9C4AE;
}
`;

const styles = {
  app: {
    fontFamily: "'Inter', sans-serif",
    background: "var(--chalk)",
    color: "var(--ink)",
    minHeight: "100%",
    borderRadius: 12,
    overflow: "hidden",
  },
  landingWrap: {
    padding: "40px 24px",
    maxWidth: 640,
    margin: "0 auto",
  },
  landingHero: {
    textAlign: "center",
    marginBottom: 28,
  },
  landingTitle: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    fontSize: "clamp(26px, 5vw, 38px)",
    textTransform: "uppercase",
    margin: "6px 0 10px 0",
    color: "var(--court)",
    lineHeight: 1.05,
  },
  landingSub: {
    fontSize: 14,
    color: "#5c6157",
    maxWidth: 420,
    margin: "0 auto",
  },
  landingCards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 16,
  },
  landingCard: {
    background: "#fff",
    border: "1.5px solid var(--line)",
    borderRadius: 12,
    padding: 20,
  },
  landingCardTitle: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    fontSize: 17,
    textTransform: "uppercase",
    margin: "0 0 6px 0",
  },
  landingCardText: {
    fontSize: 12.5,
    color: "#6b7268",
    margin: "0 0 14px 0",
    lineHeight: 1.5,
  },
  codeInput: {
    fontFamily: "'Space Mono', monospace",
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    textAlign: "center",
  },
  adminLink: {
    display: "block",
    margin: "26px auto 0 auto",
    background: "none",
    border: "none",
    color: "#8a8f83",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center",
  },
  adminCode: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.05em",
  },
  createWrap: {
    padding: "22px 24px 30px 24px",
    maxWidth: 520,
    margin: "0 auto",
  },
  backBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "none",
    border: "none",
    color: "#6b7268",
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "pointer",
    padding: 0,
    marginBottom: 18,
  },
  courtStepper: {
    display: "flex",
    alignItems: "center",
    gap: 14,
  },
  courtStepperCount: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 22,
    fontWeight: 700,
    minWidth: 20,
    textAlign: "center",
  },
  rosterList: {
    listStyle: "none",
    padding: 0,
    margin: "4px 0 4px 0",
    maxWidth: 480,
  },
  rosterItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 0",
    borderBottom: "1px solid var(--line)",
    fontSize: 13.5,
  },
  rosterRemoveBtn: {
    width: 20,
    height: 20,
    borderRadius: "50%",
    background: "var(--chalk)",
    color: "#8a8f83",
    border: "1px solid var(--line)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    marginLeft: "auto",
    padding: 0,
  },
  checkInTapBtn: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
    background: "var(--court)",
    color: "var(--chalk)",
    border: "none",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    flexShrink: 0,
  },
  startBtn: {
    width: "100%",
    justifyContent: "center",
    marginTop: 22,
    padding: "13px 0",
    fontSize: 14,
  },
  header: {
    background: "var(--court)",
    color: "var(--chalk)",
    padding: "20px 24px 0 24px",
  },
  headerInner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: 12,
    paddingBottom: 16,
  },
  kicker: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.14em",
    color: "var(--ball)",
    marginBottom: 6,
    fontWeight: 700,
  },
  title: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    fontSize: "clamp(22px, 4vw, 32px)",
    letterSpacing: "0.01em",
    margin: 0,
    lineHeight: 1.05,
    textTransform: "uppercase",
  },
  headerStats: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },
  statPill: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "rgba(243,241,228,0.12)",
    border: "1px solid rgba(243,241,228,0.25)",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
  },
  codePill: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "var(--ball)",
    color: "var(--ink)",
    border: "none",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 11.5,
    fontWeight: 700,
    fontFamily: "'Space Mono', monospace",
    cursor: "pointer",
    letterSpacing: "0.04em",
  },
  leaveBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: "50%",
    background: "rgba(243,241,228,0.12)",
    border: "1px solid rgba(243,241,228,0.25)",
    color: "var(--chalk)",
    cursor: "pointer",
  },
  dot: (active) => ({
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: active ? "var(--ball)" : "var(--coral)",
    display: "inline-block",
  }),
  nav: {
    display: "flex",
    gap: 4,
  },
  navBtn: {
    background: "transparent",
    border: "none",
    color: "rgba(243,241,228,0.65)",
    padding: "10px 16px",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.03em",
    cursor: "pointer",
    borderBottom: "3px solid transparent",
    fontFamily: "'Inter', sans-serif",
  },
  navBtnActive: {
    color: "var(--chalk)",
    borderBottom: "3px solid var(--ball)",
  },
  kitchenLine: {
    height: 0,
    borderTop: "2px dashed var(--line)",
    background: "var(--chalk)",
  },
  main: {
    padding: "22px 24px 8px 24px",
    minHeight: 320,
  },
  loading: {
    padding: 40,
    textAlign: "center",
    color: "#6b7268",
    fontSize: 14,
  },
  sectionLabel: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.12em",
    color: "#6b7268",
    margin: "22px 0 10px 0",
    textTransform: "uppercase",
  },
  courtGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 14,
  },
  courtCard: (status) => ({
    background: "#fff",
    border: `1.5px solid ${status === "finished" ? "var(--coral)" : "var(--line)"}`,
    borderRadius: 10,
    padding: 16,
    position: "relative",
  }),
  courtHeadRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  courtBadge: {
    fontFamily: "'Space Mono', monospace",
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: "0.06em",
    background: "var(--ink)",
    color: "var(--chalk)",
    padding: "3px 8px",
    borderRadius: 4,
  },
  statusTag: (status) => ({
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.08em",
    color:
      status === "open" ? "#6b7268" : status === "finished" ? "var(--coral)" : "var(--court)",
  }),
  openCourtBody: {
    textAlign: "center",
    padding: "14px 0 6px 0",
  },
  openCourtText: {
    color: "#8a8f83",
    fontSize: 13,
    margin: "0 0 12px 0",
  },
  teamRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
    gap: 8,
  },
  teamPlayers: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  },
  playerChip: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  subBtn: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    border: "1px solid var(--line)",
    background: "var(--chalk)",
    color: "#8a8f83",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    padding: 0,
  },
  subReturnLabel: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    fontSize: 12,
    color: "#5c6157",
    margin: "10px 0 0 0",
    cursor: "pointer",
  },
  teamName: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "#5c6157",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  avatarImg: {
    borderRadius: "50%",
    objectFit: "cover",
    border: "1.5px solid #fff",
    boxShadow: "0 0 0 1px var(--line)",
    flexShrink: 0,
  },
  avatarInitials: {
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontFamily: "'Space Mono', monospace",
    fontWeight: 700,
    fontSize: 10,
    flexShrink: 0,
    border: "1.5px solid #fff",
    boxShadow: "0 0 0 1px var(--line)",
  },
  photoRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  photoPreviewWrap: {
    position: "relative",
    width: 52,
    height: 52,
  },
  photoPreview: {
    width: 52,
    height: 52,
    borderRadius: "50%",
    objectFit: "cover",
    border: "1.5px solid var(--line)",
  },
  photoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: "50%",
    background: "#fff",
    border: "1.5px dashed var(--line)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  photoClearBtn: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: "50%",
    background: "var(--coral)",
    color: "#fff",
    border: "1.5px solid var(--chalk)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  photoLabel: {
    fontSize: 12.5,
    fontWeight: 700,
    color: "var(--court)",
    cursor: "pointer",
    textDecoration: "underline",
    textUnderlineOffset: 3,
  },
  scoreControl: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  scoreBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    border: "1.5px solid var(--line)",
    background: "var(--chalk)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "var(--ink)",
  },
  scoreDigit: {
    fontFamily: "'Space Mono', monospace",
    fontWeight: 700,
    fontSize: 22,
    minWidth: 28,
    textAlign: "center",
  },
  vsLine: {
    borderTop: "1.5px dashed var(--line)",
    margin: "2px 0",
  },
  courtActionsRow: {
    display: "flex",
    gap: 8,
    marginTop: 14,
  },
  fixTeamsBtn: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    background: "#fff",
    color: "#5c6157",
    border: "1.5px solid var(--line)",
    borderRadius: 7,
    padding: "9px 12px",
    fontWeight: 700,
    fontSize: 11.5,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  editHint: {
    fontSize: 12,
    color: "#8a8f83",
    margin: "0 0 10px 0",
  },
  editGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  editChip: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    borderRadius: 8,
    border: "1.5px solid var(--line)",
    background: "#fff",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "'Inter', sans-serif",
  },
  editChipA: {
    borderColor: "var(--court)",
    background: "rgba(31,92,67,0.06)",
  },
  editChipB: {
    borderColor: "var(--coral)",
    background: "rgba(232,93,76,0.06)",
  },
  editChipName: {
    flex: 1,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--ink)",
  },
  editChipSide: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 11,
    fontWeight: 700,
    color: "#8a8f83",
  },
  editWarning: {
    fontSize: 11.5,
    color: "var(--coral)",
    fontWeight: 600,
    margin: "8px 0 0 0",
  },
  editActions: {
    display: "flex",
    gap: 8,
    marginTop: 12,
  },
  standingsTable: {
    maxWidth: 480,
  },
  standingsHeadRow: {
    display: "flex",
    alignItems: "center",
    padding: "6px 0",
    borderBottom: "2px solid var(--ink)",
    fontFamily: "'Space Mono', monospace",
    fontSize: 10.5,
    fontWeight: 700,
    color: "#8a8f83",
    letterSpacing: "0.06em",
  },
  standingsRow: {
    display: "flex",
    alignItems: "center",
    padding: "9px 0",
    borderBottom: "1px solid var(--line)",
  },
  standingsRankCol: {
    width: 24,
    fontFamily: "'Space Mono', monospace",
    fontSize: 12,
    color: "#8a8f83",
  },
  standingsNameCol: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  standingsName: {
    fontSize: 13.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  standingsStatCol: {
    width: 36,
    textAlign: "center",
    fontFamily: "'Space Mono', monospace",
    fontSize: 13,
    fontWeight: 600,
  },
  standingsNote: {
    fontSize: 11.5,
    color: "#a3a89a",
    marginTop: 14,
  },
  endMatchBtn: {
    flex: 1,
    background: "var(--ball)",
    color: "var(--ink)",
    border: "none",
    borderRadius: 7,
    padding: "9px 0",
    fontWeight: 700,
    fontSize: 12.5,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    cursor: "pointer",
  },
  checkinWrap: { maxWidth: 480 },
  checkinRow: { display: "flex", gap: 8 },
  input: {
    flex: 1,
    padding: "11px 14px",
    borderRadius: 8,
    border: "1.5px solid var(--line)",
    fontSize: 14,
    fontFamily: "'Inter', sans-serif",
    background: "#fff",
    color: "var(--ink)",
  },
  primaryBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "var(--court)",
    color: "var(--chalk)",
    border: "none",
    borderRadius: 8,
    padding: "11px 16px",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  secondaryBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    margin: "0 auto",
    background: "var(--chalk)",
    color: "var(--ink)",
    border: "1.5px solid var(--ink)",
    borderRadius: 7,
    padding: "8px 14px",
    fontWeight: 700,
    fontSize: 12.5,
    cursor: "pointer",
  },
  btnDisabled: { opacity: 0.4, cursor: "not-allowed" },
  confirmMsg: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: "var(--court)",
    fontSize: 13,
    fontWeight: 600,
    marginTop: 10,
  },
  queueList: { listStyle: "none", padding: 0, margin: 0, maxWidth: 480 },
  queueItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 0",
    borderBottom: "1px solid var(--line)",
    fontSize: 13.5,
  },
  queueNum: {
    fontFamily: "'Space Mono', monospace",
    fontSize: 11,
    color: "#8a8f83",
    width: 16,
  },
  queueName: { flex: 1, fontWeight: 600 },
  resultTag: (result) => ({
    fontFamily: "'Space Mono', monospace",
    fontSize: 10,
    fontWeight: 700,
    color: "#fff",
    background: result === "win" ? "var(--court)" : "var(--coral)",
    borderRadius: 4,
    padding: "2px 5px",
    flexShrink: 0,
  }),
  queueGames: { fontSize: 11, color: "#8a8f83" },
  matchupCard: (isNext) => ({
    background: "#fff",
    border: `1.5px solid ${isNext ? "var(--court)" : "var(--line)"}`,
    borderRadius: 10,
    padding: "12px 14px",
    marginBottom: 10,
  }),
  matchupHeader: (isNext) => ({
    fontFamily: "'Space Mono', monospace",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.1em",
    color: isNext ? "var(--court)" : "#8a8f83",
    marginBottom: 9,
    textTransform: "uppercase",
  }),
  matchupTeams: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  matchupTeam: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
  },
  matchupVs: {
    fontFamily: "'Anton', sans-serif",
    fontSize: 12,
    color: "var(--coral)",
    flexShrink: 0,
  },
  emptyQueue: { color: "#8a8f83", fontSize: 13.5 },
  loginWrap: {
    maxWidth: 340,
    margin: "20px auto",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
  },
  loginTitle: {
    fontFamily: "'Anton', sans-serif",
    fontWeight: 400,
    fontSize: 20,
    textTransform: "uppercase",
    margin: "10px 0 2px 0",
  },
  loginSub: { fontSize: 13, color: "#6b7268", margin: "0 0 12px 0" },
  pinInput: {
    width: "100%",
    textAlign: "center",
    letterSpacing: "0.3em",
    fontSize: 18,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1.5px solid var(--line)",
    marginBottom: 10,
    fontFamily: "'Space Mono', monospace",
  },
  pinError: { color: "var(--coral)", fontSize: 12.5, marginTop: 8, fontWeight: 600 },
  loginNote: { fontSize: 11.5, color: "#a3a89a", marginTop: 14 },
  scorerToolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    flexWrap: "wrap",
    gap: 10,
  },
  toolbarText: { fontSize: 13.5, color: "#5c6157" },
  syncError: {
    marginTop: 16,
    fontSize: 12,
    color: "var(--coral)",
    fontWeight: 600,
  },
  footer: {
    textAlign: "center",
    fontSize: 11,
    color: "#a3a89a",
    padding: "14px 0 18px 0",
  },
};

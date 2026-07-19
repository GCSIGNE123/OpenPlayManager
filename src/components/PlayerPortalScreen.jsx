import { useEffect, useState } from "react";
import { ArrowLeft, LogIn, Search } from "lucide-react";
import { styles } from "../styles.js";
import { STORAGE_PREFIX, TOURNAMENT_PREFIX } from "../lib/constants.js";
import { PlayerPortalService } from "../engines/PlayerPortalService.js";
import PlayerTournamentView from "./PlayerTournamentView.jsx";
import SectionLabel from "./SectionLabel.jsx";

const portalService = new PlayerPortalService();

// Player Portal's entry shell — code lookup, then name/number search, then
// the resolved participant's read-only view. See PROJECT.md's Player
// Portal section. Reached either via a landing-page link (no code known
// yet, `initialCode` is null) or a `?portal=CODE` URL a second device can
// land on directly (mirrors Tournament Display Mode's `?display=CODE`
// precedent) — both paths converge on the same session-code lookup below.
//
// Strictly read-only: this file never imports a single save*/mutate
// function, and the session/tournament records are realtime-subscribed
// (window.storage.subscribeToKey, the same mechanism TournamentDisplayView
// already uses) so Assigned Court / Match Status stay current without a
// manual refresh.
export default function PlayerPortalScreen({ initialCode, onExit }) {
  const [codeInput, setCodeInput] = useState(initialCode || "");
  const [sessionCode, setSessionCode] = useState(initialCode || null);
  const [session, setSession] = useState(null);
  const [tournament, setTournament] = useState(null);
  const [lookupError, setLookupError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (!sessionCode) return undefined;
    let cancelled = false;
    setLookupError("");
    const loadSession = async () => {
      try {
        const res = await window.storage.get(`${STORAGE_PREFIX}${sessionCode}`, true);
        const parsed = JSON.parse(res.value);
        if (!cancelled) setSession(parsed);
      } catch (e) {
        if (!cancelled) setLookupError("Session not found — check the code and try again.");
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

  const lookUp = () => {
    const code = codeInput.trim().toUpperCase();
    if (!code) {
      setLookupError("Enter your session code.");
      return;
    }
    setSession(null);
    setTournament(null);
    setSelectedId(null);
    setSessionCode(code);
  };

  if (!sessionCode) {
    return (
      <div style={styles.landingWrap}>
        <button style={styles.backBtn} onClick={onExit}>
          <ArrowLeft size={14} strokeWidth={2.5} />
          Back
        </button>
        <SectionLabel>Player Portal</SectionLabel>
        <p style={styles.editHint}>Enter the session code your organizer shared to look up your matches.</p>
        <div style={styles.checkinRow}>
          <input
            style={{ ...styles.input, ...styles.codeInput }}
            placeholder="ABC123"
            value={codeInput}
            maxLength={6}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && lookUp()}
          />
          <button style={styles.primaryBtn} onClick={lookUp}>
            <LogIn size={16} strokeWidth={2.5} />
            Look up
          </button>
        </div>
        {lookupError && <div style={styles.pinError}>{lookupError}</div>}
      </div>
    );
  }

  if (lookupError) {
    return (
      <div style={styles.landingWrap}>
        <button style={styles.backBtn} onClick={() => setSessionCode(null)}>
          <ArrowLeft size={14} strokeWidth={2.5} />
          Back
        </button>
        <div style={styles.pinError}>{lookupError}</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={styles.landingWrap}>
        <p style={styles.editHint}>Loading…</p>
      </div>
    );
  }

  if (session.sessionType !== "tournament") {
    return (
      <div style={styles.landingWrap}>
        <button style={styles.backBtn} onClick={() => setSessionCode(null)}>
          <ArrowLeft size={14} strokeWidth={2.5} />
          Back
        </button>
        <p style={styles.editHint}>Player Portal is available for tournament sessions.</p>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div style={styles.landingWrap}>
        <button style={styles.backBtn} onClick={() => setSessionCode(null)}>
          <ArrowLeft size={14} strokeWidth={2.5} />
          Back
        </button>
        <p style={styles.editHint}>Waiting for the schedule to be generated…</p>
      </div>
    );
  }

  const selectedSummary = selectedId ? portalService.getParticipantSummary(tournament, selectedId) : null;

  return (
    <div style={styles.landingWrap}>
      <button
        style={styles.backBtn}
        onClick={() => (selectedId ? setSelectedId(null) : setSessionCode(null))}
      >
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>

      {!selectedId ? (
        <>
          <SectionLabel>Find yourself</SectionLabel>
          <p style={styles.editHint}>Search by name or your Player Number.</p>
          <div style={styles.historySearchBox}>
            <Search size={14} strokeWidth={2.5} />
            <input
              style={styles.historySearchInput}
              placeholder="Name or Player Number"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ul style={styles.queueList}>
            {portalService.searchParticipants(tournament, query).map((p) => (
              <li key={p.participantId} style={styles.queueItem}>
                <span style={styles.queueNum}>#{p.playerNumber}</span>
                <span style={styles.queueName}>{p.label}</span>
                <span style={styles.editHint}>{p.poolLabel}</span>
                <button style={styles.secondaryBtn} onClick={() => setSelectedId(p.participantId)}>
                  View
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        selectedSummary && (
          <PlayerTournamentView
            summary={selectedSummary}
            matches={portalService.getParticipantMatches(tournament, selectedId)}
            results={portalService.getParticipantResults(tournament, selectedId)}
            bracketPath={portalService.getParticipantBracketPath(tournament, selectedId)}
          />
        )
      )}
    </div>
  );
}

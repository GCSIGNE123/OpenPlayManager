import { useEffect, useState } from "react";
import { ArrowLeft, Camera, ChevronDown, ChevronRight, LogIn, Minus, Plus, Search, UserPlus, X } from "lucide-react";
import { styles } from "../styles.js";
import { resizeImageToAvatar, estimateGamesPerPlayer } from "../lib/utils.js";
import {
  emptyPlayerRecord,
  fetchAllPlayers,
  filterPlayersByQuery,
  recentPlayers,
  disambiguateDuplicateNames,
  savePlayerRecord,
} from "../lib/playerDatabase.js";
import { DEFAULT_ROTATION_MODE, ROTATION_MODE_DESCRIPTIONS } from "../lib/constants.js";
import { ROULETTE_DEFAULTS, ROULETTE_MODE, rouletteForecast } from "../lib/roulette.js";
import { TournamentTemplateService } from "../engines/TournamentTemplateService.js";
import { supabase } from "../lib/supabaseClient.js";
import { uploadPlayerPhoto } from "../lib/photoStorage.js";
import Avatar from "./Avatar.jsx";
import SectionLabel from "./SectionLabel.jsx";
import SkillToggle from "./SkillToggle.jsx";

const templateService = new TournamentTemplateService();

// Register Players Joining Today — Scalable Player Picker (see PROJECT.md).
// The default (no-search) view shows only a small, useful subset —
// "approximately 8-12 players" — never the whole database, so this screen
// stays usable whether the Player Database has 30 or 30,000 records. A
// search result LIST is also capped (a very common query, e.g. a single
// letter, could otherwise still return hundreds of rows) — SEARCH_RESULTS_LIMIT
// is generous enough that a real name search essentially never hits it,
// while still bounding the pathological case.
const DEFAULT_SUGGESTIONS_LIMIT = 10;
const SEARCH_RESULTS_LIMIT = 40;

export default function CreateSessionScreen({
  onStart,
  onBack,
  creating,
  createError,
  rotationModes,
  sessionTypes,
  tournamentFormats,
}) {
  const [venue, setVenue] = useState("Ormoc City Pickleball — Open Play");
  const [courts, setCourts] = useState(4);
  const [sessionType, setSessionType] = useState(sessionTypes?.[0]?.value ?? "openPlay");
  // Preselect DEFAULT_ROTATION_MODE (Skill Divisions) whenever the offered
  // list contains it, regardless of list order; otherwise the first option.
  const [rotationMode, setRotationMode] = useState(
    rotationModes?.some((m) => m.value === DEFAULT_ROTATION_MODE)
      ? DEFAULT_ROTATION_MODE
      : rotationModes?.[0]?.value ?? DEFAULT_ROTATION_MODE
  );
  const [tournamentFormat, setTournamentFormat] = useState(tournamentFormats?.[0]?.value ?? "roundRobin");
  // Expected Playing Opportunities — see PROJECT.md. Session Duration is
  // the organizer-facing input now; expectedGamesPerPlayer itself is
  // computed automatically (estimateGamesPerPlayer, below) rather than
  // typed directly, but the stored field name/shape passed to onStart is
  // unchanged — every downstream consumer (Progressive Skill Rotation's
  // phase calc, the mid-session Settings dialog, the simulator) keeps
  // working exactly as before, since it only ever sees a plain number.
  const [sessionDurationHours, setSessionDurationHours] = useState(2);
  const [avgMatchDurationMinutes, setAvgMatchDurationMinutes] = useState(15);
  // Create Session review (14 Nov 2026) — Session Duration only matters to
  // Progressive Skill Rotation (its mentorship -> separated phases are a
  // percentage of the expected games); every other mode ignores it, so the
  // section is shown for that mode alone. Roulette instead asks for what it
  // actually runs on: the number of rounds and the round timer.
  const isTournament = sessionType === "tournament";
  const isRoulette = !isTournament && rotationMode === ROULETTE_MODE;
  const needsDuration = !isTournament && rotationMode === "progressiveSkill";
  const [rouletteRounds, setRouletteRounds] = useState(ROULETTE_DEFAULTS.totalRounds);
  const [rouletteMinutes, setRouletteMinutes] = useState(ROULETTE_DEFAULTS.roundMinutes);
  const [roster, setRoster] = useState([]);

  // ---- Tournament Templates — see engines/TournamentTemplateService.js ----
  // "Start From Scratch" (the default) means templateConfig stays null and
  // nothing about this flow changes. "Use Template" pre-fills Number of
  // Courts here immediately; the rest of the template (mode/pools/
  // assignment method/qualifiers/court names/scoring rules) rides along on
  // the session record as `pendingTournamentTemplate` and is read once by
  // TournamentScheduleView the first time it renders, since those fields
  // don't exist until schedule-generation time in this app.
  const [templateChoice, setTemplateChoice] = useState("scratch"); // "scratch" | "template"
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || null;

  useEffect(() => {
    if (sessionType !== "tournament" || templates.length > 0) return;
    templateService
      .fetchAllTemplates()
      .then(async (list) => {
        setTemplates(list);
        const defaultId = await templateService.getDefaultTemplateId();
        if (defaultId && list.some((t) => t.id === defaultId)) setSelectedTemplateId(defaultId);
        else if (list.length > 0) setSelectedTemplateId(list[0].id);
      })
      .catch(() => {}); // template picker just won't populate — "Start From Scratch" still works
  }, [sessionType, templates.length]);

  // Applying a template pre-fills Number of Courts right away; the format
  // toggle also follows the template so the two stay consistent with each
  // other, same as picking it manually would.
  useEffect(() => {
    if (templateChoice !== "template" || !selectedTemplate) return;
    setCourts(selectedTemplate.courtsCount);
    setTournamentFormat(selectedTemplate.format);
  }, [templateChoice, selectedTemplate]);

  // ---- Player Database — see lib/playerDatabase.js ----
  const [playerDb, setPlayerDb] = useState([]);
  const [playerDbLoading, setPlayerDbLoading] = useState(true);
  const [playerDbError, setPlayerDbError] = useState("");
  const [registrationMode, setRegistrationMode] = useState("select"); // "select" | "create"
  const [search, setSearch] = useState("");

  // "Create New Player" form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const [nickname, setNickname] = useState("");
  const [skillInput, setSkillInput] = useState("beginner");
  const [photoDataUrl, setPhotoDataUrl] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [moreDetailsOpen, setMoreDetailsOpen] = useState(false);
  const [gender, setGender] = useState("");
  const [duprRating, setDuprRating] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchAllPlayers()
      .then((players) => {
        if (cancelled) return;
        setPlayerDb(players);
        // an empty database is more useful landing on "create" than showing
        // an empty search with no explanation
        if (players.length === 0) setRegistrationMode("create");
      })
      .catch(() => {
        if (!cancelled) setPlayerDbError("Couldn't load the player database — you can still create new players.");
      })
      .finally(() => {
        if (!cancelled) setPlayerDbLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const rosterIds = new Set(roster.map((p) => p.id));

  // adding from the database reuses that record's id as the roster entry's
  // id — see lib/playerDatabase.js's header comment for why that link matters
  const addExistingPlayer = (record) => {
    if (rosterIds.has(record.id)) return;
    setRoster((r) => [...r, { id: record.id, name: record.displayName, skill: record.skill, photo: record.photo }]);
  };

  const removePlayer = (id) => setRoster((r) => r.filter((p) => p.id !== id));
  const adjustCourts = (delta) => setCourts((c) => Math.min(8, Math.max(1, c + delta)));
  const canStart =
    venue.trim().length > 0 &&
    courts >= 1 &&
    !creating &&
    (!needsDuration || Number(sessionDurationHours) > 0) &&
    (!isRoulette || (Number(rouletteRounds) >= 1 && Number(rouletteMinutes) >= 1));
  const startBlockedReason = creating
    ? ""
    : venue.trim().length === 0
      ? "Give the session a name to start."
      : needsDuration && !(Number(sessionDurationHours) > 0)
        ? "Enter how many hours the session will run."
        : isRoulette && !(Number(rouletteRounds) >= 1 && Number(rouletteMinutes) >= 1)
          ? "Enter the number of rounds and the round timer."
          : "";
  const forecast = isRoulette ? rouletteForecast({ players: roster.length, courts, totalRounds: rouletteRounds, roundMinutes: rouletteMinutes }) : null;
  // The games-per-player figure stored on the session: Roulette knows it
  // exactly from rounds x courts; Progressive Skill estimates it from the
  // duration; other modes keep the same estimate from the default 2 h / 15
  // min (only TV Mode's progress bar reads it there).
  const expectedGames = isRoulette && forecast
    ? Math.max(1, forecast.gamesMax)
    : Math.max(1, estimateGamesPerPlayer({ sessionDurationHours: Number(sessionDurationHours) || 0, courtsCount: courts, registeredPlayers: roster.length, avgMatchDurationMinutes: Number(avgMatchDurationMinutes) || 0 }) || 1);
  // Section numbers follow what is actually shown.
  const playersStep = isTournament ? 6 : needsDuration || isRoulette ? 6 : 5;

  // Creating a new player always saves it to the database (this is what
  // makes the database grow from nothing — no separate migration step is
  // needed) and adds it to this session's roster in the same id. A save
  // failure doesn't block the organizer from continuing — the player still
  // joins the local roster — but is surfaced so it's not silently lost.
  const createAndAddPlayer = async () => {
    const trimmedFirst = firstName.trim();
    if (!trimmedFirst) return;
    // Player Photos & Broadcast Experience — see PROJECT.md's Optional
    // Player Photos note. A profile photo is now OPTIONAL for every newly
    // created player — Avatar's existing initials/colorForName fallback
    // covers a photo-less player everywhere they subsequently render (Open
    // Play TV Mode included), so this no longer blocks record creation.
    setSaveError("");
    const record = emptyPlayerRecord({
      firstName: trimmedFirst,
      lastName,
      displayName: displayName.trim() || trimmedFirst,
      nickname,
      photo: null,
      gender: gender || null,
      skill: skillInput,
      duprRating,
      contactNumber,
      notes,
    });
    // Phase 3B: a newly-picked photo is always uploaded to Storage, never
    // written as base64 — an upload failure never blocks this player from
    // joining (same "a save failure doesn't block the roster add" precedent
    // this function already follows for savePlayerRecord itself below).
    if (photoDataUrl) {
      try {
        record.photo = await uploadPlayerPhoto(supabase, record.id, photoDataUrl);
      } catch (e) {
        setSaveError(`Couldn't upload ${record.displayName}'s photo, but they've been added without one.`);
      }
    }
    try {
      await savePlayerRecord(record);
      setPlayerDb((db) => [...db, record]);
    } catch (e) {
      setSaveError(`Couldn't save ${record.displayName} to the player database, but they've been added to this session.`);
    }
    setRoster((r) => [...r, { id: record.id, name: record.displayName, skill: record.skill, photo: record.photo }]);
    setFirstName("");
    setLastName("");
    setDisplayName("");
    setDisplayNameTouched(false);
    setNickname("");
    setPhotoDataUrl(null);
    setGender("");
    setDuprRating("");
    setContactNumber("");
    setNotes("");
    setMoreDetailsOpen(false);
  };

  const activePlayers = playerDb.filter((p) => p.active);
  const trimmedSearch = search.trim();

  // No query -> a small, bounded "recently used" default (see
  // recentPlayers' own comment for why updatedAt is the right signal),
  // excluding whoever's already registered for today — they're shown in
  // "Today's Players" below instead, so the limited default slots aren't
  // spent on players the organizer doesn't need to pick again. A real
  // query -> the existing name/nickname/contact search, sorted
  // alphabetically same as before, capped defensively so an overly broad
  // query can't still render hundreds of rows.
  const defaultSuggestions = recentPlayers(
    activePlayers.filter((p) => !rosterIds.has(p.id)),
    DEFAULT_SUGGESTIONS_LIMIT
  );
  const matchingSearchResults = trimmedSearch
    ? filterPlayersByQuery(activePlayers, search).sort((a, b) => a.displayName.localeCompare(b.displayName))
    : [];
  const searchResultsOverflow = trimmedSearch ? Math.max(0, matchingSearchResults.length - SEARCH_RESULTS_LIMIT) : 0;
  const searchResults = trimmedSearch ? matchingSearchResults.slice(0, SEARCH_RESULTS_LIMIT) : defaultSuggestions;
  const duplicateNameHints = disambiguateDuplicateNames(searchResults);

  return (
    <div style={styles.createWrap}>
      <button style={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>

      <SectionLabel>1. Session name</SectionLabel>
      <input
        style={{ ...styles.input, display: "block", width: "100%", boxSizing: "border-box" }}
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

      {sessionTypes && sessionTypes.length > 0 && (
        <>
          <SectionLabel>3. Session type</SectionLabel>
          <div style={styles.skillToggle}>
            {sessionTypes.map((t) => (
              <button
                key={t.value}
                type="button"
                style={styles.skillToggleBtn(sessionType === t.value)}
                onClick={() => setSessionType(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}

      {sessionType !== "tournament" && rotationModes && rotationModes.length > 0 && (
        <>
          <SectionLabel>4. Rotation strategy</SectionLabel>
          {/* Standard modes first (recommended one tagged), experimental
              modes in their own labelled group so an organizer can't pick
              one by accident — see EXPERIMENTAL_ROTATION_MODES in
              lib/constants.js. Option text only: the stored value and the
              label shown in Scorer/reports are untouched. */}
          <select
            style={{ ...styles.rotationSelect, width: "100%", boxSizing: "border-box" }}
            value={rotationMode}
            onChange={(e) => setRotationMode(e.target.value)}
          >
            {rotationModes
              .filter((m) => !m.experimental)
              .map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                  {m.recommended ? " — Recommended" : ""}
                </option>
              ))}
            {rotationModes.some((m) => m.experimental) && (
              <optgroup label="Experimental (opt-in)">
                {rotationModes
                  .filter((m) => m.experimental)
                  .map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
          {ROTATION_MODE_DESCRIPTIONS[rotationMode] && (
            <div style={styles.modeNote} data-testid="mode-note">
              {/* one short line per sentence — easier to scan than a paragraph */}
              <ul style={styles.modeNoteList}>
                {ROTATION_MODE_DESCRIPTIONS[rotationMode]
                  .split(/(?<=[.!?])\s+/)
                  .filter(Boolean)
                  .map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
              </ul>
              <span style={styles.modeNoteFoot}>The rotation can't be changed once the session has started.</span>
            </div>
          )}
        </>
      )}

      {sessionType === "tournament" && (
        <>
          <SectionLabel>4. Create tournament</SectionLabel>
          <div style={styles.skillToggle}>
            <button
              type="button"
              style={styles.skillToggleBtn(templateChoice === "scratch")}
              onClick={() => setTemplateChoice("scratch")}
            >
              Start From Scratch
            </button>
            <button
              type="button"
              style={styles.skillToggleBtn(templateChoice === "template")}
              onClick={() => setTemplateChoice("template")}
              disabled={templates.length === 0}
            >
              Use Template
            </button>
          </div>

          {templateChoice === "template" && (
            <>
              {templates.length === 0 ? (
                <p style={styles.editHint}>No templates yet — create one from "Manage tournament templates" on the landing page.</p>
              ) : (
                <>
                  <select
                    style={styles.rotationSelect}
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {selectedTemplate && (
                    <p style={styles.editHint}>
                      Pre-fills {selectedTemplate.mode === "doubles" ? "Doubles" : "Singles"}, {selectedTemplate.poolCount} pool
                      {selectedTemplate.poolCount === 1 ? "" : "s"}, top {selectedTemplate.advancesPerPool} advancing, and{" "}
                      {selectedTemplate.courtsCount} courts — all still editable on the Schedule tab before you generate it.
                    </p>
                  )}
                </>
              )}
            </>
          )}

          <SectionLabel>5. Tournament format</SectionLabel>
          <p style={styles.editHint}>
            {tournamentFormat === "roundRobin"
              ? "Every registered player/team plays every other once; the Schedule tab generates the pool schedule from whoever's registered."
              : "A real, standalone bracket — Winners Bracket, Losers Bracket, and Grand Final — seeded directly from registered/checked-in players, no pool stage first. Generate it from the Schedule tab once your roster is set."}
          </p>
          <select
            style={styles.rotationSelect}
            value={tournamentFormat}
            onChange={(e) => setTournamentFormat(e.target.value)}
          >
            {tournamentFormats.map((f) => (
              <option key={f.value} value={f.value} disabled={f.implemented === false}>
                {f.label}
              </option>
            ))}
          </select>
        </>
      )}

      {isRoulette && (
        <>
          <SectionLabel>5. Rounds</SectionLabel>
          <div style={styles.checkinRow}>
            <label style={styles.settingsField}>
              Number of rounds
              <input type="number" min={1} style={{ ...styles.expectedGamesInput, width: 64 }} value={rouletteRounds} onChange={(e) => setRouletteRounds(e.target.value)} aria-label="Roulette number of rounds" />
            </label>
            <label style={styles.settingsField}>
              Round timer (minutes)
              <input type="number" min={1} style={{ ...styles.expectedGamesInput, width: 64 }} value={rouletteMinutes} onChange={(e) => setRouletteMinutes(e.target.value)} aria-label="Roulette round minutes" />
            </label>
          </div>
          <div style={styles.sessionInfoCard}>
            <div style={styles.sessionInfoItem}>
              <span style={styles.sessionInfoLabel}>What to expect</span>
              <span style={styles.sessionInfoValue} data-testid="roulette-forecast">
                {forecast
                  ? `${forecast.playPerRound} play on ${forecast.courtsUsed} court${forecast.courtsUsed === 1 ? "" : "s"}${forecast.sitPerRound > 0 ? `, ${forecast.sitPerRound} sit out` : ""} each round · ${forecast.gamesMin === forecast.gamesMax ? forecast.gamesMin : `${forecast.gamesMin}–${forecast.gamesMax}`} games per player · about ${forecast.playMinutes} min of play`
                  : "Register at least 4 players to see the forecast."}
              </span>
            </div>
          </div>
          <p style={styles.editHint}>Both can still be changed in Session Settings after the session starts. Late arrivals join from the next round.</p>
        </>
      )}

      {needsDuration && (
        <>
          <SectionLabel>5. Session duration</SectionLabel>
          <p style={styles.editHint}>
            How long today's session will run, in hours (decimals allowed — e.g. 1.5, 2.5). Progressive Skill uses the
            expected games per player to decide when to move from mixed play to separated levels.
          </p>
          <div style={styles.checkinRow}>
            <label style={styles.settingsField}>
              Hours
              <input
                type="number"
                min={0.5}
                step={0.5}
                style={{ ...styles.expectedGamesInput, width: 64 }}
                value={sessionDurationHours}
                onChange={(e) => setSessionDurationHours(e.target.value)}
              />
            </label>
            <label style={styles.settingsField}>
              Average match duration (minutes)
              <input
                type="number"
                min={1}
                style={{ ...styles.expectedGamesInput, width: 64 }}
                value={avgMatchDurationMinutes}
                onChange={(e) => setAvgMatchDurationMinutes(e.target.value)}
              />
            </label>
          </div>
          {/* Expected Playing Opportunities — see PROJECT.md. Read-only,
              always computed (estimateGamesPerPlayer) — never a manually
              editable field, and it recomputes live off registered
              players/courts/duration/match-duration on every render since
              none of those are debounced or gated behind a save action. */}
          <div style={styles.sessionInfoCard}>
            <div style={styles.sessionInfoItem}>
              <span style={styles.sessionInfoLabel}>Expected Playing Opportunities</span>
              <span style={styles.sessionInfoValue}>
                {roster.length === 0
                  ? "Register players to see the estimate"
                  : `${estimateGamesPerPlayer({
                      sessionDurationHours: Number(sessionDurationHours) || 0,
                      courtsCount: courts,
                      registeredPlayers: roster.length,
                      avgMatchDurationMinutes: Number(avgMatchDurationMinutes) || 0,
                    })} games per player`}
              </span>
            </div>
          </div>
        </>
      )}

      <SectionLabel>{playersStep}. Register players joining today ({roster.length})</SectionLabel>
      <p style={styles.editHint}>
        This is just the guest list — everyone still needs to Check In once they're actually at the courts. You can
        also add players after the session starts.{" "}
        {isTournament
          ? ""
          : isRoulette
            ? "Roulette draws everyone from one pool, so skill level isn't used."
            : rotationMode === "adaptiveSkill"
              ? "Skill level decides each player's division (Beginner or Intermediate)."
              : rotationMode === "pointsAdaptive" || rotationMode === "adaptiveRanking"
                ? "Matching uses each player's Open Play Points."
                : "Skill level is used to balance the teams."}
      </p>

      {/* Today's Players — compact, near the top, so an organizer already
          registered can be seen (and removed) at a glance without ever
          having to search for them again. Same roster/removePlayer this
          screen has always used — only its position and layout changed. */}
      <p style={styles.pickerGroupLabel}>Today's Players ({roster.length})</p>
      {roster.length === 0 ? (
        <p style={styles.todaysPlayersEmpty}>No one registered yet — add players below.</p>
      ) : (
        <div style={styles.todaysPlayersWrap}>
          {roster.map((p) => (
            <div key={p.id} style={styles.todaysPlayerChip}>
              <Avatar player={p} size={20} />
              <span>{p.name}</span>
              <span style={styles.skillTag(p.skill)}>{p.skill === "intermediate" ? "INT" : "BEG"}</span>
              <button style={styles.rosterRemoveBtn} onClick={() => removePlayer(p.id)} aria-label={`remove ${p.name}`}>
                <X size={11} strokeWidth={3} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={styles.skillToggle}>
        <button
          type="button"
          style={styles.skillToggleBtn(registrationMode === "select")}
          onClick={() => setRegistrationMode("select")}
        >
          Select existing player
        </button>
        <button
          type="button"
          style={styles.skillToggleBtn(registrationMode === "create")}
          onClick={() => setRegistrationMode("create")}
        >
          Create new player
        </button>
      </div>

      {registrationMode === "select" && (
        <div>
          {playerDbError && <p style={styles.editWarning}>{playerDbError}</p>}
          <div style={styles.historySearchBox}>
            <Search size={14} strokeWidth={2.5} />
            <input
              style={styles.historySearchInput}
              placeholder="Search player by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {playerDbLoading ? (
            <p style={styles.editHint}>Loading player database…</p>
          ) : activePlayers.length === 0 ? (
            <p style={styles.editWarning}>
              No players in the database yet — switch to "Create new player" to add your first one.
            </p>
          ) : searchResults.length === 0 ? (
            <div>
              <p style={styles.editWarning}>No players found{trimmedSearch ? ` for "${trimmedSearch}"` : ""}.</p>
              <button
                type="button"
                style={styles.fixTeamsBtn}
                onClick={() => {
                  setRegistrationMode("create");
                  if (trimmedSearch && !firstName) {
                    setFirstName(trimmedSearch);
                    setDisplayName(trimmedSearch);
                  }
                }}
              >
                <UserPlus size={13} strokeWidth={2.5} />
                Create New Player
              </button>
            </div>
          ) : (
            <>
              <p style={styles.pickerGroupLabel}>
                {trimmedSearch ? `Search results (${matchingSearchResults.length})` : "Recently added"}
              </p>
              {/* Scalability — this grid only ever holds a bounded subset
                  (DEFAULT_SUGGESTIONS_LIMIT with no query, capped at
                  SEARCH_RESULTS_LIMIT with one) regardless of how large the
                  Player Database actually is; see those constants' own
                  comment. */}
              <div style={styles.registerPlayerGrid}>
                {searchResults.map((p) => {
                  const alreadyAdded = rosterIds.has(p.id);
                  const duplicateHint = duplicateNameHints.get(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      style={{ ...styles.editChip, ...(alreadyAdded ? styles.btnDisabled : {}) }}
                      onClick={() => addExistingPlayer(p)}
                      disabled={alreadyAdded}
                    >
                      <Avatar player={{ name: p.displayName, photo: p.photo }} size={22} />
                      <span style={styles.editChipName}>
                        {p.displayName}
                        {duplicateHint && <span style={styles.playerDbDuplicateHint}> · {duplicateHint}</span>}
                        {p.duprRating != null && <span style={styles.playerDbMeta}>DUPR {p.duprRating}</span>}
                      </span>
                      <span style={styles.skillTag(p.skill)}>{p.skill === "intermediate" ? "INT" : "BEG"}</span>
                      {alreadyAdded ? <span style={styles.playerDbMeta}>Added</span> : <UserPlus size={14} strokeWidth={2.5} />}
                    </button>
                  );
                })}
              </div>
              {searchResultsOverflow > 0 && (
                <p style={styles.editHint}>
                  Showing {SEARCH_RESULTS_LIMIT} of {matchingSearchResults.length} matches — keep typing to narrow it down.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {registrationMode === "create" && (
        <div>
          <div style={styles.checkinRow}>
            <input
              style={styles.input}
              placeholder="First name"
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                if (!displayNameTouched) setDisplayName(e.target.value);
              }}
            />
            <input
              style={styles.input}
              placeholder="Last name (optional)"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <input
            style={{ ...styles.input, ...styles.playerSearchInput }}
            placeholder="Display name (shown everywhere)"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setDisplayNameTouched(true);
            }}
          />
          <input
            style={{ ...styles.input, ...styles.playerSearchInput }}
            placeholder="Nickname (optional)"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
          <SkillToggle value={skillInput} onChange={setSkillInput} />
          <div style={styles.photoRow}>
            <div style={styles.photoPreviewWrap}>
              {photoDataUrl ? (
                <img src={photoDataUrl} alt="" style={styles.photoPreview} />
              ) : (
                <div style={styles.photoPlaceholder}>
                  <Camera size={18} strokeWidth={2} color="var(--color-text-faint)" />
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
              {photoBusy ? "Adding photo…" : photoDataUrl ? "Change photo" : "Add a photo"}
            </label>
          </div>

          <button
            type="button"
            style={styles.settingsToggleBtn}
            onClick={() => setMoreDetailsOpen((v) => !v)}
          >
            {moreDetailsOpen ? <ChevronDown size={13} strokeWidth={2.5} /> : <ChevronRight size={13} strokeWidth={2.5} />}
            More details (optional)
          </button>
          {moreDetailsOpen && (
            <div style={styles.settingsPanel}>
              <label style={styles.settingsField}>
                Gender
                <select style={styles.rotationSelect} value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="">Prefer not to say</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label style={styles.settingsField}>
                DUPR rating
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={8}
                  style={styles.expectedGamesInput}
                  value={duprRating}
                  onChange={(e) => setDuprRating(e.target.value)}
                />
              </label>
              <label style={styles.settingsField}>
                Contact number
                <input
                  type="tel"
                  style={styles.input}
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                />
              </label>
              <label style={{ ...styles.settingsField, width: "100%" }}>
                Notes
                <textarea
                  style={styles.textareaInput}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>
          )}

          {saveError && <p style={styles.editWarning}>{saveError}</p>}

          <div style={styles.editActions}>
            <button
              type="button"
              style={{ ...styles.primaryBtn, ...(!firstName.trim() ? styles.btnDisabled : {}) }}
              onClick={createAndAddPlayer}
              disabled={!firstName.trim()}
            >
              <Plus size={16} strokeWidth={2.5} />
              Add to session &amp; save to database
            </button>
          </div>
        </div>
      )}

      {/* Today's Players (near the top of this section, above) is now the
          one place the registered-today roster is shown — no second,
          duplicate list at the bottom. */}

      {createError && <div style={styles.pinError}>{createError}</div>}

      <button
        style={{ ...styles.primaryBtn, ...styles.startBtn, ...(!canStart ? styles.btnDisabled : {}) }}
        onClick={() =>
          canStart &&
          onStart(
            venue.trim(),
            courts,
            roster,
            rotationMode,
            expectedGames,
            sessionType,
            sessionType === "tournament" ? tournamentFormat : null,
            sessionType === "tournament" && templateChoice === "template" && selectedTemplate
              ? templateService.applyTemplate(selectedTemplate)
              : null,
            isRoulette ? { roulette: { totalRounds: Math.round(Number(rouletteRounds)), roundMinutes: Math.round(Number(rouletteMinutes)) } } : null
          )
        }
        disabled={!canStart}
      >
        <LogIn size={16} strokeWidth={2.5} />
        {creating ? "Starting…" : "Start session"}
      </button>
      {startBlockedReason && <p style={styles.startHint}>{startBlockedReason}</p>}
    </div>
  );
}

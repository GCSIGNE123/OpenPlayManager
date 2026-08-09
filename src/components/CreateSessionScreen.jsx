import { useEffect, useState } from "react";
import { ArrowLeft, Camera, ChevronDown, ChevronRight, LogIn, Minus, Plus, Search, UserPlus, X } from "lucide-react";
import { styles } from "../styles.js";
import { resizeImageToAvatar, estimateGamesPerPlayer } from "../lib/utils.js";
import { emptyPlayerRecord, fetchAllPlayers, filterPlayersByQuery, savePlayerRecord } from "../lib/playerDatabase.js";
import { TournamentTemplateService } from "../engines/TournamentTemplateService.js";
import Avatar from "./Avatar.jsx";
import SectionLabel from "./SectionLabel.jsx";
import SkillToggle from "./SkillToggle.jsx";

const templateService = new TournamentTemplateService();

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
  const [rotationMode, setRotationMode] = useState(rotationModes?.[0]?.value ?? "continuous");
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
    (sessionType === "tournament" || Number(sessionDurationHours) > 0);

  // Creating a new player always saves it to the database (this is what
  // makes the database grow from nothing — no separate migration step is
  // needed) and adds it to this session's roster in the same id. A save
  // failure doesn't block the organizer from continuing — the player still
  // joins the local roster — but is surfaced so it's not silently lost.
  const createAndAddPlayer = async () => {
    const trimmedFirst = firstName.trim();
    if (!trimmedFirst) return;
    // Player Photos & Broadcast Experience — see PROJECT.md. A profile
    // photo is required for every NEWLY created player going forward
    // (Open Play TV Mode is built around visual recognition) — but this
    // only gates the "create a brand-new record" path. Selecting an
    // already-existing player (addExistingPlayer, above) is deliberately
    // never gated on this, so a photo-less player already in the Player
    // Database or an older session roster is never locked out; Avatar's
    // existing initials fallback covers them until a photo is added.
    if (!photoDataUrl) {
      setSaveError("A profile photo is required to add a new player.");
      return;
    }
    setSaveError("");
    const record = emptyPlayerRecord({
      firstName: trimmedFirst,
      lastName,
      displayName: displayName.trim() || trimmedFirst,
      nickname,
      photo: photoDataUrl || null,
      gender: gender || null,
      skill: skillInput,
      duprRating,
      contactNumber,
      notes,
    });
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
  const searchResults = filterPlayersByQuery(activePlayers, search).sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );

  return (
    <div style={styles.createWrap}>
      <button style={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>

      <SectionLabel>1. Session name</SectionLabel>
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
          <select
            style={styles.rotationSelect}
            value={rotationMode}
            onChange={(e) => setRotationMode(e.target.value)}
          >
            {rotationModes.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
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

      {sessionType !== "tournament" && (
        <>
          <SectionLabel>5. Session duration</SectionLabel>
          <p style={styles.editHint}>
            How long today's session will run, in hours (decimals allowed — e.g. 1.5, 2.5). Used below to estimate
            how many games each player can expect to play.
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
                {estimateGamesPerPlayer({
                  sessionDurationHours: Number(sessionDurationHours) || 0,
                  courtsCount: courts,
                  registeredPlayers: roster.length,
                  avgMatchDurationMinutes: Number(avgMatchDurationMinutes) || 0,
                })}{" "}
                Games
              </span>
            </div>
          </div>
        </>
      )}

      <SectionLabel>6. Register players joining today ({roster.length})</SectionLabel>
      <p style={styles.editHint}>
        This is just the guest list — everyone still needs to Check In once they're actually at the courts.
        Skill level is used to pair a beginner with an intermediate player as teammates.
      </p>

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
              placeholder="Search players by name…"
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
            <p style={styles.editWarning}>No players match "{search.trim()}".</p>
          ) : (
            <div style={styles.editGrid}>
              {searchResults.map((p) => {
                const alreadyAdded = rosterIds.has(p.id);
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
                      {p.duprRating != null && <span style={styles.playerDbMeta}>DUPR {p.duprRating}</span>}
                    </span>
                    <span style={styles.skillTag(p.skill)}>{p.skill === "intermediate" ? "INT" : "BEG"}</span>
                    {alreadyAdded ? <span style={styles.playerDbMeta}>Added</span> : <UserPlus size={14} strokeWidth={2.5} />}
                  </button>
                );
              })}
            </div>
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
              {photoBusy ? "Adding photo…" : photoDataUrl ? "Change photo" : "Add a photo (required)"}
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
              style={{ ...styles.primaryBtn, ...(!firstName.trim() || !photoDataUrl ? styles.btnDisabled : {}) }}
              onClick={createAndAddPlayer}
              disabled={!firstName.trim() || !photoDataUrl}
            >
              <Plus size={16} strokeWidth={2.5} />
              Add to session &amp; save to database
            </button>
          </div>
        </div>
      )}

      {roster.length > 0 && (
        <ul style={styles.rosterList}>
          {roster.map((p) => (
            <li key={p.id} style={styles.rosterItem}>
              <Avatar player={p} size={26} />
              <span style={styles.queueName}>{p.name}</span>
              <span style={styles.skillTag(p.skill)}>{p.skill === "intermediate" ? "INT" : "BEG"}</span>
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
        onClick={() =>
          canStart &&
          onStart(
            venue.trim(),
            courts,
            roster,
            rotationMode,
            Math.max(
              1,
              estimateGamesPerPlayer({
                sessionDurationHours: Number(sessionDurationHours) || 0,
                courtsCount: courts,
                registeredPlayers: roster.length,
                avgMatchDurationMinutes: Number(avgMatchDurationMinutes) || 0,
              }) || 1
            ),
            sessionType,
            sessionType === "tournament" ? tournamentFormat : null,
            sessionType === "tournament" && templateChoice === "template" && selectedTemplate
              ? templateService.applyTemplate(selectedTemplate)
              : null
          )
        }
        disabled={!canStart}
      >
        <LogIn size={16} strokeWidth={2.5} />
        {creating ? "Starting…" : "Start session"}
      </button>
    </div>
  );
}

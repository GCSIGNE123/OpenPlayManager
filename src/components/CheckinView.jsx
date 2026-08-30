import { useEffect, useState } from "react";
import { Camera, Check, LogIn, QrCode, Search, UserPlus, X } from "lucide-react";
import { styles } from "../styles.js";
import { fetchAllPlayers, filterPlayersByQuery } from "../lib/playerDatabase.js";
import Avatar from "./Avatar.jsx";
import CheckInScannerModal from "./CheckInScannerModal.jsx";
import QueueList from "./QueueList.jsx";
import SectionLabel from "./SectionLabel.jsx";
import SkillToggle from "./SkillToggle.jsx";

export default function CheckinView({
  sessionCode,
  registeredNotHere,
  checkInExisting,
  checkInFromDatabase,
  onChangeSkillPreCheckIn,
  nameInput,
  setNameInput,
  skillInput,
  setSkillInput,
  quickAddCheckIn,
  checkinMsg,
  waitingPlayers,
  players,
  nextMatchups,
  photoDataUrl,
  setPhotoDataUrl,
  handlePhotoSelect,
  photoBusy,
}) {
  const [scannerOpen, setScannerOpen] = useState(false);

  // Registered Player Check-In (Player Database) — see PROJECT.md/
  // lib/playerDatabase.js. Same fetch/search pattern CreateSessionScreen.jsx
  // already uses (fetchAllPlayers/filterPlayersByQuery, both UNCHANGED) —
  // this is a second UI surface for the same registry, not a new one. This
  // is for a player who exists in the club-wide Player Database but wasn't
  // specifically pre-added to THIS session's roster at Create Session time
  // (registeredNotHere above only ever reflects that pre-loaded roster) —
  // without this, the only option was Walk-in, which silently created a
  // brand-new, disconnected session-player identity for someone who already
  // has a real one.
  const [dbSearch, setDbSearch] = useState("");
  const [playerDb, setPlayerDb] = useState([]);
  const [playerDbLoading, setPlayerDbLoading] = useState(true);
  const [playerDbError, setPlayerDbError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchAllPlayers()
      .then((list) => {
        if (!cancelled) setPlayerDb(list);
      })
      .catch(() => {
        if (!cancelled) setPlayerDbError("Couldn't load the player database — Walk-in is still available.");
      })
      .finally(() => {
        if (!cancelled) setPlayerDbLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeDbPlayers = playerDb.filter((p) => p.active);
  const dbSearchResults = dbSearch.trim() ? filterPlayersByQuery(activeDbPlayers, dbSearch).sort((a, b) => a.displayName.localeCompare(b.displayName)) : [];

  return (
    <div style={styles.checkinWrap}>
      <SectionLabel>Check In Player</SectionLabel>
      <button type="button" style={styles.secondaryBtn} onClick={() => setScannerOpen(true)}>
        <QrCode size={14} strokeWidth={2.5} /> Scan Player QR
      </button>
      {scannerOpen && <CheckInScannerModal sessionCode={sessionCode} onClose={() => setScannerOpen(false)} />}

      <SectionLabel>Search registered players (Player Database)</SectionLabel>
      {playerDbError && <p style={styles.editWarning}>{playerDbError}</p>}
      <div style={styles.historySearchBox}>
        <Search size={14} strokeWidth={2.5} />
        <input
          style={styles.historySearchInput}
          placeholder="Search by name…"
          value={dbSearch}
          onChange={(e) => setDbSearch(e.target.value)}
        />
      </div>
      {!playerDbLoading && dbSearch.trim() && (
        dbSearchResults.length === 0 ? (
          <p style={styles.emptyQueue}>No registered players match "{dbSearch.trim()}".</p>
        ) : (
          <ul style={styles.rosterList}>
            {dbSearchResults.map((p) => {
              const sessionEntry = players?.[p.id];
              const alreadyCheckedIn = sessionEntry?.checkedIn;
              return (
                <li key={p.id} style={styles.rosterItem}>
                  <Avatar player={{ name: p.displayName, photo: p.photo }} size={26} />
                  <span style={styles.queueName}>{p.displayName}</span>
                  {p.skill && <span style={styles.skillTag(p.skill)}>{p.skill === "intermediate" ? "INT" : "BEG"}</span>}
                  <button
                    style={{ ...styles.checkInTapBtn, ...(alreadyCheckedIn ? styles.btnDisabled : {}) }}
                    onClick={() => checkInFromDatabase(p)}
                    disabled={alreadyCheckedIn}
                  >
                    {alreadyCheckedIn ? (
                      <>Already checked in</>
                    ) : (
                      <>
                        <UserPlus size={12} strokeWidth={2.5} />
                        Check in
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )
      )}

      <SectionLabel>Registered players not yet here ({registeredNotHere.length})</SectionLabel>
      {registeredNotHere.length === 0 ? (
        <p style={styles.emptyQueue}>No one registered is waiting to check in.</p>
      ) : (
        <ul style={styles.rosterList}>
          {registeredNotHere.map((p) => (
            <li key={p.id} style={styles.rosterItem}>
              <Avatar player={p} size={26} />
              <span style={styles.queueName}>{p.name}</span>
              {p.skill && (
                <button
                  style={styles.skillTagButton(p.skill)}
                  onClick={() =>
                    onChangeSkillPreCheckIn(p.id, p.skill === "intermediate" ? "beginner" : "intermediate")
                  }
                  title={`Tap to change to ${p.skill === "intermediate" ? "Beginner" : "Intermediate"} before check-in`}
                >
                  {p.skill === "intermediate" ? "INT" : "BEG"}
                </button>
              )}
              <button style={styles.checkInTapBtn} onClick={() => checkInExisting(p.id)}>
                <LogIn size={12} strokeWidth={2.5} />
                Check in
              </button>
            </li>
          ))}
        </ul>
      )}

      <SectionLabel>Walk-in (not registered)</SectionLabel>
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
          {photoBusy ? "Adding photo…" : photoDataUrl ? "Change photo" : "Add a photo (required)"}
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
        <button
          style={{ ...styles.primaryBtn, ...(!nameInput.trim() || !photoDataUrl ? styles.btnDisabled : {}) }}
          onClick={quickAddCheckIn}
          disabled={!nameInput.trim() || !photoDataUrl}
        >
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
      <QueueList queueIds={waitingPlayers.map((p) => p.id)} players={players} nextMatchups={nextMatchups} />
    </div>
  );
}

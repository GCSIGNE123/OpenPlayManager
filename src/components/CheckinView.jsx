import { Camera, Check, LogIn, X } from "lucide-react";
import { styles } from "../styles.js";
import Avatar from "./Avatar.jsx";
import QueueList from "./QueueList.jsx";
import SectionLabel from "./SectionLabel.jsx";
import SkillToggle from "./SkillToggle.jsx";

export default function CheckinView({
  registeredNotHere,
  checkInExisting,
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

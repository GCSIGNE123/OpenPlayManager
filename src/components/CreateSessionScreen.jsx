import { useState } from "react";
import { ArrowLeft, Camera, LogIn, Minus, Plus, X } from "lucide-react";
import { styles } from "../styles.js";
import { resizeImageToAvatar, uid } from "../lib/utils.js";
import Avatar from "./Avatar.jsx";
import SectionLabel from "./SectionLabel.jsx";
import SkillToggle from "./SkillToggle.jsx";

export default function CreateSessionScreen({ onStart, onBack, creating, createError }) {
  const [venue, setVenue] = useState("Ormoc City Pickleball — Open Play");
  const [courts, setCourts] = useState(4);
  const [roster, setRoster] = useState([]);
  const [nameInput, setNameInput] = useState("");
  const [skillInput, setSkillInput] = useState("beginner");
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
    setRoster((r) => [...r, { id: uid(), name, skill: skillInput, photo: photoDataUrl || null }]);
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
        Skill level is used to pair a beginner with an intermediate player as teammates.
      </p>
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
        onClick={() => canStart && onStart(venue.trim(), courts, roster)}
        disabled={!canStart}
      >
        <LogIn size={16} strokeWidth={2.5} />
        {creating ? "Starting…" : "Start session"}
      </button>
    </div>
  );
}

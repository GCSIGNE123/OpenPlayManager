import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Camera, Plus, Search, X } from "lucide-react";
import { styles } from "../styles.js";
import { fetchAllPlayers, savePlayerRecord, filterPlayersByQuery, emptyPlayerRecord } from "../lib/playerDatabase.js";
import { fetchAllPlayerRatings, fetchPlayerRating } from "../lib/ratingModel.js";
import { RatingEngine } from "../engines/RatingEngine.js";
import { resizeImageToAvatar } from "../lib/utils.js";
import Avatar from "./Avatar.jsx";
import SectionLabel from "./SectionLabel.jsx";
import SkillToggle from "./SkillToggle.jsx";

const ratingEngine = new RatingEngine();

// Player Management — see PROJECT.md. Replaces Membership Management as
// the landing entry point (MembershipScreen.jsx/MembershipService.js are
// left completely untouched on disk — LeagueManagerScreen.jsx and
// TournamentSettingsView.jsx both still actively depend on
// MembershipService.validateEligibility for real eligibility gating,
// unrelated to this module). This screen is a directory/profile surface
// over the same Player Database every other part of the app already
// reads/writes (lib/playerDatabase.js) — no new player identity model,
// no duplicated statistics logic: lifetime Games/Wins/Rating come from
// the existing Club Rating Engine (fetchPlayerRating/RatingEngine.
// deriveRatingView, the same data RatingsScreen.jsx's leaderboard already
// uses), not a new aggregation.
const SKILL_FILTERS = [
  { value: "all", label: "All Skills" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const SORTS = [
  { id: "name", label: "Name" },
  { id: "games", label: "Most Games" },
  { id: "winRate", label: "Highest Win Rate" },
  { id: "rating", label: "Highest Rating" },
  { id: "joined", label: "Date Joined" },
];

function formatDate(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Zero-rating view for a player who's never played a rated match yet —
// same shape RatingEngine.deriveRatingView produces, so callers never need
// a null-check branch.
function emptyRatingView() {
  return { currentRating: null, totalMatches: 0, wins: 0, losses: 0, winPct: 0, trend: 0 };
}

// One directory row — Photo/Name/Contact/Skill/Games/Wins/Rating/Joined,
// per the spec's exact card field list. Reuses Avatar.jsx unchanged (same
// photo-or-initials-fallback component Open Play/Tournament/TV Mode all
// already render through), just shaped from a PlayerRecord (displayName,
// not name) via a one-line prop shim.
function PlayerRow({ player, ratingView, onOpen }) {
  return (
    <li style={{ ...styles.rosterItem, cursor: "pointer" }} onClick={() => onOpen(player.id)} role="button" tabIndex={0}>
      <Avatar player={{ name: player.displayName, photo: player.photo }} size={40} />
      <span style={{ fontWeight: 700 }}>{player.displayName}</span>
      <span style={styles.editHint}>{player.contactNumber || "No contact on file"}</span>
      <span style={styles.skillTag(player.skill)}>{player.skill === "advanced" ? "ADV" : player.skill === "intermediate" ? "INT" : "BEG"}</span>
      <span style={styles.queueSourceTag}>{ratingView.totalMatches} games</span>
      <span style={styles.queueSourceTag}>{ratingView.wins} wins</span>
      <span style={styles.queueSourceTag}>{ratingView.currentRating ?? "Unrated"}</span>
      <span style={styles.editHint}>Joined {formatDate(player.createdAt)}</span>
      {!player.active && <span style={styles.resultTag("loss")}>INACTIVE</span>}
    </li>
  );
}

function DirectoryPanel({ players, ratings, onOpen, onAdd }) {
  const [query, setQuery] = useState("");
  const [skillFilter, setSkillFilter] = useState("all");
  const [showInactiveOnly, setShowInactiveOnly] = useState(false);
  const [sortKey, setSortKey] = useState("name");

  const ratingFor = (id) => ratings.get(id) ?? emptyRatingView();

  const rows = useMemo(() => {
    let list = filterPlayersByQuery(players, query);
    if (skillFilter !== "all") list = list.filter((p) => p.skill === skillFilter);
    if (showInactiveOnly) list = list.filter((p) => !p.active);
    const compare = {
      name: (a, b) => a.displayName.localeCompare(b.displayName),
      games: (a, b) => ratingFor(b.id).totalMatches - ratingFor(a.id).totalMatches,
      winRate: (a, b) => ratingFor(b.id).winPct - ratingFor(a.id).winPct,
      rating: (a, b) => (ratingFor(b.id).currentRating ?? -1) - (ratingFor(a.id).currentRating ?? -1),
      joined: (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
    };
    return [...list].sort(compare[sortKey]);
  }, [players, ratings, query, skillFilter, showInactiveOnly, sortKey]);

  return (
    <div>
      <div style={styles.editActions}>
        <button type="button" style={styles.primaryBtn} onClick={onAdd}>
          <Plus size={14} strokeWidth={2.5} />
          Add Player
        </button>
      </div>
      <div style={styles.historySearchBox}>
        <Search size={14} strokeWidth={2.5} />
        <input
          style={styles.historySearchInput}
          placeholder="Search by first name, last name, or contact number…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div style={styles.dashboardTabRow}>
        {SKILL_FILTERS.map((f) => (
          <button key={f.value} type="button" style={styles.dashboardTabBtn(skillFilter === f.value)} onClick={() => setSkillFilter(f.value)}>
            {f.label}
          </button>
        ))}
        <button type="button" style={styles.dashboardTabBtn(showInactiveOnly)} onClick={() => setShowInactiveOnly((v) => !v)}>
          Inactive Players
        </button>
      </div>
      <div style={styles.dashboardTabRow}>
        {SORTS.map((s) => (
          <button key={s.id} type="button" style={styles.dashboardTabBtn(sortKey === s.id)} onClick={() => setSortKey(s.id)}>
            Sort: {s.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p style={styles.editHint}>No players match.</p>
      ) : (
        <ul style={{ ...styles.rosterList, maxWidth: "100%" }}>
          {rows.map((player) => (
            <PlayerRow key={player.id} player={player} ratingView={ratingFor(player.id)} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </div>
  );
}

// Read-only lifetime statistics — every number here comes straight from
// the existing Club Rating Engine (fetchPlayerRating + RatingEngine.
// deriveRatingView), never re-derived. "Total Sessions" is deliberately
// NOT shown: no session record anywhere keeps a reverse index of "which
// players participated," so it isn't real, computable data today — same
// "omit rather than fabricate" precedent applied to Match Number/Serving
// Indicator/Elapsed Time in Open Play TV Mode.
function StatsPanel({ ratingView, skill }) {
  return (
    <div style={styles.sessionInfoCard}>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Total Games</span>
        <span style={styles.sessionInfoValue}>{ratingView.totalMatches}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Wins</span>
        <span style={styles.sessionInfoValue}>{ratingView.wins}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Losses</span>
        <span style={styles.sessionInfoValue}>{ratingView.losses}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Win Percentage</span>
        <span style={styles.sessionInfoValue}>{Math.round(ratingView.winPct * 100)}%</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Performance Rating</span>
        <span style={styles.sessionInfoValue}>
          {ratingView.currentRating ?? "Unrated"}
          {ratingView.currentRating != null && ratingView.trend !== 0 ? (ratingView.trend > 0 ? ` ▲${ratingView.trend}` : ` ▼${Math.abs(ratingView.trend)}`) : ""}
        </span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Current Skill Level</span>
        <span style={styles.sessionInfoValue}>{skill === "advanced" ? "Advanced" : skill === "intermediate" ? "Intermediate" : "Beginner"}</span>
      </div>
    </div>
  );
}

// Shared photo upload/replace/remove control — the exact same pattern
// CreateSessionScreen.jsx's new-player form already uses (resizeImageToAvatar
// for upload+crop-to-square, an X button to remove), reused rather than
// reinvented for the profile editor.
function PhotoEditor({ photo, onChange, busy, setBusy }) {
  const handleSelect = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await resizeImageToAvatar(file));
    } catch (e) {
      // photo stays as-is on a read/decode failure
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={styles.photoRow}>
      <div style={styles.photoPreviewWrap}>
        {photo ? (
          <img src={photo} alt="" style={styles.photoPreview} />
        ) : (
          <div style={styles.photoPlaceholder}>
            <Camera size={18} strokeWidth={2} color="var(--color-text-faint)" />
          </div>
        )}
        {photo && (
          <button style={styles.photoClearBtn} onClick={() => onChange(null)} aria-label="remove photo">
            <X size={11} strokeWidth={3} />
          </button>
        )}
      </div>
      <label style={styles.photoLabel}>
        <input type="file" accept="image/*" capture="user" style={{ display: "none" }} onChange={(e) => handleSelect(e.target.files?.[0])} />
        {busy ? "Adding photo…" : photo ? "Change photo" : "Add a photo"}
      </label>
    </div>
  );
}

// Player Profile — see PROJECT.md's Player Management section. Editable:
// First Name, Last Name, Photo, Contact Number, Skill Level (exactly the
// fields the spec names — no Membership fields anywhere here). Layout
// leaves an explicit, clearly-labeled spot for future fields (Email,
// Birthday, Emergency Contact, Club, Notes) so they can be added later
// without restructuring this form.
function PlayerProfile({ player, ratingView, onBack, onSaved }) {
  const [firstName, setFirstName] = useState(player.firstName || "");
  const [lastName, setLastName] = useState(player.lastName || "");
  const [contactNumber, setContactNumber] = useState(player.contactNumber || "");
  const [skill, setSkill] = useState(player.skill);
  const [photo, setPhoto] = useState(player.photo);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    const trimmedFirst = firstName.trim();
    if (!trimmedFirst) {
      setError("First name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await savePlayerRecord({
        ...player,
        firstName: trimmedFirst,
        lastName: lastName.trim() || null,
        contactNumber: contactNumber.trim() || null,
        skill,
        photo,
      });
      onSaved(updated);
    } catch (e) {
      setError("Couldn't save changes — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <button style={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back to directory
      </button>
      <div style={styles.tournamentSetupCard}>
        <PhotoEditor photo={photo} onChange={setPhoto} busy={photoBusy} setBusy={setPhotoBusy} />
        <div style={styles.checkinRow}>
          <input style={styles.input} placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <input style={styles.input} placeholder="Last name (optional)" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
        <input
          style={{ ...styles.input, ...styles.playerSearchInput }}
          placeholder="Contact number"
          value={contactNumber}
          onChange={(e) => setContactNumber(e.target.value)}
        />
        <p style={styles.editHint}>Skill level</p>
        <div style={styles.skillToggle}>
          {["beginner", "intermediate", "advanced"].map((s) => (
            <button key={s} type="button" style={styles.skillToggleBtn(skill === s)} onClick={() => setSkill(s)}>
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        {/* Future fields (Email, Birthday, Emergency Contact, Club, Notes)
            — see PROJECT.md. This is the deliberate slot for them: adding a
            field here later is a small, additive change, not a redesign. */}
        {error && <p style={styles.editWarning}>{error}</p>}
        <div style={styles.editActions}>
          <button type="button" style={{ ...styles.primaryBtn, ...(saving ? styles.btnDisabled : {}) }} onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
      <SectionLabel>Statistics</SectionLabel>
      <StatsPanel ratingView={ratingView} skill={skill} />
    </div>
  );
}

// A lighter-weight registration form than Create Session's own (no session
// roster to add to here) — same fields, same emptyPlayerRecord/
// savePlayerRecord/resizeImageToAvatar, per "reuse the current Player
// model, do not duplicate business logic." Photo is required, matching
// the same rule Create Session's new-player form already enforces.
function AddPlayerForm({ onBack, onCreated }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [skill, setSkill] = useState("beginner");
  const [photo, setPhoto] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const create = async () => {
    const trimmedFirst = firstName.trim();
    if (!trimmedFirst) {
      setError("First name is required.");
      return;
    }
    if (!photo) {
      setError("A profile photo is required to add a new player.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const record = emptyPlayerRecord({ firstName: trimmedFirst, lastName, nickname, photo, skill, contactNumber });
      await savePlayerRecord(record);
      onCreated(record);
    } catch (e) {
      setError("Couldn't save this player — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <button style={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back to directory
      </button>
      <SectionLabel>Add Player</SectionLabel>
      <div style={styles.tournamentSetupCard}>
        <PhotoEditor photo={photo} onChange={setPhoto} busy={photoBusy} setBusy={setPhotoBusy} />
        <div style={styles.checkinRow}>
          <input style={styles.input} placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <input style={styles.input} placeholder="Last name (optional)" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
        <input
          style={{ ...styles.input, ...styles.playerSearchInput }}
          placeholder="Nickname (optional)"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />
        <input
          style={{ ...styles.input, ...styles.playerSearchInput }}
          placeholder="Contact number"
          value={contactNumber}
          onChange={(e) => setContactNumber(e.target.value)}
        />
        <SkillToggle value={skill === "advanced" ? "intermediate" : skill} onChange={setSkill} />
        {error && <p style={styles.editWarning}>{error}</p>}
        <div style={styles.editActions}>
          <button type="button" style={{ ...styles.primaryBtn, ...(saving ? styles.btnDisabled : {}) }} onClick={create} disabled={saving}>
            {saving ? "Adding…" : "Add player"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PlayerManagementScreen({ onBack }) {
  const [players, setPlayers] = useState([]);
  const [ratings, setRatings] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("directory"); // "directory" | "profile" | "add"
  const [selectedId, setSelectedId] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([fetchAllPlayers(), fetchAllPlayerRatings()])
      .then(([p, r]) => {
        setPlayers(p);
        setRatings(new Map(r.map((rating) => [rating.playerId, ratingEngine.deriveRatingView(rating)])));
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openProfile = async (id) => {
    // A player who's never had a rating record yet isn't in `ratings` —
    // one extra lookup on open (mirrors RatingsScreen.jsx's own per-profile
    // fetch) rather than pre-fetching a rating for every single directory
    // row up front.
    if (!ratings.has(id)) {
      const rating = await fetchPlayerRating(id);
      if (rating) setRatings((m) => new Map(m).set(id, ratingEngine.deriveRatingView(rating)));
    }
    setSelectedId(id);
    setView("profile");
  };

  const selectedPlayer = players.find((p) => p.id === selectedId);

  return (
    <div style={styles.createWrap}>
      <button style={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>
      <SectionLabel>Player Management</SectionLabel>

      {loading ? (
        <p style={styles.editHint}>Loading players…</p>
      ) : view === "add" ? (
        <AddPlayerForm
          onBack={() => setView("directory")}
          onCreated={(record) => {
            setPlayers((list) => [...list, record]);
            setView("directory");
          }}
        />
      ) : view === "profile" && selectedPlayer ? (
        <PlayerProfile
          player={selectedPlayer}
          ratingView={ratings.get(selectedId) ?? emptyRatingView()}
          onBack={() => setView("directory")}
          onSaved={(updated) => {
            setPlayers((list) => list.map((p) => (p.id === updated.id ? updated : p)));
            setView("directory");
          }}
        />
      ) : (
        <DirectoryPanel players={players} ratings={ratings} onOpen={openProfile} onAdd={() => setView("add")} />
      )}
    </div>
  );
}

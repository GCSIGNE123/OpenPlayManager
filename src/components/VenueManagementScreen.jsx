import { useEffect, useState } from "react";
import { ArrowLeft, Camera, Plus, X } from "lucide-react";
import { styles } from "../styles.js";
import { saveVenueRecord, emptyVenueRecord } from "../lib/venueModel.js";
import { fetchAllCourts } from "../lib/courtDatabase.js";
import { fetchAllPlayers } from "../lib/playerDatabase.js";
import { fetchAllOrganizations } from "../lib/organizationModel.js";
import { fetchAllBookings } from "../lib/bookingModel.js";
import { fetchAllTournaments } from "../lib/tournamentModel.js";
import { fetchAllSessions, resizeImageToAvatar } from "../lib/utils.js";
import { useActiveVenue } from "../context/ActiveVenueContext.jsx";
import SectionLabel from "./SectionLabel.jsx";

// Venue Management — Phase 0: Multi-Tenant Foundation. See PROJECT.md's
// Multi-Tenant Venue Architecture section. The Venue is the new top-level
// entity ("the primary customer of Pickleball King is a Pickleball Venue
// (Gym), not an individual club") — this screen is where a Venue profile
// is created/edited and where its live dashboard stats are shown.
//
// Reached from the landing page (onVenueManagement), same pattern as
// every other module (Leagues, Player Management, Court Booking, ...) —
// no persistent top-nav bar yet; that's future navigation shell work, not
// this sprint's job. Architecture-only otherwise: every stat below is a
// real, live count filtered by `venueId`, but since nothing existing is
// backfilled onto a Venue this sprint, a freshly created venue will
// honestly show zeros until records are explicitly assigned to it —
// expected, not a bug.
//
// Multi-Venue Workspace update — see PROJECT.md's Multi-Venue
// Authentication & Workspace Architecture section: which venue is
// "selected" now lives in the shared ActiveVenueContext (useActiveVenue),
// not local component state, so this screen and any future venue-scoped
// module stay in sync automatically.
function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Venue logo upload — the exact same resizeImageToAvatar + circular-photo
// pattern Player Management's PhotoEditor already uses.
function VenueLogoEditor({ logo, onChange, busy, setBusy }) {
  const handleSelect = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await resizeImageToAvatar(file));
    } catch (e) {
      // logo stays as-is on a read/decode failure
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={styles.photoRow}>
      <div style={styles.photoPreviewWrap}>
        {logo ? (
          <img src={logo} alt="" style={styles.photoPreview} />
        ) : (
          <div style={styles.photoPlaceholder}>
            <Camera size={18} strokeWidth={2} color="var(--color-text-faint)" />
          </div>
        )}
        {logo && (
          <button type="button" style={styles.photoClearBtn} onClick={() => onChange(null)} aria-label="remove venue logo">
            <X size={11} strokeWidth={3} />
          </button>
        )}
      </div>
      <label style={styles.photoLabel}>
        <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleSelect(e.target.files?.[0])} />
        {busy ? "Adding logo…" : logo ? "Change logo" : "Add a venue logo"}
      </label>
    </div>
  );
}

const FIELD_DEFS = [
  ["description", "Description", "textarea"],
  ["contactNumber", "Contact Number", "text"],
  ["email", "Email", "text"],
  ["website", "Website", "text"],
  ["facebookPage", "Facebook Page", "text"],
  ["address", "Address", "text"],
  ["city", "City", "text"],
  ["province", "Province", "text"],
  ["country", "Country", "text"],
  ["timeZone", "Time Zone (e.g. Asia/Manila)", "text"],
  ["latitude", "Latitude", "number"],
  ["longitude", "Longitude", "number"],
  ["openingTime", "Opening Time", "time"],
  ["closingTime", "Closing Time", "time"],
  ["numberOfCourts", "Number of Courts", "number"],
];

function VenueForm({ venue, onSaved, onCancel }) {
  const isEdit = Boolean(venue);
  const [name, setName] = useState(venue?.name ?? "");
  const [logo, setLogo] = useState(venue?.logo ?? null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [fields, setFields] = useState(() => Object.fromEntries(FIELD_DEFS.map(([key]) => [key, venue?.[key] ?? ""])));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const setField = (key, value) => setFields((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!name.trim()) {
      setError("Venue name is required.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const payload = { name, logo, ...fields };
      const saved = isEdit ? await saveVenueRecord({ ...venue, ...payload }) : await saveVenueRecord(emptyVenueRecord(payload));
      onSaved(saved);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.tournamentSetupCard}>
      <VenueLogoEditor logo={logo} onChange={setLogo} busy={logoBusy} setBusy={setLogoBusy} />
      <label style={styles.settingsField}>
        Venue Name
        <input style={styles.input} placeholder="e.g. Ormoc Pickleball Center" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {FIELD_DEFS.map(([key, label, type]) => (
        <label key={key} style={styles.settingsField}>
          {label}
          {type === "textarea" ? (
            <textarea style={styles.textareaInput} value={fields[key]} onChange={(e) => setField(key, e.target.value)} />
          ) : (
            <input type={type} style={styles.input} value={fields[key]} onChange={(e) => setField(key, e.target.value)} />
          )}
        </label>
      ))}
      {error && <p style={styles.editWarning}>{error}</p>}
      <div style={styles.editActions}>
        <button type="button" style={styles.secondaryBtn} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" style={{ ...styles.primaryBtn, ...(saving ? styles.btnDisabled : {}) }} onClick={save} disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create venue"}
        </button>
      </div>
    </div>
  );
}

// The live dashboard stats — each a real count filtered by venue.id
// against the relevant module's already-existing records (Court/Player/
// Organization/Booking/Tournament/Session), reusing each module's own
// fetchAll* rather than re-deriving anything. No AvailabilityService/
// BookingService/rotation-engine logic is touched — this is read-only
// aggregation, the same pattern CourtBookingScreen.jsx's own
// DashboardPanel already uses.
function VenueDashboard({ venue, courts, players, organizations, bookings, tournaments, sessions }) {
  const today = todayString();
  const venueCourts = courts.filter((c) => c.venueId === venue.id);
  const venuePlayers = players.filter((p) => p.venueId === venue.id);
  const venueOrgs = organizations.filter((o) => o.venueId === venue.id);
  const activeReservationsToday = bookings.filter((b) => b.venueId === venue.id && b.date === today && b.status === "reserved").length;
  const activeOpenPlaySessions = sessions.filter((s) => s.venueId === venue.id && (s.sessionType || "openPlay") === "openPlay").length;
  const activeTournaments = tournaments.filter((t) => t.venueId === venue.id && t.status !== "completed").length;

  return (
    <div style={styles.sessionInfoCard}>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Number of Courts</span>
        <span style={styles.sessionInfoValue}>{venueCourts.length}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Number of Players</span>
        <span style={styles.sessionInfoValue}>{venuePlayers.length}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Number of Organizations</span>
        <span style={styles.sessionInfoValue}>{venueOrgs.length}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Active Reservations Today</span>
        <span style={styles.sessionInfoValue}>{activeReservationsToday}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Active Open Play Sessions</span>
        <span style={styles.sessionInfoValue}>{activeOpenPlaySessions}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Active Tournaments</span>
        <span style={styles.sessionInfoValue}>{activeTournaments}</span>
      </div>
    </div>
  );
}

export default function VenueManagementScreen({ onBack }) {
  // Venues themselves, and which one is "active," live in the shared
  // ActiveVenueContext (see context/ActiveVenueContext.jsx) — this screen
  // is a CONSUMER of that shared state, not its own separate copy, per
  // the spec's "Single Source of Context" principle. Selecting a venue
  // here is what a future venue-switcher anywhere else in the app would
  // also do, through the same setActiveVenueId.
  const { venues, activeVenueId, setActiveVenueId, activeVenue, loading: venuesLoading, reloadVenues } = useActiveVenue();
  const [courts, setCourts] = useState([]);
  const [players, setPlayers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([fetchAllCourts(), fetchAllPlayers(), fetchAllOrganizations(), fetchAllBookings(), fetchAllTournaments(), fetchAllSessions()])
      .then(([c, p, o, b, t, s]) => {
        setCourts(c);
        setPlayers(p);
        setOrganizations(o);
        setBookings(b);
        setTournaments(t);
        setSessions(s);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const startAdd = () => {
    setEditingVenue(null);
    setFormOpen(true);
  };
  const startEdit = (venue) => {
    setEditingVenue(venue);
    setFormOpen(true);
  };
  const handleSaved = async (saved) => {
    setFormOpen(false);
    await reloadVenues();
    setActiveVenueId(saved.id);
    load();
  };

  return (
    <div style={styles.createWrap}>
      <button style={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>
      <SectionLabel>Venue Management</SectionLabel>

      {venuesLoading || loading ? (
        <p style={styles.editHint}>Loading venues…</p>
      ) : formOpen ? (
        <VenueForm venue={editingVenue} onSaved={handleSaved} onCancel={() => setFormOpen(false)} />
      ) : venues.length === 0 ? (
        <div>
          <p style={styles.editHint}>No venues set up yet — Pickleball King is a multi-tenant platform where every module belongs to a Venue.</p>
          <div style={styles.editActions}>
            <button type="button" style={styles.primaryBtn} onClick={startAdd}>
              <Plus size={14} strokeWidth={2.5} />
              Add Venue
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={styles.dashboardTabRow}>
            {venues.map((v) => (
              <button key={v.id} type="button" style={styles.dashboardTabBtn(v.id === activeVenueId)} onClick={() => setActiveVenueId(v.id)}>
                {v.name}
              </button>
            ))}
            <button type="button" style={styles.checkInTapBtn} onClick={startAdd}>
              <Plus size={12} strokeWidth={2.5} />
              Add Venue
            </button>
          </div>

          {activeVenue && (
            <>
              <div style={styles.photoRow}>
                {activeVenue.logo ? (
                  <img src={activeVenue.logo} alt="" style={styles.photoPreview} />
                ) : (
                  <div style={styles.photoPlaceholder}>
                    <Camera size={18} strokeWidth={2} color="var(--color-text-faint)" />
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{activeVenue.name}</div>
                  {(activeVenue.city || activeVenue.province || activeVenue.country) && (
                    <div style={styles.editHint}>{[activeVenue.city, activeVenue.province, activeVenue.country].filter(Boolean).join(", ")}</div>
                  )}
                </div>
                <button type="button" style={styles.checkInTapBtn} onClick={() => startEdit(activeVenue)}>
                  Edit Venue
                </button>
              </div>
              <SectionLabel>Dashboard</SectionLabel>
              <VenueDashboard
                venue={activeVenue}
                courts={courts}
                players={players}
                organizations={organizations}
                bookings={bookings}
                tournaments={tournaments}
                sessions={sessions}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

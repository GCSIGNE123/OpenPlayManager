import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calendar, Camera, Check, Grid3x3, Lightbulb, Plus, Search, ShowerHead, Umbrella, X } from "lucide-react";
import { styles } from "../styles.js";
import { fetchAllCourts, saveCourtRecord, emptyCourtRecord, SURFACE_TYPES, EQUIPMENT_TYPES } from "../lib/courtDatabase.js";
import { fetchAllBookings, filterBookingsByQuery, BOOKING_SOURCES, BOOKING_STATUSES } from "../lib/bookingModel.js";
import { fetchAllPlayers, savePlayerRecord, emptyPlayerRecord, filterPlayersByQuery } from "../lib/playerDatabase.js";
import { resizeImageToAvatar } from "../lib/utils.js";
import { getAvailableCourts, getCourtsReservedNow, isValidTimeRange, validateBookingFields } from "../engines/AvailabilityService.js";
import { BookingService } from "../engines/BookingService.js";
import ReservationTimeline, { TIMELINE_HOURS } from "./ReservationTimeline.jsx";
import { useActiveVenue } from "../context/ActiveVenueContext.jsx";
import Avatar from "./Avatar.jsx";
import SectionLabel from "./SectionLabel.jsx";
import CurrentVenueBadge from "./CurrentVenueBadge.jsx";

const bookingService = new BookingService();

// Court Booking & Reservations (Phase 1) — see PROJECT.md. A new,
// self-contained module reached from the landing page like every other
// module (Leagues, Player Management, Ratings) — no persistent top-nav
// bar introduced, per explicit direction. Booking management/scheduling/
// conflict-prevention only: no payments, no public online booking, no
// notifications, no QR check-in (all deliberately deferred — see the
// Future Compatibility fields already reserved on the Booking record in
// lib/bookingModel.js).
const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "courts", label: "Court Management" },
  { id: "calendar", label: "Booking Calendar" },
  { id: "bookings", label: "All Bookings" },
];

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function formatTime(hhmm) {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}
function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
const STATUS_LABELS = { reserved: "Reserved", completed: "Completed", cancelled: "Cancelled", noShow: "No Show" };
// Reservation Calendar block color — maps Booking.status onto
// styles.reservationStatusColor's keys. "reserved" reads as 🟢 Confirmed
// here (in this app "reserved" already means a confirmed reservation —
// there's no separate pending/unconfirmed state), per the plan agreed
// before implementation. Status colors themselves are unchanged.
const STATUS_COLOR_KEY = { reserved: "confirmed", completed: "completed", cancelled: "cancelled", noShow: "noShow" };

// ---- Dashboard ----
function DashboardPanel({ courts, bookings }) {
  const today = todayString();
  const activeCourts = courts.filter((c) => c.active);
  const todaysBookings = bookings.filter((b) => b.date === today && b.status !== "cancelled");
  const upcomingBookings = bookings.filter((b) => b.date > today && b.status === "reserved");
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const occupiedNow = todaysBookings.filter((b) => b.status === "reserved" && b.startTime <= nowTime && nowTime < b.endTime);
  const occupancyPct = activeCourts.length === 0 ? 0 : Math.round((occupiedNow.length / activeCourts.length) * 100);
  const nextReservation = todaysBookings
    .filter((b) => b.status === "reserved" && b.startTime > nowTime)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
  const nextCourt = nextReservation && courts.find((c) => c.id === nextReservation.courtId);

  return (
    <div style={styles.sessionInfoCard}>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Today's Bookings</span>
        <span style={styles.sessionInfoValue}>{todaysBookings.length}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Upcoming Bookings</span>
        <span style={styles.sessionInfoValue}>{upcomingBookings.length}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Available Courts</span>
        <span style={styles.sessionInfoValue}>{activeCourts.length - occupiedNow.length}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Occupied Courts</span>
        <span style={styles.sessionInfoValue}>{occupiedNow.length}</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Current Occupancy</span>
        <span style={styles.sessionInfoValue}>{occupancyPct}%</span>
      </div>
      <div style={styles.sessionInfoItem}>
        <span style={styles.sessionInfoLabel}>Next Reservation</span>
        <span style={styles.sessionInfoValue}>{nextReservation ? `${nextCourt?.name ?? "Court"} · ${formatTime(nextReservation.startTime)}` : "—"}</span>
      </div>
    </div>
  );
}

// Court photo upload — the exact same resizeImageToAvatar pipeline Player
// Management's PhotoEditor already uses, just a rectangular thumbnail
// (styles.courtPhotoThumb) instead of a circular avatar, since a court
// isn't a person. Purely a display field — see courtDatabase.js.
function CourtPhotoEditor({ photo, onChange, busy, setBusy }) {
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
      <div style={styles.courtPhotoThumbWrap}>
        {photo ? (
          <img src={photo} alt="" style={styles.courtPhotoThumb} />
        ) : (
          <div style={styles.courtPhotoThumbPlaceholder}>
            <Camera size={18} strokeWidth={2} color="var(--color-text-faint)" />
          </div>
        )}
        {photo && (
          <button type="button" style={styles.photoClearBtn} onClick={() => onChange(null)} aria-label="remove court photo">
            <X size={11} strokeWidth={3} />
          </button>
        )}
      </div>
      <label style={styles.photoLabel}>
        <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleSelect(e.target.files?.[0])} />
        {busy ? "Adding photo…" : photo ? "Change photo" : "Add a court photo"}
      </label>
    </div>
  );
}

// Court Management card's operational status — pure display, derived from
// existing signals only: court.active, court.maintenance,
// AvailabilityService.getCourtsReservedNow (reused, not re-derived), and —
// new this sprint — the bookingSource already stored on whichever booking
// currently has the court reserved (openPlay/tournament/coaching read as
// their own badge; every other source reads as generic "Reserved"). This
// is strictly a display categorization layered on top of fields that
// already exist; nothing new is persisted and neither AvailabilityService
// nor BookingService are touched. Precedence: an inactive court is always
// "Inactive" regardless of anything else; maintenance next; otherwise
// whatever's reserved right now (by source) vs available.
function courtOperationalStatus(court, bookings, reservedNumbers) {
  if (!court.active) return "inactive";
  if (court.maintenance) return "maintenance";
  if (!reservedNumbers.has(court.number)) return "available";
  const today = todayString();
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const activeBooking = bookings.find(
    (b) => b.courtId === court.id && b.status === "reserved" && b.date === today && b.startTime <= nowTime && nowTime < b.endTime
  );
  if (activeBooking?.bookingSource === "openPlay") return "openPlay";
  if (activeBooking?.bookingSource === "tournament") return "tournament";
  if (activeBooking?.bookingSource === "coaching") return "coaching";
  return "reserved";
}
const STATUS_BADGE_META = {
  available: { emoji: "🟢", label: "Available" },
  reserved: { emoji: "🔵", label: "Reserved" },
  openPlay: { emoji: "🟠", label: "Open Play" },
  tournament: { emoji: "🟣", label: "Tournament" },
  coaching: { emoji: "🟡", label: "Coaching" },
  maintenance: { emoji: "🔴", label: "Maintenance" },
  inactive: { emoji: "⚫", label: "Inactive" },
};
const SURFACE_LABELS = Object.fromEntries(SURFACE_TYPES.map((s) => [s.value, s.label]));
const SURFACE_EMOJI = { concrete: "🟫", asphalt: "🟩", cushioned: "🟦", synthetic: "🟩", wood: "🟨" };
const EQUIPMENT_ICONS = { lights: Lightbulb, covered: Umbrella, nets: Grid3x3, washroom: ShowerHead };
const EQUIPMENT_LABELS = Object.fromEntries(EQUIPMENT_TYPES.map((e) => [e.value, e.label]));

// Professional "no photo" illustration — a simplified top-down pickleball
// court, filling the same 16:9 hero area a real photo would. Inline SVG
// (no external asset/library) so it always renders instantly and reuses
// the app's own CSS custom properties for color, per the existing design
// language rather than a generic gray box or stock icon.
function CourtHeroIllustration() {
  return (
    <svg viewBox="0 0 400 225" style={{ width: "100%", height: "100%", display: "block" }} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="courtHeroGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--color-primary)" }} />
          <stop offset="100%" style={{ stopColor: "var(--color-primary-dark)" }} />
        </linearGradient>
      </defs>
      <rect width="400" height="225" fill="url(#courtHeroGrad)" />
      <rect x="46" y="34" width="308" height="157" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="3" rx="3" />
      <line x1="200" y1="34" x2="200" y2="191" stroke="rgba(255,255,255,0.85)" strokeWidth="3" />
      <line x1="132" y1="34" x2="132" y2="191" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeDasharray="5 4" />
      <line x1="268" y1="34" x2="268" y2="191" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeDasharray="5 4" />
      <circle cx="200" cy="112.5" r="9" fill="var(--color-secondary)" />
      <text x="200" y="208" textAnchor="middle" fontFamily="'Space Mono', monospace" fontSize="12" fontWeight="700" fill="rgba(255,255,255,0.75)" letterSpacing="1">
        NO PHOTO
      </text>
    </svg>
  );
}

// ---- Court Management ----
function CourtManagementPanel({ courts, bookings, onReload }) {
  const { activeVenueId } = useActiveVenue();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [number, setNumber] = useState(courts.length + 1);
  const [location, setLocation] = useState("outdoor");
  const [surfaceType, setSurfaceType] = useState("concrete");
  const [photo, setPhoto] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [hourlyRate, setHourlyRate] = useState("");
  const [equipment, setEquipment] = useState([]);
  const [error, setError] = useState("");

  const reservedNumbers = useMemo(() => getCourtsReservedNow(courts, bookings), [courts, bookings]);
  const today = todayString();
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const startAdd = () => {
    setName("");
    setNumber(courts.length + 1);
    setLocation("outdoor");
    setSurfaceType("concrete");
    setPhoto(null);
    setHourlyRate("");
    setEquipment([]);
    setError("");
    setEditingId(null);
    setAdding(true);
  };
  const startEdit = (court) => {
    setName(court.name);
    setNumber(court.number);
    setLocation(court.location);
    setSurfaceType(court.surfaceType || "concrete");
    setPhoto(court.photo || null);
    setHourlyRate(court.hourlyRate ?? "");
    setEquipment(court.equipment || []);
    setError("");
    setEditingId(court.id);
    setAdding(true);
  };
  const cancel = () => setAdding(false);
  const toggleEquipment = (value) => {
    setEquipment((prev) => (prev.includes(value) ? prev.filter((e) => e !== value) : [...prev, value]));
  };

  const save = async () => {
    if (!number || Number(number) < 1) {
      setError("Court number must be at least 1.");
      return;
    }
    setError("");
    const existing = editingId ? courts.find((c) => c.id === editingId) : null;
    const record = existing
      ? {
          ...existing,
          name: name.trim() || `Court ${number}`,
          number: Number(number),
          location,
          surfaceType,
          photo,
          hourlyRate: hourlyRate === "" ? null : Number(hourlyRate),
          equipment,
        }
      : emptyCourtRecord({ name, number, location, surfaceType, photo, hourlyRate, equipment, venueId: activeVenueId });
    await saveCourtRecord(record);
    setAdding(false);
    onReload();
  };

  const toggleActive = async (court) => {
    await saveCourtRecord({ ...court, active: !court.active });
    onReload();
  };
  const toggleMaintenance = async (court) => {
    await saveCourtRecord({ ...court, maintenance: !court.maintenance });
    onReload();
  };

  return (
    <div>
      {!adding && (
        <div style={styles.editActions}>
          <button type="button" style={styles.primaryBtn} onClick={startAdd}>
            <Plus size={14} strokeWidth={2.5} />
            Add Court
          </button>
        </div>
      )}
      {adding && (
        <div style={styles.tournamentSetupCard}>
          <CourtPhotoEditor photo={photo} onChange={setPhoto} busy={photoBusy} setBusy={setPhotoBusy} />
          <div style={styles.checkinRow}>
            <input style={styles.input} placeholder="Court name (e.g. Court 1)" value={name} onChange={(e) => setName(e.target.value)} />
            <input
              type="number"
              min={1}
              style={{ ...styles.expectedGamesInput, width: 70 }}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </div>
          <div style={styles.skillToggle}>
            <button type="button" style={styles.skillToggleBtn(location === "outdoor")} onClick={() => setLocation("outdoor")}>
              Outdoor
            </button>
            <button type="button" style={styles.skillToggleBtn(location === "indoor")} onClick={() => setLocation("indoor")}>
              Indoor
            </button>
          </div>
          <label style={styles.settingsField}>
            Surface Type
            <select style={styles.rotationSelect} value={surfaceType} onChange={(e) => setSurfaceType(e.target.value)}>
              {SURFACE_TYPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label style={styles.settingsField}>
            Hourly rate (stored only — not charged yet)
            <input
              type="number"
              min={0}
              step="0.01"
              style={styles.expectedGamesInput}
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
            />
          </label>
          <div style={styles.settingsField}>
            Equipment
            <div style={styles.skillToggle}>
              {EQUIPMENT_TYPES.map((e) => (
                <button key={e.value} type="button" style={styles.skillToggleBtn(equipment.includes(e.value))} onClick={() => toggleEquipment(e.value)}>
                  {e.label}
                </button>
              ))}
            </div>
          </div>
          {error && <p style={styles.editWarning}>{error}</p>}
          <div style={styles.editActions}>
            <button type="button" style={styles.secondaryBtn} onClick={cancel}>
              Cancel
            </button>
            <button type="button" style={styles.primaryBtn} onClick={save}>
              {editingId ? "Save changes" : "Add court"}
            </button>
          </div>
        </div>
      )}
      {courts.length === 0 ? (
        <p style={styles.editHint}>No courts set up yet — add your first one above.</p>
      ) : (
        <div style={styles.courtMgmtGrid}>
          {courts.map((court) => {
            const status = courtOperationalStatus(court, bookings, reservedNumbers);
            const statusMeta = STATUS_BADGE_META[status];
            const todaysCourtBookings = bookings.filter((b) => b.courtId === court.id && b.date === today && b.status !== "cancelled");
            const nextBooking = todaysCourtBookings
              .filter((b) => b.status === "reserved" && b.startTime > nowTime)
              .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
            return (
              <div key={court.id} style={styles.courtMgmtCard}>
                <div style={styles.courtHeroWrap}>
                  {court.photo ? <img src={court.photo} alt="" style={styles.courtHeroImg} /> : <CourtHeroIllustration />}
                </div>
                <div style={styles.courtMgmtCardBody}>
                  <h3 style={styles.courtNumberHeading}>{court.name}</h3>
                  {/* Status badge sits in a generic badge row — future accolade
                      badges (Premium Court, Competition Court, Training Court,
                      Members Only, ...) can be appended here later with no
                      layout change, per Future Compatibility. */}
                  <div style={styles.courtBadgeRow}>
                    <span style={styles.courtOperationalBadge(status)}>
                      {statusMeta.emoji} {statusMeta.label}
                    </span>
                  </div>
                  <div style={styles.courtInfoPillRow}>
                    <span style={styles.courtInfoPill}>{court.location === "indoor" ? "🏟 Indoor" : "🌤 Outdoor"}</span>
                    <span style={styles.courtInfoPill}>
                      {SURFACE_EMOJI[court.surfaceType] || "🟫"} {SURFACE_LABELS[court.surfaceType] || "Concrete"}
                    </span>
                  </div>
                  {court.equipment?.length > 0 && (
                    <div style={styles.courtEquipmentRow}>
                      {court.equipment.map((eq) => {
                        const Icon = EQUIPMENT_ICONS[eq] || Check;
                        return (
                          <span key={eq} style={styles.courtEquipmentPill}>
                            <Icon size={11} strokeWidth={2.5} />
                            {EQUIPMENT_LABELS[eq] || eq}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {court.hourlyRate != null && (
                    <div style={styles.courtRateLine}>
                      <span style={styles.courtRateAmount}>₱{court.hourlyRate}</span>
                      <span style={styles.courtRateUnit}>/ hour</span>
                    </div>
                  )}
                  {todaysCourtBookings.length === 0 ? (
                    <p style={styles.editHint}>No reservations today</p>
                  ) : (
                    <div style={styles.courtReservationSummary}>
                      <div style={styles.courtReservationStat}>
                        <span style={styles.courtReservationLabel}>Today's Reservations</span>
                        <span style={styles.courtReservationValue}>{todaysCourtBookings.length}</span>
                      </div>
                      <div style={styles.courtReservationStat}>
                        <span style={styles.courtReservationLabel}>Next Booking</span>
                        <span style={styles.courtReservationValue}>{nextBooking ? formatTime(nextBooking.startTime) : "—"}</span>
                      </div>
                    </div>
                  )}
                  <div style={styles.courtMgmtCardActions}>
                    <button type="button" style={styles.checkInTapBtn} onClick={() => startEdit(court)}>
                      Edit
                    </button>
                    <button type="button" style={styles.checkInTapBtn} onClick={() => toggleActive(court)}>
                      {court.active ? "Deactivate" : "Activate"}
                    </button>
                    <button type="button" style={styles.checkInTapBtn} onClick={() => toggleMaintenance(court)}>
                      {court.maintenance ? "Clear Maintenance" : "Mark Maintenance"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- Booking Form (create + edit + details, one component) ----
// Player Management integration — see PROJECT.md. A booking always ends
// up with a playerId: either an existing Player Database record found via
// search (reusing filterPlayersByQuery/fetchAllPlayers, the exact same
// pattern CreateSessionScreen.jsx's "select existing player" step already
// uses), or a Quick Guest Booking that auto-creates a minimal
// emptyPlayerRecord (no photo required — this is deliberately the fast,
// low-friction path a front desk needs, unlike the required-photo rule
// CreateSessionScreen/PlayerManagementScreen enforce for their own
// "create a full player" forms). customerName/contactNumber on the
// Booking are a denormalized snapshot of whichever player ends up linked,
// kept for fast list/calendar rendering without an N+1 fetch per row.
function BookingForm({ booking, courts, bookings, defaultCourtId, defaultDate, defaultStartTime, onSaved, onCancel }) {
  const { activeVenueId } = useActiveVenue();
  const isEdit = Boolean(booking);
  const [playerId, setPlayerId] = useState(booking?.playerId ?? null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerResults, setPlayerResults] = useState([]);
  const [guestMode, setGuestMode] = useState(false);
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestContact, setGuestContact] = useState("");
  const [customerName, setCustomerName] = useState(booking?.customerName ?? "");
  const [contactNumber, setContactNumber] = useState(booking?.contactNumber ?? "");
  const [date, setDate] = useState(booking?.date ?? defaultDate ?? todayString());
  const [startTime, setStartTime] = useState(booking?.startTime ?? defaultStartTime ?? "");
  const [endTime, setEndTime] = useState(booking?.endTime ?? "");
  const [courtId, setCourtId] = useState(booking?.courtId ?? defaultCourtId ?? "");
  const [numberOfPlayers, setNumberOfPlayers] = useState(booking?.numberOfPlayers ?? "");
  const [notes, setNotes] = useState(booking?.notes ?? "");
  const [bookingSource, setBookingSource] = useState(booking?.bookingSource ?? "staffReservation");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAllPlayers().then((players) => {
      if (!cancelled) setPlayerResults(filterPlayersByQuery(players, playerSearch).slice(0, 8));
    });
    return () => {
      cancelled = true;
    };
  }, [playerSearch]);

  const selectPlayer = (player) => {
    setPlayerId(player.id);
    setCustomerName(player.displayName);
    setContactNumber(player.contactNumber || "");
    setGuestMode(false);
    setPlayerSearch("");
  };

  // Available courts for the currently-chosen date/time — narrows live as
  // the organizer picks a date/start/end time (AvailabilityService,
  // reused, not re-derived here).
  const availableCourts = useMemo(
    () => getAvailableCourts(courts, isEdit ? bookings.filter((b) => b.id !== booking.id) : bookings, { date, startTime, endTime }),
    [courts, bookings, date, startTime, endTime, isEdit, booking]
  );
  // The currently-selected court might not be in `availableCourts` (e.g.
  // editing a booking without having changed date/time yet) — still show
  // it in the dropdown so the field never silently blanks out.
  const selectedCourt = courts.find((c) => c.id === courtId);
  const courtOptions = selectedCourt && !availableCourts.some((c) => c.id === courtId) ? [selectedCourt, ...availableCourts] : availableCourts;

  // Live conflict warning — "immediately warn" while editing, not only on
  // Save. Calls the exact same validateBookingFields already wired to the
  // Save button below (AvailabilityService, reused), just earlier — no
  // second/parallel validation path. Only shown once a court AND both
  // times are chosen, so it doesn't nag on a half-filled form.
  const liveWarning = useMemo(() => {
    if (!courtId || !startTime || !endTime) return null;
    const result = validateBookingFields(
      { court: selectedCourt, date, startTime, endTime },
      bookings,
      isEdit ? booking.id : null
    );
    return result.valid ? null : result.errors[0];
  }, [selectedCourt, courtId, date, startTime, endTime, bookings, isEdit, booking]);

  const save = async () => {
    setError("");
    let finalPlayerId = playerId;
    let finalName = customerName.trim();
    let finalContact = contactNumber.trim();

    if (guestMode) {
      const trimmedFirst = guestFirstName.trim();
      if (!trimmedFirst) {
        setError("Enter the guest's name.");
        return;
      }
      finalName = trimmedFirst;
      finalContact = guestContact.trim();
    } else if (!finalName) {
      setError("Search for an existing player or use Quick Guest Booking.");
      return;
    }

    const court = courts.find((c) => c.id === courtId);
    if (!court) {
      setError("Select a court.");
      return;
    }
    if (!isValidTimeRange(startTime, endTime)) {
      setError("End time must be after start time.");
      return;
    }

    setSaving(true);
    try {
      // Quick Guest Booking — auto-creates a minimal Player Database
      // record (no photo required) the moment a genuinely new guest is
      // booked, so every booking ends up referencing a real player.
      if (guestMode && !finalPlayerId) {
        const guestRecord = emptyPlayerRecord({ firstName: finalName, contactNumber: finalContact || null, skill: "beginner", venueId: activeVenueId });
        await savePlayerRecord(guestRecord);
        finalPlayerId = guestRecord.id;
      }

      const fields = {
        court,
        playerId: finalPlayerId,
        customerName: finalName,
        contactNumber: finalContact || null,
        date,
        startTime,
        endTime,
        numberOfPlayers,
        notes,
        bookingSource,
        venueId: activeVenueId,
      };
      const saved = isEdit
        ? await bookingService.updateBooking(booking, fields, bookings)
        : await bookingService.createBooking(fields, bookings);
      onSaved(saved);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const statusAction = async (action) => {
    setSaving(true);
    try {
      const updated = await action(booking);
      onSaved(updated);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.tournamentSetupCard}>
      {!customerName && !guestMode && (
        <div>
          <p style={styles.dialogLabel}>Customer</p>
          <div style={styles.historySearchBox}>
            <Search size={14} strokeWidth={2.5} />
            <input
              style={styles.historySearchInput}
              placeholder="Search players by name or contact number…"
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
            />
          </div>
          {playerSearch.trim() && (
            <div style={styles.editGrid}>
              {playerResults.map((p) => (
                <button key={p.id} type="button" style={styles.editChip} onClick={() => selectPlayer(p)}>
                  <Avatar player={{ name: p.displayName, photo: p.photo }} size={22} />
                  <span style={styles.editChipName}>{p.displayName}</span>
                </button>
              ))}
              {playerResults.length === 0 && <p style={styles.editHint}>No players match — use Quick Guest Booking below.</p>}
            </div>
          )}
          <button type="button" style={styles.checkInTapBtn} onClick={() => setGuestMode(true)}>
            <Plus size={12} strokeWidth={2.5} />
            Quick Guest Booking
          </button>
        </div>
      )}

      {guestMode && (
        <div>
          <p style={styles.dialogLabel}>Quick Guest Booking — creates a minimal player profile automatically</p>
          <div style={styles.checkinRow}>
            <input style={styles.input} placeholder="Guest name" value={guestFirstName} onChange={(e) => setGuestFirstName(e.target.value)} />
            <input style={styles.input} placeholder="Contact number" value={guestContact} onChange={(e) => setGuestContact(e.target.value)} />
          </div>
          <button type="button" style={styles.checkInTapBtn} onClick={() => setGuestMode(false)}>
            <X size={12} strokeWidth={2.5} />
            Cancel guest booking, search instead
          </button>
        </div>
      )}

      {customerName && !guestMode && (
        <div style={styles.confirmMsg}>
          <Check size={14} strokeWidth={3} />
          Booking for {customerName}
          <button
            type="button"
            style={styles.checkInTapBtn}
            onClick={() => {
              setPlayerId(null);
              setCustomerName("");
              setContactNumber("");
            }}
          >
            Change
          </button>
        </div>
      )}

      <div style={styles.checkinRow}>
        <label style={styles.settingsField}>
          Date
          <input type="date" style={styles.input} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label style={styles.settingsField}>
          Start time
          <input type="time" style={styles.input} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </label>
        <label style={styles.settingsField}>
          End time
          <input type="time" style={styles.input} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </label>
      </div>

      <label style={styles.settingsField}>
        Court
        <select style={styles.rotationSelect} value={courtId} onChange={(e) => setCourtId(e.target.value)}>
          <option value="">Select a court…</option>
          {courtOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {startTime && endTime && courts.length > courtOptions.length && (
        <p style={styles.editHint}>{courts.length - courtOptions.length} court(s) unavailable for this time and hidden above.</p>
      )}
      {liveWarning && <p style={styles.editWarning}>{liveWarning}</p>}

      <div style={styles.checkinRow}>
        <input
          type="number"
          min={1}
          style={styles.input}
          placeholder="Number of players"
          value={numberOfPlayers}
          onChange={(e) => setNumberOfPlayers(e.target.value)}
        />
        <select style={styles.rotationSelect} value={bookingSource} onChange={(e) => setBookingSource(e.target.value)}>
          {BOOKING_SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <textarea style={styles.textareaInput} placeholder="Booking notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

      {error && <p style={styles.editWarning}>{error}</p>}

      <div style={styles.editActions}>
        <button type="button" style={styles.secondaryBtn} onClick={onCancel}>
          Cancel
        </button>
        {isEdit && booking.status === "reserved" && (
          <>
            <button type="button" style={styles.secondaryBtn} onClick={() => statusAction((b) => bookingService.markNoShow(b))} disabled={saving}>
              No Show
            </button>
            <button type="button" style={styles.secondaryBtn} onClick={() => statusAction((b) => bookingService.markCompleted(b))} disabled={saving}>
              Mark Completed
            </button>
            <button type="button" style={styles.leaveBtn} onClick={() => statusAction((b) => bookingService.cancelBooking(b))} disabled={saving}>
              Cancel Booking
            </button>
          </>
        )}
        <button type="button" style={{ ...styles.primaryBtn, ...(saving ? styles.btnDisabled : {}) }} onClick={save} disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create booking"}
        </button>
      </div>
    </div>
  );
}

// ---- Booking Calendar (the Interactive Reservation Timeline — the
// primary interface) ----
// Maps a Booking record into ReservationTimeline's generic block shape.
// This is pure display-mapping, not scheduling logic — everything that
// actually decides whether a booking IS a conflict still lives in
// AvailabilityService, called from BookingForm/BookingService only.
function bookingToBlock(b, court, onBookingClick) {
  return {
    id: b.id,
    label: b.customerName,
    timeLabel: `${formatTime(b.startTime)}–${formatTime(b.endTime)}`,
    startTime: b.startTime,
    endTime: b.endTime,
    statusKey: STATUS_COLOR_KEY[b.status] || "noShow",
    tooltip: [
      `${court?.name ?? "Court"} · ${STATUS_LABELS[b.status]}`,
      `Contact: ${b.contactNumber || "—"}`,
      `Players: ${b.numberOfPlayers ?? "—"}`,
      `Notes: ${b.notes || "—"}`,
    ],
    onClick: () => onBookingClick(b),
  };
}
// A court under maintenance renders as one full-width, unclickable
// "Maintenance" band per day — reuses the existing court.maintenance flag
// (Court Management, last sprint), no new booking/status data added.
function maintenanceBlock(court) {
  return {
    id: `maint-${court.id}`,
    label: "Maintenance",
    timeLabel: "All day",
    startTime: "00:00",
    endTime: "23:59",
    statusKey: "maintenance",
    tooltip: [`${court.name} · Under maintenance`],
    onClick: () => {},
  };
}

function CalendarPanel({ courts, bookings, onSlotClick, onBookingClick }) {
  const [view, setView] = useState("day"); // "day" | "week"
  const [date, setDate] = useState(todayString());
  const [courtFilter, setCourtFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");

  const weekDates = useMemo(() => {
    const base = new Date(date + "T00:00:00");
    const start = new Date(base);
    start.setDate(base.getDate() - base.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
  }, [date]);

  // Filtering (Court/Date/Status) + Search (Player Name/Contact Number) —
  // narrows which courts render as rows and which bookings render as
  // blocks. Date is already the view's own date/weekDates; nothing here
  // touches AvailabilityService/BookingService.
  const visibleCourts = courtFilter === "all" ? courts : courts.filter((c) => c.id === courtFilter);
  const filteredBookings = useMemo(() => {
    let list = statusFilter === "all" ? bookings : bookings.filter((b) => b.status === statusFilter);
    return filterBookingsByQuery(list, query);
  }, [bookings, statusFilter, query]);

  const getBlocksForCourt = (court) => {
    const dayBookings = filteredBookings.filter((b) => b.courtId === court.id && b.date === date && b.status !== "cancelled");
    const blocks = dayBookings.map((b) => bookingToBlock(b, court, onBookingClick));
    return court.maintenance ? [...blocks, maintenanceBlock(court)] : blocks;
  };
  const getBlocksForCourtDay = (court, d) => {
    const dayBookings = filteredBookings.filter((b) => b.courtId === court.id && b.date === d && b.status !== "cancelled");
    const blocks = dayBookings.map((b) => bookingToBlock(b, court, onBookingClick));
    return court.maintenance ? [...blocks, maintenanceBlock(court)] : blocks;
  };

  return (
    <div>
      <div style={styles.dashboardTabRow}>
        <button type="button" style={styles.dashboardTabBtn(view === "day")} onClick={() => setView("day")}>
          Day
        </button>
        <button type="button" style={styles.dashboardTabBtn(view === "week")} onClick={() => setView("week")}>
          Week
        </button>
      </div>
      <div style={styles.checkinRow}>
        <Calendar size={16} strokeWidth={2.5} />
        <input type="date" style={styles.input} value={date} onChange={(e) => setDate(e.target.value)} />
        <select style={styles.rotationSelect} value={courtFilter} onChange={(e) => setCourtFilter(e.target.value)}>
          <option value="all">All Courts</option>
          {courts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select style={styles.rotationSelect} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          {BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div style={styles.historySearchBox}>
        <Search size={14} strokeWidth={2.5} />
        <input
          style={styles.historySearchInput}
          placeholder="Search by customer name or contact number…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {courts.length === 0 ? (
        <p style={styles.editHint}>Add a court in Court Management before booking.</p>
      ) : visibleCourts.length === 0 ? (
        <p style={styles.editHint}>No courts match this filter.</p>
      ) : view === "day" ? (
        <ReservationTimeline
          mode="day"
          courts={visibleCourts}
          date={date}
          todayDate={todayString()}
          hours={TIMELINE_HOURS}
          getBlocksForCourt={getBlocksForCourt}
          onSlotClick={(court, startTime) => onSlotClick(court, date, startTime)}
        />
      ) : (
        <ReservationTimeline
          mode="week"
          courts={visibleCourts}
          weekDates={weekDates}
          todayDate={todayString()}
          formatDayLabel={formatDate}
          hours={TIMELINE_HOURS}
          getBlocksForCourtDay={getBlocksForCourtDay}
          onDayCellClick={(court, d) => onSlotClick(court, d, "")}
        />
      )}
    </div>
  );
}

// ---- Booking List ----
function BookingListPanel({ bookings, courts, onOpen }) {
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [courtFilter, setCourtFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const rows = useMemo(() => {
    let list = bookings;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((b) => (b.customerName || "").toLowerCase().includes(q) || (b.contactNumber || "").toLowerCase().includes(q));
    }
    if (dateFilter) list = list.filter((b) => b.date === dateFilter);
    if (courtFilter !== "all") list = list.filter((b) => b.courtId === courtFilter);
    if (statusFilter !== "all") list = list.filter((b) => b.status === statusFilter);
    return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
  }, [bookings, query, dateFilter, courtFilter, statusFilter]);

  return (
    <div>
      <div style={styles.historySearchBox}>
        <Search size={14} strokeWidth={2.5} />
        <input style={styles.historySearchInput} placeholder="Search by customer name or contact number…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div style={styles.checkinRow}>
        <input type="date" style={styles.input} value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
        <select style={styles.rotationSelect} value={courtFilter} onChange={(e) => setCourtFilter(e.target.value)}>
          <option value="all">All Courts</option>
          {courts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select style={styles.rotationSelect} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          {BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      {rows.length === 0 ? (
        <p style={styles.editHint}>No bookings match.</p>
      ) : (
        <ul style={{ ...styles.rosterList, maxWidth: "100%" }}>
          {rows.map((b) => {
            const court = courts.find((c) => c.id === b.courtId);
            return (
              <li key={b.id} style={{ ...styles.rosterItem, cursor: "pointer" }} onClick={() => onOpen(b)}>
                <span style={{ fontWeight: 700 }}>{b.customerName}</span>
                <span style={styles.queueSourceTag}>{court?.name ?? "Unknown court"}</span>
                <span style={styles.editHint}>
                  {formatDate(b.date)} · {formatTime(b.startTime)}–{formatTime(b.endTime)}
                </span>
                <span style={styles.resultTag(b.status === "reserved" ? "win" : b.status === "cancelled" || b.status === "noShow" ? "loss" : "win")}>
                  {STATUS_LABELS[b.status]}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function CourtBookingScreen({ onBack }) {
  const [courts, setCourts] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");
  const [formState, setFormState] = useState(null); // null | { booking?, defaultCourtId?, defaultDate?, defaultStartTime? }

  const load = () => {
    setLoading(true);
    Promise.all([fetchAllCourts(), fetchAllBookings()])
      .then(([c, b]) => {
        setCourts(c);
        setBookings(b);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const closeForm = () => setFormState(null);
  const handleSaved = () => {
    closeForm();
    load();
  };

  return (
    <div style={styles.createWrap}>
      <button style={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>
      <SectionLabel>Court Booking & Reservations</SectionLabel>
      <CurrentVenueBadge />

      <div style={styles.dashboardTabRow}>
        {TABS.map((t) => (
          <button key={t.id} type="button" style={styles.dashboardTabBtn(tab === t.id)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={styles.editHint}>Loading bookings…</p>
      ) : formState ? (
        <BookingForm
          booking={formState.booking ?? null}
          courts={courts}
          bookings={bookings}
          defaultCourtId={formState.defaultCourtId}
          defaultDate={formState.defaultDate}
          defaultStartTime={formState.defaultStartTime}
          onSaved={handleSaved}
          onCancel={closeForm}
        />
      ) : (
        <>
          {tab === "dashboard" && <DashboardPanel courts={courts} bookings={bookings} />}
          {tab === "courts" && <CourtManagementPanel courts={courts} bookings={bookings} onReload={load} />}
          {tab === "calendar" && (
            <>
              <div style={styles.editActions}>
                <button type="button" style={styles.primaryBtn} onClick={() => setFormState({})}>
                  <Plus size={14} strokeWidth={2.5} />
                  New Booking
                </button>
              </div>
              <CalendarPanel
                courts={courts}
                bookings={bookings}
                onSlotClick={(court, date, startTime) => setFormState({ defaultCourtId: court.id, defaultDate: date, defaultStartTime: startTime })}
                onBookingClick={(booking) => setFormState({ booking })}
              />
            </>
          )}
          {tab === "bookings" && (
            <>
              <div style={styles.editActions}>
                <button type="button" style={styles.primaryBtn} onClick={() => setFormState({})}>
                  <Plus size={14} strokeWidth={2.5} />
                  New Booking
                </button>
              </div>
              <BookingListPanel bookings={bookings} courts={courts} onOpen={(booking) => setFormState({ booking })} />
            </>
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calendar, Check, Plus, Search, X } from "lucide-react";
import { styles } from "../styles.js";
import { fetchAllCourts, saveCourtRecord, emptyCourtRecord } from "../lib/courtDatabase.js";
import { fetchAllBookings, BOOKING_SOURCES, BOOKING_STATUSES } from "../lib/bookingModel.js";
import { fetchAllPlayers, savePlayerRecord, emptyPlayerRecord, filterPlayersByQuery } from "../lib/playerDatabase.js";
import { getAvailableCourts, isValidTimeRange } from "../engines/AvailabilityService.js";
import { BookingService } from "../engines/BookingService.js";
import Avatar from "./Avatar.jsx";
import SectionLabel from "./SectionLabel.jsx";

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

// ---- Court Management ----
function CourtManagementPanel({ courts, onReload }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [number, setNumber] = useState(courts.length + 1);
  const [location, setLocation] = useState("outdoor");
  const [hourlyRate, setHourlyRate] = useState("");
  const [error, setError] = useState("");

  const startAdd = () => {
    setName("");
    setNumber(courts.length + 1);
    setLocation("outdoor");
    setHourlyRate("");
    setError("");
    setEditingId(null);
    setAdding(true);
  };
  const startEdit = (court) => {
    setName(court.name);
    setNumber(court.number);
    setLocation(court.location);
    setHourlyRate(court.hourlyRate ?? "");
    setError("");
    setEditingId(court.id);
    setAdding(true);
  };
  const cancel = () => setAdding(false);

  const save = async () => {
    if (!number || Number(number) < 1) {
      setError("Court number must be at least 1.");
      return;
    }
    setError("");
    const existing = editingId ? courts.find((c) => c.id === editingId) : null;
    const record = existing
      ? { ...existing, name: name.trim() || `Court ${number}`, number: Number(number), location, hourlyRate: hourlyRate === "" ? null : Number(hourlyRate) }
      : emptyCourtRecord({ name, number, location, hourlyRate });
    await saveCourtRecord(record);
    setAdding(false);
    onReload();
  };

  const toggleActive = async (court) => {
    await saveCourtRecord({ ...court, active: !court.active });
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
        <ul style={{ ...styles.rosterList, maxWidth: "100%" }}>
          {courts.map((court) => (
            <li key={court.id} style={styles.rosterItem}>
              <span style={{ fontWeight: 700 }}>{court.name}</span>
              <span style={styles.queueSourceTag}>{court.location === "indoor" ? "Indoor" : "Outdoor"}</span>
              <span style={styles.resultTag(court.active ? "win" : "loss")}>{court.active ? "ACTIVE" : "INACTIVE"}</span>
              {court.hourlyRate != null && <span style={styles.editHint}>₱{court.hourlyRate}/hr</span>}
              <button style={styles.checkInTapBtn} onClick={() => startEdit(court)}>
                Edit
              </button>
              <button style={styles.checkInTapBtn} onClick={() => toggleActive(court)}>
                {court.active ? "Deactivate" : "Activate"}
              </button>
            </li>
          ))}
        </ul>
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
        const guestRecord = emptyPlayerRecord({ firstName: finalName, contactNumber: finalContact || null, skill: "beginner" });
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

// ---- Booking Calendar (Day timeline — the primary interface) ----
const TIMELINE_START_HOUR = 6;
const TIMELINE_END_HOUR = 22;
const TIMELINE_HOURS = Array.from({ length: TIMELINE_END_HOUR - TIMELINE_START_HOUR }, (_, i) => TIMELINE_START_HOUR + i);

function timeToFraction(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h + m / 60 - TIMELINE_START_HOUR) / (TIMELINE_END_HOUR - TIMELINE_START_HOUR);
}

// Click an empty slot -> create a booking pre-filled with that court/date/
// hour; click an existing block -> edit it. This IS the primary interface
// per the organizer's own explicit recommendation, not a secondary view
// alongside a list — the list (BookingListPanel) still exists for
// search/filter/status-triage, but the timeline is what a staff member
// actually books off of day-to-day.
function DayTimeline({ courts, bookings, date, onSlotClick, onBookingClick }) {
  const dayBookings = bookings.filter((b) => b.date === date && b.status !== "cancelled");
  return (
    <div>
      <div style={styles.bracketScroll}>
        <div style={{ display: "flex", paddingLeft: 110 }}>
          {TIMELINE_HOURS.map((h) => (
            <div key={h} style={{ flex: 1, minWidth: 70, fontSize: 11, color: "var(--color-text-faint)", fontFamily: "'Space Mono', monospace" }}>
              {h % 12 === 0 ? 12 : h % 12}{h >= 12 ? "PM" : "AM"}
            </div>
          ))}
        </div>
        {courts.map((court) => (
          <div key={court.id} style={{ display: "flex", alignItems: "center", marginTop: 8, opacity: court.active ? 1 : 0.4 }}>
            <div style={{ width: 110, flexShrink: 0, fontWeight: 700, fontSize: 13 }}>{court.name}</div>
            <div style={{ position: "relative", flex: 1, minWidth: TIMELINE_HOURS.length * 70, height: 44, background: "var(--color-surface)", border: "1.5px solid var(--line)", borderRadius: 8 }}>
              {TIMELINE_HOURS.map((h, i) => (
                <div
                  key={h}
                  onClick={() => court.active && onSlotClick(court, date, `${String(h).padStart(2, "0")}:00`)}
                  style={{
                    position: "absolute",
                    left: `${(i / TIMELINE_HOURS.length) * 100}%`,
                    width: `${(1 / TIMELINE_HOURS.length) * 100}%`,
                    height: "100%",
                    borderLeft: i > 0 ? "1px dashed var(--line)" : "none",
                    cursor: court.active ? "pointer" : "not-allowed",
                  }}
                  title={court.active ? "Click to book this slot" : "Court inactive"}
                />
              ))}
              {dayBookings
                .filter((b) => b.courtId === court.id)
                .map((b) => {
                  const left = Math.max(0, timeToFraction(b.startTime)) * 100;
                  const width = (Math.min(1, timeToFraction(b.endTime)) - Math.max(0, timeToFraction(b.startTime))) * 100;
                  return (
                    <div
                      key={b.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onBookingClick(b);
                      }}
                      style={{
                        position: "absolute",
                        left: `${left}%`,
                        width: `${Math.max(width, 2)}%`,
                        height: "100%",
                        background: "var(--court)",
                        color: "var(--chalk)",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        cursor: "pointer",
                        zIndex: 1,
                      }}
                      title={`${b.customerName} · ${formatTime(b.startTime)}–${formatTime(b.endTime)}`}
                    >
                      {b.customerName}
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarPanel({ courts, bookings, onSlotClick, onBookingClick }) {
  const [view, setView] = useState("day"); // "day" | "week"
  const [date, setDate] = useState(todayString());

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
      </div>

      {courts.length === 0 ? (
        <p style={styles.editHint}>Add a court in Court Management before booking.</p>
      ) : view === "day" ? (
        <DayTimeline courts={courts} bookings={bookings} date={date} onSlotClick={onSlotClick} onBookingClick={onBookingClick} />
      ) : (
        <div style={styles.editGrid}>
          {weekDates.map((d) => {
            const count = bookings.filter((b) => b.date === d && b.status !== "cancelled").length;
            return (
              <button
                key={d}
                type="button"
                style={{ ...styles.editChip, ...(d === date ? styles.editChipA : {}) }}
                onClick={() => {
                  setDate(d);
                  setView("day");
                }}
              >
                <span style={styles.editChipName}>
                  {formatDate(d)}
                  <span style={styles.pickerScheduledTag}>{count} booking{count === 1 ? "" : "s"}</span>
                </span>
              </button>
            );
          })}
        </div>
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
          {tab === "courts" && <CourtManagementPanel courts={courts} onReload={load} />}
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

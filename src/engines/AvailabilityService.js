// Availability Engine — see PROJECT.md's Court Booking & Reservations
// section. Pure functions only: every conflict/overlap/availability
// question a caller (BookingService, BookingForm, BookingCalendar, and
// Open Play's own court-fill integration) ever needs, computed fresh from
// whatever courts/bookings it's handed — nothing here persists anything
// or reaches into storage itself.
//
// Time is always a plain "HH:MM" 24-hour string (from a <input type="time">)
// and date a plain "YYYY-MM-DD" string (from <input type="date">) —
// deliberately not Date objects: string comparison already sorts/compares
// correctly for same-day ranges, and it sidesteps timezone handling
// entirely for a single-venue, local-time booking system.
const ACTIVE_STATUSES = new Set(["reserved", "completed"]); // NOT "cancelled"/"noShow" — a cancelled or no-show slot frees the court back up

export function isValidTimeRange(startTime, endTime) {
  return Boolean(startTime) && Boolean(endTime) && startTime < endTime;
}

export function doTimeRangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

// Every existing, still-active booking that would conflict with the given
// court/date/time — the actual "prevent double booking the same court,
// prevent overlapping reservations" rule. `excludeBookingId` lets an edit
// re-validate itself without conflicting with its own prior record.
export function findConflicts(bookings, { courtId, date, startTime, endTime, excludeBookingId = null }) {
  return bookings.filter(
    (b) =>
      b.id !== excludeBookingId &&
      b.courtId === courtId &&
      b.date === date &&
      ACTIVE_STATUSES.has(b.status) &&
      doTimeRangesOverlap(startTime, endTime, b.startTime, b.endTime)
  );
}

// Every rule the spec's Conflict Detection section names, as one callable
// { valid, errors[] } check — every failing rule at once, the same
// "richer, separately-callable validation" shape this app's other
// services (PlayoffBracketGenerator.validateBracket, etc.) already use.
export function validateBookingFields({ court, date, startTime, endTime }, bookings, excludeBookingId = null) {
  const errors = [];
  if (!court) {
    errors.push("Select a court.");
    return { valid: false, errors };
  }
  if (!court.active) {
    errors.push(`${court.name} is inactive and can't be booked.`);
  }
  if (!date) {
    errors.push("Select a date.");
  }
  if (!isValidTimeRange(startTime, endTime)) {
    errors.push("End time must be after start time.");
  }
  if (court.active && date && isValidTimeRange(startTime, endTime)) {
    const conflicts = findConflicts(bookings, { courtId: court.id, date, startTime, endTime, excludeBookingId });
    if (conflicts.length > 0) {
      errors.push(`${court.name} is already booked ${conflicts[0].startTime}–${conflicts[0].endTime} on ${date} — choose a different time or court.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// "When selecting Date/Start Time/End Time, automatically display
// available courts" — every ACTIVE court with no conflicting booking for
// that window. Courts with no date/time chosen yet just show every active
// court (nothing to conflict-check against).
export function getAvailableCourts(courts, bookings, { date, startTime, endTime }) {
  const activeCourts = courts.filter((c) => c.active);
  if (!date || !isValidTimeRange(startTime, endTime)) return activeCourts;
  return activeCourts.filter((c) => findConflicts(bookings, { courtId: c.id, date, startTime, endTime }).length === 0);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}
function todayString(now) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}
function timeString(now) {
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

// Open Play integration — see PROJECT.md. The one place "is court NUMBER
// reserved right now" gets answered, matched by court NUMBER (the only
// identity Open Play's own state.courts has ever had — see
// lib/courtDatabase.js's header comment for why). Returns a Set of court
// numbers currently inside an active (reserved/completed... in practice
// always "reserved" for a future/current slot) booking's date+time window,
// for O(1) lookup per court while rendering/filling.
export function getCourtsReservedNow(courts, bookings, now = new Date()) {
  const date = todayString(now);
  const time = timeString(now);
  const reservedCourtIds = new Set(
    bookings.filter((b) => b.status === "reserved" && b.date === date && b.startTime <= time && time < b.endTime).map((b) => b.courtId)
  );
  return new Set(courts.filter((c) => reservedCourtIds.has(c.id)).map((c) => c.number));
}

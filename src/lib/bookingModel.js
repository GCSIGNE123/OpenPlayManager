// Booking model — the club's court reservations. See PROJECT.md's Court
// Booking & Reservations section. One KV record per booking
// (`opl-booking-{id}`, shared, listed by prefix), same one-record-per-
// entity pattern as `lib/courtDatabase.js`/`lib/playerDatabase.js`.
import { uid } from "./random.js";
import { BOOKING_PREFIX } from "./constants.js";

// Every reservation TYPE this engine is designed to support, per Future
// Compatibility — a plain descriptive tag, not yet branched on by any
// logic in this phase (Open Play integration checks status/date/time,
// never bookingSource). Storing it now means a later phase (auto-created
// Open Play/Tournament/Coaching bookings) reuses this exact same
// Booking/BookingService/AvailabilityService pipeline instead of a
// parallel one.
export const BOOKING_SOURCES = [
  { value: "walkIn", label: "Walk-in" },
  { value: "staffReservation", label: "Staff Reservation" },
  { value: "onlineBooking", label: "Online Booking" },
  { value: "openPlay", label: "Open Play" },
  { value: "tournament", label: "Tournament" },
  { value: "coaching", label: "Coaching" },
  { value: "maintenance", label: "Maintenance" },
  { value: "privateEvent", label: "Private Event" },
];

export const BOOKING_STATUSES = ["reserved", "completed", "cancelled", "noShow"];

// Booking = {
//   id, courtId (CourtRecord id — see lib/courtDatabase.js),
//   playerId (nullable — a Player Database id; see Player Management
//     integration below), customerName, contactNumber (denormalized
//     SNAPSHOT of the linked player's displayName/contactNumber at the
//     moment the booking was made — kept for fast list/calendar rendering
//     without an N+1 fetch per booking; playerId, when present, is the
//     authoritative identity link, these two are a display cache only),
//   date ('YYYY-MM-DD' string — plain string sorts/compares correctly and
//     needs no timezone handling, the same reasoning a bare HH:MM string
//     below gets), startTime, endTime ('HH:MM', 24-hour), numberOfPlayers
//     (nullable number), notes (nullable string),
//   status ('reserved' | 'completed' | 'cancelled' | 'noShow'),
//   bookingSource (see BOOKING_SOURCES — who/what created this booking),
//   createdAt, updatedAt (ms epoch),
//
//   -- Future Compatibility fields (additive, all null/false/unused this
//   phase — see PROJECT.md's Future Compatibility list: Cash/GCash/Maya/
//   Credit Card payments, public online booking, membership discounts,
//   dynamic pricing, recurring reservations, QR check-in). Present now so
//   a later phase adds real values to existing fields instead of a data
//   migration:
//   paymentStatus (nullable), paymentMethod (nullable), price (nullable),
//   isRecurring (bool), recurringGroupId (nullable — link sibling
//   occurrences of one recurring series), checkedInAt (nullable ms epoch)
// }
export function emptyBooking({
  courtId,
  playerId = null,
  customerName,
  contactNumber = null,
  date,
  startTime,
  endTime,
  numberOfPlayers = null,
  notes = null,
  bookingSource = "staffReservation",
}) {
  const now = Date.now();
  return {
    id: uid(),
    courtId,
    playerId,
    customerName: customerName.trim(),
    contactNumber: contactNumber ? contactNumber.trim() : null,
    date,
    startTime,
    endTime,
    numberOfPlayers: numberOfPlayers === "" || numberOfPlayers == null ? null : Number(numberOfPlayers),
    notes: notes ? notes.trim() : null,
    status: "reserved",
    bookingSource: BOOKING_SOURCES.some((s) => s.value === bookingSource) ? bookingSource : "staffReservation",
    paymentStatus: null,
    paymentMethod: null,
    price: null,
    isRecurring: false,
    recurringGroupId: null,
    checkedInAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function fetchAllBookings() {
  const { keys } = await window.storage.list(BOOKING_PREFIX, true);
  const records = await Promise.all(
    keys.map(async (key) => {
      try {
        const res = await window.storage.get(key, true);
        return JSON.parse(res.value);
      } catch (e) {
        return null;
      }
    })
  );
  return records.filter(Boolean);
}

export async function fetchBooking(id) {
  try {
    const res = await window.storage.get(`${BOOKING_PREFIX}${id}`, true);
    return JSON.parse(res.value);
  } catch (e) {
    return null;
  }
}

export async function saveBooking(record) {
  const stamped = { ...record, updatedAt: Date.now() };
  await window.storage.set(`${BOOKING_PREFIX}${record.id}`, JSON.stringify(stamped), true);
  return stamped;
}

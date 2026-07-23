// Court Database — the club's persistent, physical-court registry. See
// PROJECT.md's Court Booking & Reservations section. One KV record per
// court (`opl-court-{id}`, shared, listed by prefix), the exact same
// one-record-per-entity pattern `lib/playerDatabase.js` already
// established — deliberately NOT a single aggregate blob (a full
// read-modify-write on every edit risks two staff clobbering each other).
//
// This is the FIRST persistent Court entity in this app. Open Play's
// `state.courts` and Tournament's `tournament.courts` are both still
// freshly-generated, numbered-only arrays scoped to that one session/
// tournament, with no identity beyond a bare `number` — they are NOT
// migrated or replaced by this. Court Booking & Reservations is built
// entirely on this new registry; Open Play integrates with it by matching
// on court NUMBER (see engines/AvailabilityService.js's
// getCourtsReservedNow) since that's the only identity Open Play courts
// have ever had. Tournament integration is a deliberate later phase (see
// PROJECT.md) — tournaments have no real-world scheduled date/time field
// today, so "is this tournament's Court 2 reserved at 6pm Saturday" isn't
// yet a meaningful question to ask.
import { uid } from "./random.js";
import { COURT_PREFIX } from "./constants.js";

// SURFACE_TYPES — stored only, purely descriptive (same "capture now, wire
// later" precedent hourlyRate already set) — nothing in AvailabilityService
// or BookingService reads this.
export const SURFACE_TYPES = [
  { value: "concrete", label: "Concrete" },
  { value: "asphalt", label: "Asphalt" },
  { value: "cushioned", label: "Cushioned Acrylic" },
  { value: "synthetic", label: "Synthetic Turf" },
  { value: "wood", label: "Wood (Indoor)" },
];

// EQUIPMENT_TYPES — stored only, purely descriptive (same "capture now,
// wire later" precedent as SURFACE_TYPES/hourlyRate) — nothing in
// AvailabilityService or BookingService reads this. A plain catalog array
// (not an enum baked into the record shape) so a future equipment type is
// just one more entry here, never a data migration.
export const EQUIPMENT_TYPES = [
  { value: "lights", label: "Lights" },
  { value: "covered", label: "Covered" },
  { value: "nets", label: "Nets" },
  { value: "washroom", label: "Washroom Nearby" },
];

// CourtRecord = {
//   id, name, number (integer, the same "Court N" numbering Open Play/
//   Tournament already use — NOT required to be unique across every
//   record in a large multi-venue future, but is today's single-venue
//   assumption, consistent with this app's whole existing scope),
//   location ('indoor' | 'outdoor'), surfaceType (one of SURFACE_TYPES,
//   stored only — display/reference, same status as hourlyRate),
//   photo (nullable base64 string, resizeImageToAvatar-cropped — same
//   photo pipeline Player Database already uses), hourlyRate (nullable
//   number — stored only, not used by anything yet, per spec), active
//   (bool), maintenance (bool — a purely informational status flag for
//   the Court Management badge; deliberately NOT read by
//   AvailabilityService/BookingService, which still key off `active`
//   alone, so booking/conflict logic is unchanged), equipment (string[],
//   values from EQUIPMENT_TYPES — purely descriptive, same status as
//   surfaceType), createdAt, updatedAt (ms epoch)
// }
export function emptyCourtRecord({
  name,
  number,
  location = "outdoor",
  surfaceType = "concrete",
  photo = null,
  hourlyRate = null,
  equipment = [],
  venueId = null, // Phase 0: Multi-Tenant Foundation, see lib/venueModel.js — architecture-only, nothing reads this yet
}) {
  const now = Date.now();
  return {
    id: uid(),
    name: (name || `Court ${number}`).trim(),
    number: Number(number),
    location: location === "indoor" ? "indoor" : "outdoor",
    surfaceType: SURFACE_TYPES.some((s) => s.value === surfaceType) ? surfaceType : "concrete",
    photo: photo || null,
    hourlyRate: hourlyRate === "" || hourlyRate == null ? null : Number(hourlyRate),
    active: true,
    maintenance: false,
    equipment: Array.isArray(equipment) ? equipment.filter((e) => EQUIPMENT_TYPES.some((t) => t.value === e)) : [],
    venueId,
    createdAt: now,
    updatedAt: now,
  };
}

export async function fetchAllCourts() {
  const { keys } = await window.storage.list(COURT_PREFIX, true);
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
  return records.filter(Boolean).sort((a, b) => a.number - b.number);
}

export async function fetchCourt(id) {
  try {
    const res = await window.storage.get(`${COURT_PREFIX}${id}`, true);
    return JSON.parse(res.value);
  } catch (e) {
    return null;
  }
}

export async function saveCourtRecord(record) {
  const stamped = { ...record, updatedAt: Date.now() };
  await window.storage.set(`${COURT_PREFIX}${record.id}`, JSON.stringify(stamped), true);
  return stamped;
}

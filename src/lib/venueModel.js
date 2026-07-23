// Venue Database — Phase 0: Multi-Tenant Foundation. See PROJECT.md's
// Multi-Tenant Venue Architecture section. One KV record per Venue
// (`opl-venue-{id}`, shared, listed by prefix), the exact same
// one-record-per-entity pattern every other registry in this app already
// uses (lib/courtDatabase.js, lib/playerDatabase.js, ...) — deliberately
// NOT a single aggregate blob, for the same reason those aren't either.
//
// Venue is the new top-level entity: "the primary customer of Pickleball
// King is a Pickleball Venue (Gym), not an individual club." Every other
// module (Court, Booking, Player, Tournament, League) is being given a
// nullable `venueId` field this same phase so it CAN belong to a Venue —
// but nothing is backfilled/migrated onto a Venue automatically, and
// nothing existing changes behavior because of it. See VenueManagementScreen.jsx
// for the one screen that reads/writes Venue records this phase.
import { uid } from "./random.js";
import { VENUE_PREFIX } from "./constants.js";

// VenueRecord = {
//   id, name, logo (nullable base64 string, resizeImageToAvatar-cropped —
//   same photo pipeline Player/Court records already use), description
//   (nullable), contactNumber (nullable), email (nullable), website
//   (nullable), facebookPage (nullable), address (nullable), city
//   (nullable), province (nullable), country (nullable), timeZone
//   (nullable string, e.g. "Asia/Manila"), latitude/longitude (nullable
//   numbers), openingTime/closingTime (nullable "HH:MM" 24-hour strings,
//   same format Booking's startTime/endTime already use), numberOfCourts
//   (nullable number — an informational profile field the organizer sets
//   directly; NOT the live count of actual Court records, which
//   VenueManagementScreen's dashboard computes separately by matching
//   Court.venueId), active (bool), createdAt, updatedAt (ms epoch)
// }
export function emptyVenueRecord({
  name,
  logo = null,
  description = null,
  contactNumber = null,
  email = null,
  website = null,
  facebookPage = null,
  address = null,
  city = null,
  province = null,
  country = null,
  timeZone = null,
  latitude = null,
  longitude = null,
  openingTime = null,
  closingTime = null,
  numberOfCourts = null,
}) {
  const now = Date.now();
  return {
    id: uid(),
    name: (name || "New Venue").trim(),
    logo: logo || null,
    description: description ? description.trim() : null,
    contactNumber: contactNumber ? contactNumber.trim() : null,
    email: email ? email.trim() : null,
    website: website ? website.trim() : null,
    facebookPage: facebookPage ? facebookPage.trim() : null,
    address: address ? address.trim() : null,
    city: city ? city.trim() : null,
    province: province ? province.trim() : null,
    country: country ? country.trim() : null,
    timeZone: timeZone || null,
    latitude: latitude === "" || latitude == null ? null : Number(latitude),
    longitude: longitude === "" || longitude == null ? null : Number(longitude),
    openingTime: openingTime || null,
    closingTime: closingTime || null,
    numberOfCourts: numberOfCourts === "" || numberOfCourts == null ? null : Number(numberOfCourts),
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function fetchAllVenues() {
  const { keys } = await window.storage.list(VENUE_PREFIX, true);
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
  return records.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchVenue(id) {
  try {
    const res = await window.storage.get(`${VENUE_PREFIX}${id}`, true);
    return JSON.parse(res.value);
  } catch (e) {
    return null;
  }
}

export async function saveVenueRecord(record) {
  const stamped = { ...record, updatedAt: Date.now() };
  await window.storage.set(`${VENUE_PREFIX}${record.id}`, JSON.stringify(stamped), true);
  return stamped;
}

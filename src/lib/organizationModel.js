// Organization Database — RESERVED ARCHITECTURE ONLY. See PROJECT.md's
// Multi-Tenant Venue Architecture section. Per explicit direction: "Do NOT
// implement Organization Management yet. Simply reserve the architecture."
//
// Nothing in this app reads or writes an Organization record this phase —
// there is no screen, no navigation link, no consumer anywhere. This file
// exists purely so the shape (and the storage plumbing every other
// registry in this app already follows — see lib/venueModel.js/
// lib/courtDatabase.js) is settled ahead of time, the same way Booking's
// Future Compatibility fields (paymentStatus, isRecurring, ...) were added
// unused before any payments/recurring-booking feature existed.
//
// Future shape: Venue → Organizations → Members (Pickleball Clubs,
// Coaches, Academies, Corporate Groups, Tournament Organizers).
import { uid } from "./random.js";
import { ORGANIZATION_PREFIX } from "./constants.js";

export const ORGANIZATION_TYPES = [
  { value: "club", label: "Pickleball Club" },
  { value: "coach", label: "Coach" },
  { value: "academy", label: "Academy" },
  { value: "corporateGroup", label: "Corporate Group" },
  { value: "tournamentOrganizer", label: "Tournament Organizer" },
];

// OrganizationRecord = {
//   id, venueId (nullable — which Venue this organization operates
//   within), name, type (one of ORGANIZATION_TYPES), contactNumber
//   (nullable), email (nullable), active (bool), createdAt, updatedAt
//   (ms epoch)
// }
export function emptyOrganizationRecord({ venueId = null, name, type = "club", contactNumber = null, email = null }) {
  const now = Date.now();
  return {
    id: uid(),
    venueId,
    name: (name || "New Organization").trim(),
    type: ORGANIZATION_TYPES.some((t) => t.value === type) ? type : "club",
    contactNumber: contactNumber ? contactNumber.trim() : null,
    email: email ? email.trim() : null,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function fetchAllOrganizations() {
  const { keys } = await window.storage.list(ORGANIZATION_PREFIX, true);
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

export async function saveOrganizationRecord(record) {
  const stamped = { ...record, updatedAt: Date.now() };
  await window.storage.set(`${ORGANIZATION_PREFIX}${record.id}`, JSON.stringify(stamped), true);
  return stamped;
}

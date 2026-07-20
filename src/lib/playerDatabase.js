// Player Database — a reusable, cross-session player registry. One Supabase
// KV record per player (`opl-player-{id}`, shared, listed by prefix), the
// exact same storage pattern already used for sessions (`opl-session-`) and
// access codes (`opl-access-`) in lib/constants.js/storage.js. Deliberately
// NOT a single aggregate blob — that would need a full read-modify-write on
// every add and risks two organizers clobbering each other's edits.
//
// This is intentionally separate from a *session's* per-player record
// (state.players[id] in PickleballOpenPlay.jsx — games/wins/losses/
// checkedIn/skipped, reset fresh every session). A Player Database record is
// the reusable identity/profile; a session player record is that session's
// scoped stats. The two are linked by sharing the same id — when a player is
// added to a session roster (either picked from the database or newly
// created here), CreateSessionScreen.jsx reuses this record's id as the
// roster entry's id, so a future Statistics/Rankings feature can join a
// player's history across every session purely by id, with no migration.
//
// Architecture-only for now, per the task this was built under: no
// statistics, rankings, or tournament logic reads this yet. See PROJECT.md.
import { uid } from "./random.js";
import { PLAYER_DB_PREFIX } from "./constants.js";

// id -> {
//   id, firstName, lastName (nullable), displayName, photo (nullable, data
//   URL — same format session players already use), gender (nullable),
//   skill ('beginner' | 'intermediate' — doubles as Membership's "Skill
//   Level", see PROJECT.md's Membership Management section), duprRating
//   (nullable number), contactNumber (nullable), notes (nullable — doubles
//   as Membership's "Notes"), active (bool), createdAt, updatedAt (ms epoch),
//
//   -- Membership Management fields (additive; a record from before this
//   task simply has memberId/membershipStatus/etc. as null/undefined,
//   read as "no membership set up yet" — see engines/MembershipService.js,
//   which is the only thing that gives these fields real meaning):
//   memberId (nullable string, a short organizer-facing code e.g. "M-A1B2C3"),
//   membershipStatus ('active' | 'expired' | 'suspended' | 'pending' | null —
//     the STORED status; MembershipService.getMembershipStatus is what
//     actually decides what a member's status reads as, since an expired
//     date should win over a stale stored "active" without anyone having to
//     remember to flip it manually),
//   membershipPlanId (nullable string — a built-in or custom MembershipPlan id),
//   joinDate (nullable ms epoch), expirationDate (nullable ms epoch),
//   emergencyContact (nullable string), duprId (nullable string placeholder
//   — the player's DUPR account id, distinct from duprRating's number)
// }
export function emptyPlayerRecord({
  firstName,
  lastName = null,
  displayName,
  photo = null,
  gender = null,
  skill = "beginner",
  duprRating = null,
  contactNumber = null,
  notes = null,
  memberId = null,
  membershipStatus = null,
  membershipPlanId = null,
  joinDate = null,
  expirationDate = null,
  emergencyContact = null,
  duprId = null,
}) {
  const now = Date.now();
  return {
    id: uid(),
    firstName: firstName.trim(),
    lastName: lastName ? lastName.trim() : null,
    displayName: (displayName || firstName).trim(),
    photo,
    gender,
    skill: skill === "intermediate" ? "intermediate" : "beginner",
    duprRating: duprRating === "" || duprRating == null ? null : Number(duprRating),
    contactNumber: contactNumber ? contactNumber.trim() : null,
    notes: notes ? notes.trim() : null,
    active: true,
    memberId,
    membershipStatus,
    membershipPlanId,
    joinDate,
    expirationDate,
    emergencyContact: emergencyContact ? emergencyContact.trim() : null,
    duprId: duprId ? duprId.trim() : null,
    createdAt: now,
    updatedAt: now,
  };
}

// A short, organizer-facing member code — not a sequential counter (would
// need a full player list read to compute safely), just a readable slice
// of a fresh uid. Called once, at the point a player is actually enrolled
// in a membership plan (see MembershipService.renewMembership), not at
// player-record creation — a player with no membership yet has no member id.
export function generateMemberId() {
  return `M-${uid().slice(0, 6).toUpperCase()}`;
}

// Every player record in the database. N+1 (list then get-each) rather than
// a bulk fetch — window.storage has no batch-get, and club-sized rosters
// (dozens to a few hundred players) make this a non-issue for now; worth
// revisiting if this ever needs to scale further.
export async function fetchAllPlayers() {
  const { keys } = await window.storage.list(PLAYER_DB_PREFIX, true);
  const records = await Promise.all(
    keys.map(async (key) => {
      try {
        const res = await window.storage.get(key, true);
        return JSON.parse(res.value);
      } catch (e) {
        return null; // a record that vanished between list and get — skip it
      }
    })
  );
  return records.filter(Boolean);
}

// Single-record lookup — used by the Club Rating & Ranking Engine to check
// whether a given id is a real Player Database record before awarding any
// rating (a session-only walk-in id isn't one; see engines/RatingEngine.js).
export async function fetchPlayer(id) {
  try {
    const res = await window.storage.get(`${PLAYER_DB_PREFIX}${id}`, true);
    return JSON.parse(res.value);
  } catch (e) {
    return null;
  }
}

export async function savePlayerRecord(record) {
  const stamped = { ...record, updatedAt: Date.now() };
  await window.storage.set(`${PLAYER_DB_PREFIX}${record.id}`, JSON.stringify(stamped), true);
  return stamped;
}

// case-insensitive match on display/first/last name — same "no query = show
// everything" convention as PlayerPicker's search
export function filterPlayersByQuery(players, query) {
  const q = query.trim().toLowerCase();
  if (!q) return players;
  return players.filter((p) =>
    [p.displayName, p.firstName, p.lastName].some((s) => s && s.toLowerCase().includes(q))
  );
}

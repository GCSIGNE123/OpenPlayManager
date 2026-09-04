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
//   id, firstName, lastName (nullable), displayName, nickname (nullable —
//   Player Management's optional registration field, see PROJECT.md's
//   Player Management section), photo (nullable, data URL — same format
//   session players already use), gender (nullable), skill ('beginner' |
//   'intermediate' | 'advanced' — see Player Management's skill filter;
//   note Open Play's matchmaking engines (BalancedRotationEngine et al.)
//   still only ever check for exactly 'beginner'/'intermediate' — an
//   'advanced'-tagged player added to a session roster won't be recognized
//   by either group in Mentorship-phase pairing. That's an existing-code
//   limitation this task deliberately leaves alone, not a bug introduced
//   here; a player only ever gets tagged 'advanced' via an explicit choice
//   in the Player Management profile editor, never by any existing
//   session flow), duprRating (nullable number), contactNumber (nullable),
//   notes (nullable — doubles as Membership's "Notes"), active (bool),
//   createdAt, updatedAt (ms epoch),
//
//   -- Membership Management fields (additive; a record from before this
//   task simply has memberId/membershipStatus/etc. as null/undefined,
//   read as "no membership set up yet" — see engines/MembershipService.js,
//   which is the only thing that gives these fields real meaning). Player
//   Management (the directory/profile UI) never reads or writes these —
//   they're left fully intact for League/Tournament membership-eligibility
//   gating, which is a separate, still-active feature:
//   memberId (nullable string, a short organizer-facing code e.g. "M-A1B2C3"),
//   membershipStatus ('active' | 'expired' | 'suspended' | 'pending' | null —
//     the STORED status; MembershipService.getMembershipStatus is what
//     actually decides what a member's status reads as, since an expired
//     date should win over a stale stored "active" without anyone having to
//     remember to flip it manually),
//   membershipPlanId (nullable string — a built-in or custom MembershipPlan id),
//   joinDate (nullable ms epoch), expirationDate (nullable ms epoch),
//   emergencyContact (nullable string), duprId (nullable string placeholder
//   — the player's DUPR account id, distinct from duprRating's number),
//   birthdate (nullable ISO date string "YYYY-MM-DD" — added for PickleKing
//   Player's direct self-registration flow; a record from before this field
//   existed simply has it null/undefined, same "additive, no backfill"
//   precedent as every other optional field here. Never used to compute or
//   store age — age, if ever needed, is derived from this at read time)
// }
export function emptyPlayerRecord({
  firstName,
  lastName = null,
  displayName,
  nickname = null,
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
  venueId = null, // Phase 0: Multi-Tenant Foundation, see lib/venueModel.js — architecture-only, nothing reads this yet
  city = null, // PKR Ranking's Local Ranking — see the field's own comment below
  birthdate = null, // PickleKing Player self-registration — see the field's own comment above
}) {
  const now = Date.now();
  return {
    id: uid(),
    firstName: firstName.trim(),
    lastName: lastName ? lastName.trim() : null,
    displayName: (displayName || firstName).trim(),
    nickname: nickname ? nickname.trim() : null,
    photo,
    gender,
    skill: ["intermediate", "advanced"].includes(skill) ? skill : "beginner",
    duprRating: duprRating === "" || duprRating == null ? null : Number(duprRating),
    contactNumber: contactNumber ? contactNumber.trim() : null,
    notes: notes ? notes.trim() : null,
    birthdate: birthdate || null,
    active: true,
    venueId,
    memberId,
    membershipStatus,
    membershipPlanId,
    joinDate,
    expirationDate,
    emergencyContact: emergencyContact ? emergencyContact.trim() : null,
    duprId: duprId ? duprId.trim() : null,
    // PKR Ranking's Local Ranking — plain text, no GPS, no full address.
    // Player-editable via PickleKing Player's own Edit Profile (see
    // pickleking-player's player-profile Edge Function) — Pro's own
    // Player Management editor doesn't need a control for this field,
    // same precedent as duprRating/duprId already being read-only here.
    city: city ? city.trim() : null,
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

// case-insensitive match on display/first/last name plus contact number —
// same "no query = show everything" convention as PlayerPicker's search.
// Every existing caller (CreateSessionScreen's "select existing player"
// search, this function's own original name-only behavior) picks up
// contact-number search for free rather than needing a second,
// Player-Management-specific search function.
export function filterPlayersByQuery(players, query) {
  const q = query.trim().toLowerCase();
  if (!q) return players;
  return players.filter((p) =>
    [p.displayName, p.firstName, p.lastName, p.nickname, p.contactNumber].some((s) => s && s.toLowerCase().includes(q))
  );
}

// Scalable Register Players picker — see CreateSessionScreen.jsx and
// PROJECT.md. The default (no-search) view can no longer render every
// active player once the database grows into the hundreds/thousands — this
// picks a small, useful default subset instead, reusing fields the record
// already has (createdAt/updatedAt) rather than inventing a new
// "lastUsedAt" tracking field. updatedAt is stamped on every
// savePlayerRecord call (creation AND edits, see that function above), so
// sorting by it descending surfaces whoever was most recently touched in
// the database — the closest "recently used" proxy already available
// without a data-model change. `limit` defaults to 10, the middle of the
// "8-12 players" default-view size this was built to.
export function recentPlayers(players, limit = 10) {
  return [...(players || [])]
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
    .slice(0, limit);
}

// Duplicate-name handling — see CreateSessionScreen.jsx's picker ("Handle
// duplicate names clearly"). Never a database change: purely a display-time
// computation over whichever players are actually being RENDERED right now
// (the default subset, or one search result page), so two unrelated
// "Alex"es only get a disambiguating hint when they'd actually appear
// together in the same visible list. Returns a Map<id, hint|null> — hint is
// the player's last name if that alone disambiguates them from the other(s)
// sharing their display name, else a short fragment of their own id (always
// unique, never guessed). Players whose display name is unique in this list
// map to null (no hint needed).
export function disambiguateDuplicateNames(players) {
  const hints = new Map();
  const byName = new Map();
  for (const p of players || []) {
    const key = (p.displayName || "").trim().toLowerCase();
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(p);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const lastNames = new Set(group.map((p) => (p.lastName || "").trim().toLowerCase()).filter(Boolean));
    const lastNameDisambiguates = lastNames.size === group.length; // every member has a distinct last name
    for (const p of group) {
      hints.set(p.id, lastNameDisambiguates ? p.lastName : `#${p.id.slice(-4)}`);
    }
  }
  return hints;
}

// Registered Player Check-In — see CheckinView.jsx/PickleballOpenPlay.jsx's
// checkInFromDatabase. Pure decision only (no state mutation, no save()) —
// given a session's current `players` map and a Player Database `record`
// the organizer picked from search, decides which of three things should
// happen. Extracted here specifically so this new branching logic (not the
// surrounding save()-calling wrapper, which mirrors the existing quickAddCheckIn/
// checkInExisting pattern) can be unit-tested directly.
export function resolveDatabaseCheckIn(sessionPlayers, record) {
  if (!record?.id) return { action: "noop" };
  const existing = (sessionPlayers || {})[record.id];
  if (existing) {
    return existing.checkedIn ? { action: "noop" } : { action: "checkInExisting", id: record.id };
  }
  return {
    action: "createNew",
    id: record.id,
    name: record.displayName,
    skill: record.skill === "intermediate" ? "intermediate" : "beginner",
    photo: record.photo || null,
  };
}

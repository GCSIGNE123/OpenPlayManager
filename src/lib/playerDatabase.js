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
//   skill ('beginner' | 'intermediate'), duprRating (nullable number),
//   contactNumber (nullable), notes (nullable), active (bool),
//   createdAt, updatedAt (ms epoch)
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
    createdAt: now,
    updatedAt: now,
  };
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

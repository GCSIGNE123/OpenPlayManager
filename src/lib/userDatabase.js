// RBAC User Database — see PROJECT.md's Role-Based Access Control section.
// One Supabase KV record per user (`opl-user-{id}`, shared, listed by
// prefix) — the exact same storage pattern lib/playerDatabase.js already
// uses for the Player Database. Deliberately separate from that: a
// playerDatabase record is a *pickleball player's* reusable identity
// (name/skill/photo/DUPR); a userDatabase record is someone with
// administrative/staff access to this app (an organizer, tournament
// director, referee, etc.) — the two overlap in the real world (a club
// owner is often also a player) but are unrelated data here, same as an
// Open Play session's roster player is unrelated to a Player Database
// record until explicitly linked by id.
import { uid } from "./random.js";
import { USER_PREFIX } from "./constants.js";

// id -> {
//   id, name, roleIds (string[] — see engines/Role.js; a user can hold more
//   than one role), clubId (nullable string — a placeholder single-club
//   field; nothing in this app branches on more than one club existing, see
//   PROJECT.md — this is the seam a future Multi-Club Management feature
//   would read/write, not a real multi-club implementation),
//   status ('active' | 'disabled'), createdAt, updatedAt (ms epoch)
// }
export function emptyUserRecord({ name, roleIds = [], clubId = null }) {
  const now = Date.now();
  return {
    id: uid(),
    name: name.trim(),
    roleIds,
    clubId,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

// N+1 (list then get-each) — same tradeoff lib/playerDatabase.js already
// accepted; a user directory is club-staff-sized (dozens, not thousands).
export async function fetchAllUsers() {
  const { keys } = await window.storage.list(USER_PREFIX, true);
  const records = await Promise.all(
    keys.map(async (key) => {
      try {
        const res = await window.storage.get(key, true);
        return JSON.parse(res.value);
      } catch (e) {
        return null; // vanished between list and get — skip it
      }
    })
  );
  return records.filter(Boolean);
}

export async function saveUserRecord(record) {
  const stamped = { ...record, updatedAt: Date.now() };
  await window.storage.set(`${USER_PREFIX}${record.id}`, JSON.stringify(stamped), true);
  return stamped;
}

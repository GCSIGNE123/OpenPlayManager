import { ACCESS_PREFIX, CODE_CHARS, STORAGE_PREFIX } from "./constants.js";
import { BalancedRotationEngine } from "../engines/BalancedRotationEngine.js";

export { uid, shuffle } from "./random.js";

export function generateRandomCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

// shrink a photo to a small square thumbnail so many player photos stay well
// under the shared-session storage limit
export function resizeImageToAvatar(file, size = 128) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Couldn't load image"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

const AVATAR_COLORS = ["#1F5C43", "#E85D4C", "#8A6D3B", "#3E6B8A", "#7A4C8A", "#3D7A5C"];
export function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function sortByGames(ids, players) {
  return [...ids].sort((a, b) => (players[a]?.games || 0) - (players[b]?.games || 0));
}

// tries a handful of random codes and returns the first one not already in
// use — collisions are astronomically unlikely with a 6-char code, but a
// quick check costs nothing
export async function findUniqueSessionCode() {
  for (let i = 0; i < 6; i++) {
    const code = generateRandomCode(6);
    try {
      const existing = await window.storage.get(`${STORAGE_PREFIX}${code}`, true);
      if (!existing) return code;
    } catch (e) {
      return code; // get() throws when the key doesn't exist — code is free
    }
  }
  return generateRandomCode(6);
}

// access codes are longer (8 chars) than session codes (6) so the two are
// never visually confused — an access code is a paid unlock, a session
// code is just "which open play am I looking at"
export async function findUniqueAccessCode() {
  for (let i = 0; i < 6; i++) {
    const code = generateRandomCode(8);
    try {
      const existing = await window.storage.get(`${ACCESS_PREFIX}${code}`, true);
      if (!existing) return code;
    } catch (e) {
      return code;
    }
  }
  return generateRandomCode(8);
}

// every player id currently locked into one of the pre-built upcoming
// matchups (as opposed to still unassigned in the waiting queue)
export function reservedMatchupIds(nextMatchups) {
  const ids = new Set();
  nextMatchups.forEach((m) => {
    m.teamA.forEach((id) => ids.add(id));
    m.teamB.forEach((id) => ids.add(id));
  });
  return ids;
}

// The active rotation strategy (Strategy pattern — see src/engines/). Only
// one concrete engine exists today; swapping this line (or making it
// swappable from the UI) is how a future mode gets plugged in without
// touching anything below.
const defaultEngine = new BalancedRotationEngine();

// appends any additional ready-to-play matchups the active rotation engine
// can build from waiting players not already locked into one (and not
// sitting out — players[id].skipped) — existing matchups are left
// completely untouched, so a scorer's manual "fix teams" / substitute edits
// (or a matchup already mid-review) never get silently overwritten. Safe to
// call after every state change; it's a no-op unless the engine finds a
// newly-possible matchup.
//
// Deliberately strict (no same-skill fallback): this runs after every
// single state change, including each individual check-in, so players
// almost never arrive in perfectly even beginner/intermediate batches. If a
// same-skill fallback ran here, the first 2 beginners to check in would get
// permanently paired together (matchups are immutable once built) before
// the next intermediate to check in ever got a chance at a proper mixed
// match. The fallback is opt-in — see regenerateNextMatchups below, for
// when an organizer deliberately asks for the best match available *right
// now* with whoever's actually waiting.
export function refreshNextMatchups(queueIds, players, existingMatchups, engine = defaultEngine) {
  const waitingIds = queueIds.filter((id) => !players[id]?.skipped);
  const newMatchups = engine.generateMatchups({ waitingIds, players, existingMatchups });
  return [...existingMatchups, ...newMatchups];
}

// "Regenerate matchups": dissolves every not-locked upcoming matchup and
// reruns the engine over the full eligible pool (their players simply
// become available again, since queueIds already contains everyone waiting
// regardless of matchup membership). Locked matchups are left exactly as
// they are. Unlike refreshNextMatchups, this allows the same-skill fallback
// — it's a deliberate, one-off "match up whoever's here now" action, not
// something that fires silently after every check-in.
export function regenerateNextMatchups(queueIds, players, existingMatchups, engine = defaultEngine) {
  const locked = existingMatchups.filter((m) => m.locked);
  const waitingIds = queueIds.filter((id) => !players[id]?.skipped);
  const newMatchups = engine.generateMatchups({ waitingIds, players, existingMatchups: locked }, true);
  return [...locked, ...newMatchups];
}

// records partner/opponent/court history on all 4 players in a just-ended
// match — feeds the rotation engine's recency scoring next time it runs.
// Win/loss/streak/points bookkeeping stays in PickleballOpenPlay.jsx's
// endMatch since that also needs the score, kept separate here from
// history that any future rotation engine would also want.
export function recordRotationHistory(players, teamA, teamB, courtNumber) {
  const next = { ...players };

  const updateFor = (id, partnerId, opponentIds) => {
    const p = next[id];
    if (!p) return;

    const partnerCounts = { ...(p.partnerCounts || {}) };
    partnerCounts[partnerId] = (partnerCounts[partnerId] || 0) + 1;
    const recentPartnerIds = [partnerId, ...(p.recentPartnerIds || [])].slice(0, 2);

    const opponentCounts = { ...(p.opponentCounts || {}) };
    opponentIds.forEach((oid) => {
      opponentCounts[oid] = (opponentCounts[oid] || 0) + 1;
    });
    const recentOpponentIds = [...opponentIds, ...(p.lastOpponentIds || [])].filter(
      (id, i, arr) => arr.indexOf(id) === i
    ).slice(0, 4);

    const courtCounts = { ...(p.courtCounts || {}) };
    if (courtNumber != null) courtCounts[courtNumber] = (courtCounts[courtNumber] || 0) + 1;

    next[id] = {
      ...p,
      partnerCounts,
      recentPartnerIds,
      opponentCounts,
      lastOpponentIds: opponentIds,
      recentOpponentIds,
      courtCounts,
      lastCourt: courtNumber ?? p.lastCourt ?? null,
    };
  };

  teamA.forEach((id) => updateFor(id, teamA.find((otherId) => otherId !== id), teamB));
  teamB.forEach((id) => updateFor(id, teamB.find((otherId) => otherId !== id), teamA));

  return next;
}

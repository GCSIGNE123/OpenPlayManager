import { ACCESS_PREFIX, CODE_CHARS, STORAGE_PREFIX } from "./constants.js";

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function generateRandomCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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

// picks the next 4 players for a court: prefers a full group who just won
// their last match, then a full group who just lost, so winners keep
// playing winners and losers keep playing losers — falls back to whoever's
// waited longest (by fewest games played) when there aren't 4 of a kind yet
export function pickNextGroup(queueIds, players) {
  const winners = queueIds.filter((id) => players[id]?.lastResult === "win");
  const losers = queueIds.filter((id) => players[id]?.lastResult === "loss");
  if (winners.length >= 4) return sortByGames(winners, players).slice(0, 4);
  if (losers.length >= 4) return sortByGames(losers, players).slice(0, 4);
  return sortByGames(queueIds, players).slice(0, 4);
}

// splits a group of exactly 4 players into two new teams, avoiding pairing
// up anyone with the partner they were just teamed with (players[id].lastPartnerId)
// — e.g. court 1's winner and court 2's winner get cross-paired instead of the
// two winning partners from the same court simply playing together again.
// Falls back to any split when 4 mutual strangers/rematches make it unavoidable
// (or when nobody has a recorded partner yet, e.g. the first round of the day).
export function pairTeamsAvoidingRematch(group, players) {
  const [a, b, c, d] = shuffle(group);
  const wasPartner = (x, y) => players[x]?.lastPartnerId === y || players[y]?.lastPartnerId === x;
  const candidates = [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];
  const clean = candidates.find(([teamA, teamB]) => !wasPartner(...teamA) && !wasPartner(...teamB));
  return clean || candidates[0];
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

// appends any additional ready-to-play matchups that can be built from
// waiting players not already locked into one — existing matchups are left
// completely untouched, so a scorer's manual "fix teams" / substitute edits
// (or a matchup already mid-review) never get silently overwritten. Safe to
// call after every state change; it's a no-op unless 4+ new players are free.
export function refreshNextMatchups(queueIds, players, existingMatchups) {
  const reserved = reservedMatchupIds(existingMatchups);
  let remaining = queueIds.filter((id) => !reserved.has(id));
  const matchups = [...existingMatchups];
  while (remaining.length >= 4) {
    const group = pickNextGroup(remaining, players);
    remaining = remaining.filter((id) => !group.includes(id));
    const [teamA, teamB] = pairTeamsAvoidingRematch(group, players);
    matchups.push({ id: uid(), teamA, teamB });
  }
  return matchups;
}

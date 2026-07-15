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

// groups the waiting list into upcoming 2v2 matchups using the same
// winner/loser-aware logic used to actually fill a court, so the preview
// matches what "Fill all open courts" will really do
export function buildQueueMatchups(waitingPlayers) {
  const playersById = {};
  waitingPlayers.forEach((p) => (playersById[p.id] = p));
  let remainingIds = waitingPlayers.map((p) => p.id);
  const matchups = [];
  while (remainingIds.length >= 4) {
    const group = pickNextGroup(remainingIds, playersById);
    remainingIds = remainingIds.filter((id) => !group.includes(id));
    matchups.push({
      teamA: [playersById[group[0]], playersById[group[1]]],
      teamB: [playersById[group[2]], playersById[group[3]]],
    });
  }
  return { matchups, leftover: remainingIds.map((id) => playersById[id]) };
}

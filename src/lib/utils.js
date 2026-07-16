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

// tries to find 2 beginners + 2 intermediates within a pool, preferring
// whoever's waited longest (fewest games played) within each skill —
// returns null when the pool doesn't have enough of both skills, so callers
// can fall back to a skill-blind pick rather than stalling matchmaking
function pickBalancedGroup(idsPool, players) {
  const beginners = sortByGames(
    idsPool.filter((id) => players[id]?.skill === "beginner"),
    players
  );
  const intermediates = sortByGames(
    idsPool.filter((id) => players[id]?.skill === "intermediate"),
    players
  );
  if (beginners.length < 2 || intermediates.length < 2) return null;
  return [...beginners.slice(0, 2), ...intermediates.slice(0, 2)];
}

// picks the next 4 players for a court: prefers a full group who just won
// their last match, then a full group who just lost, so winners keep
// playing winners and losers keep playing losers — falling back to the
// general waiting queue when the winners/losers pool alone can't supply a
// valid mix. A match is only ever formed from an even 2 beginner + 2
// intermediate group (see pickBalancedGroup) — there is no skill-blind
// fallback, so a beginner-only or intermediate-only group simply keeps
// waiting rather than playing a same-skill-vs-same-skill match. Returns
// null when no valid 2+2 group exists anywhere in the queue yet.
export function pickNextGroup(queueIds, players) {
  const winners = queueIds.filter((id) => players[id]?.lastResult === "win");
  const losers = queueIds.filter((id) => players[id]?.lastResult === "loss");

  if (winners.length >= 4) {
    const group = pickBalancedGroup(winners, players);
    if (group) return group;
  }
  if (losers.length >= 4) {
    const group = pickBalancedGroup(losers, players);
    if (group) return group;
  }
  return pickBalancedGroup(queueIds, players);
}

// splits a group of exactly 4 players into two new teams. When the group is
// an even 2 beginner + 2 intermediate mix, each team always gets one of
// each (a beginner is always paired with an intermediate) — otherwise falls
// back to a skill-blind split. Either way, avoids pairing up anyone with the
// partner they were just teamed with (players[id].lastPartnerId) when
// possible — e.g. court 1's winner and court 2's winner get cross-paired
// instead of the two winning partners from the same court simply playing
// together again. Falls back to any split when avoiding a rematch isn't
// possible (or when nobody has a recorded partner yet).
export function pairTeamsAvoidingRematch(group, players) {
  const wasPartner = (x, y) => players[x]?.lastPartnerId === y || players[y]?.lastPartnerId === x;

  const beginners = group.filter((id) => players[id]?.skill === "beginner");
  const intermediates = group.filter((id) => players[id]?.skill === "intermediate");
  if (beginners.length === 2 && intermediates.length === 2) {
    const [b0, b1] = shuffle(beginners);
    const [i0, i1] = shuffle(intermediates);
    const skillCandidates = [
      [[b0, i0], [b1, i1]],
      [[b0, i1], [b1, i0]],
    ];
    const clean = skillCandidates.find(([teamA, teamB]) => !wasPartner(...teamA) && !wasPartner(...teamB));
    return clean || skillCandidates[0];
  }

  const [a, b, c, d] = shuffle(group);
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
// call after every state change; it's a no-op unless a valid 2 beginner + 2
// intermediate group is newly available (see pickNextGroup) — e.g. 5
// waiting beginners and 1 waiting intermediate produces zero matchups until
// another intermediate checks in, rather than pairing beginners together.
export function refreshNextMatchups(queueIds, players, existingMatchups) {
  const reserved = reservedMatchupIds(existingMatchups);
  let remaining = queueIds.filter((id) => !reserved.has(id));
  const matchups = [...existingMatchups];
  while (remaining.length >= 4) {
    const group = pickNextGroup(remaining, players);
    if (!group) break;
    remaining = remaining.filter((id) => !group.includes(id));
    const [teamA, teamB] = pairTeamsAvoidingRematch(group, players);
    matchups.push({ id: uid(), teamA, teamB });
  }
  return matchups;
}

// Club Rating & Ranking Engine data model + storage — see PROJECT.md's
// Club Rating Engine section. A PlayerRating is keyed by Player Database
// id, NOT a session player id — this is the central identity constraint
// the whole feature works within (see engines/RatingEngine.js's header
// comment for why): only players who exist as a real Player Database
// record can have a persistent, cross-module rating.
//
// This is deliberately a THIRD, separate "wins/losses" concept in this
// app, not a replacement for the other two: Open Play's state.players
// stats are session-scoped (reset every session); a Tournament pool's
// RoundRobinStandingsService numbers are that tournament's own scoped
// record. PlayerRating is the only one that's permanent and spans every
// session/tournament/league a player ever plays in.
import { uid } from "./random.js";
import { RATING_PREFIX, RATING_HISTORY_PREFIX } from "./constants.js";

export const DEFAULT_INITIAL_RATING = 1000; // "configurable default rating" — see RatingEngine's config param

// PlayerRating = {
//   playerId, currentRating, previousRating (the rating just before the
//   most recent match — what "Rating Trend" is computed from: currentRating
//   - previousRating), highestRating (peak ever reached), totalMatches,
//   wins, losses, createdAt, updatedAt
// }
// winPct and trend are deliberately NOT stored — both are one-line
// derivations from fields already here (see engines/RatingEngine.js's
// deriveRatingView), the same "don't persist what you can compute"
// precedent this app already follows everywhere (tournament/court status,
// Membership Status, etc.).
export function makePlayerRating(playerId, initialRating = DEFAULT_INITIAL_RATING) {
  const now = Date.now();
  return {
    playerId,
    currentRating: initialRating,
    previousRating: initialRating,
    highestRating: initialRating,
    totalMatches: 0,
    wins: 0,
    losses: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export async function fetchPlayerRating(playerId) {
  try {
    const res = await window.storage.get(`${RATING_PREFIX}${playerId}`, true);
    return JSON.parse(res.value);
  } catch (e) {
    return null; // no rating yet — caller creates one via makePlayerRating
  }
}

export async function savePlayerRating(rating) {
  const stamped = { ...rating, updatedAt: Date.now() };
  await window.storage.set(`${RATING_PREFIX}${rating.playerId}`, JSON.stringify(stamped), true);
  return stamped;
}

export async function fetchAllPlayerRatings() {
  const { keys } = await window.storage.list(RATING_PREFIX, true);
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

// RatingHistory — one entry per completed match a player's rating moved
// for. Stored as ONE growing array per player (opl-rating-history-{id}),
// not one KV record per match — the same "array embedded in one owner
// record" shape Open Play's own matchHistory already uses, avoiding a KV
// key explosion for an active club.
// entry = {
//   id, matchId, ratingBefore, ratingAfter, delta, opponentId (nullable —
//   only set when the opponent also has a Player Database id), partnerId
//   (nullable — doubles only, the teammate's Player Database id, when
//   known), result ('win' | 'loss'), source ('openPlay' | 'tournament' |
//   'league'), recordedAt (ms epoch)
// }
export function makeRatingHistoryEntry({ matchId, ratingBefore, ratingAfter, opponentId, partnerId, result, source }) {
  return {
    id: uid(),
    matchId,
    ratingBefore,
    ratingAfter,
    delta: ratingAfter - ratingBefore,
    opponentId,
    partnerId,
    result,
    source,
    recordedAt: Date.now(),
  };
}

export async function fetchRatingHistory(playerId) {
  try {
    const res = await window.storage.get(`${RATING_HISTORY_PREFIX}${playerId}`, true);
    return JSON.parse(res.value);
  } catch (e) {
    return [];
  }
}

export async function appendRatingHistory(playerId, entry) {
  const history = await fetchRatingHistory(playerId);
  const next = [...history, entry];
  await window.storage.set(`${RATING_HISTORY_PREFIX}${playerId}`, JSON.stringify(next), true);
  return next;
}

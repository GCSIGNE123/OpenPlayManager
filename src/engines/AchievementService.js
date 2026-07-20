// AchievementService — see PROJECT.md's Club Rating & Ranking Engine
// section. Achievements are keyed by the same Player Database id
// PlayerRating uses (no achievement without a persistent identity, same
// constraint RatingEngine documents).
import { ACHIEVEMENT_PREFIX } from "../lib/constants.js";
import { uid } from "../lib/random.js";

export const ACHIEVEMENT_TYPES = {
  FIRST_WIN: "firstWin",
  WINS_10: "wins10",
  WINS_50: "wins50",
  WINS_100: "wins100",
  TOURNAMENT_CHAMPION: "tournamentChampion",
  LEAGUE_CHAMPION: "leagueChampion", // future — League has no champion/playoffs yet (see PROJECT.md's League Management section), so this is never actually awarded today
  KING_SLAYER: "kingSlayer", // beat the #1 ranked player
};

const WIN_MILESTONES = [
  { count: 1, type: ACHIEVEMENT_TYPES.FIRST_WIN },
  { count: 10, type: ACHIEVEMENT_TYPES.WINS_10 },
  { count: 50, type: ACHIEVEMENT_TYPES.WINS_50 },
  { count: 100, type: ACHIEVEMENT_TYPES.WINS_100 },
];

export async function fetchAchievements(playerId) {
  try {
    const res = await window.storage.get(`${ACHIEVEMENT_PREFIX}${playerId}`, true);
    return JSON.parse(res.value);
  } catch (e) {
    return [];
  }
}

async function saveAchievements(playerId, achievements) {
  await window.storage.set(`${ACHIEVEMENT_PREFIX}${playerId}`, JSON.stringify(achievements), true);
  return achievements;
}

export class AchievementService {
  // Adds `type` if not already earned — idempotent, so callers never need
  // to check first. Returns the achievement record (new or pre-existing).
  async awardAchievement(playerId, type, context = {}) {
    const existing = await fetchAchievements(playerId);
    const already = existing.find((a) => a.type === type);
    if (already) return already;
    const achievement = { id: uid(), type, awardedAt: Date.now(), context };
    await saveAchievements(playerId, [...existing, achievement]);
    return achievement;
  }

  // Win-count milestones (First Win/10/50/100 Wins) — checked against the
  // rating record's own `wins` counter, right after RatingEngine.
  // processMatchResult updates it. Returns every newly-earned achievement
  // this call produced (empty array if nothing crossed a new threshold).
  async awardWinMilestones(playerId, totalWins) {
    const newlyEarned = [];
    for (const milestone of WIN_MILESTONES) {
      if (totalWins < milestone.count) continue;
      const existing = await fetchAchievements(playerId);
      if (existing.some((a) => a.type === milestone.type)) continue;
      newlyEarned.push(await this.awardAchievement(playerId, milestone.type, { wins: totalWins }));
    }
    return newlyEarned;
  }

  async awardTournamentChampion(playerId, tournamentId) {
    return this.awardAchievement(playerId, ACHIEVEMENT_TYPES.TOURNAMENT_CHAMPION, { tournamentId });
  }

  // King Slayer is awarded per-occurrence, not once (a player could slay
  // the king more than once over a club's history) — so this always
  // creates a new record rather than deduping like awardAchievement does.
  async awardKingSlayer(playerId, defeatedPlayerId, matchId) {
    const existing = await fetchAchievements(playerId);
    const achievement = { id: uid(), type: ACHIEVEMENT_TYPES.KING_SLAYER, awardedAt: Date.now(), context: { defeatedPlayerId, matchId } };
    await saveAchievements(playerId, [...existing, achievement]);
    return achievement;
  }

  // Orchestrates the automatic checks that apply to every rated result
  // (win milestones); Tournament Champion/League Champion/King Slayer are
  // awarded via their own dedicated calls above, from the specific event
  // each one actually represents (bracket completion, a match against the
  // pre-match #1), not from this generic per-match hook.
  async awardAchievements(playerId, { totalWins }) {
    return this.awardWinMilestones(playerId, totalWins);
  }
}

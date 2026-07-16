// Session-only Performance Rating. Everything it's built from — games,
// wins, losses, streak, pointsFor/pointsAgainst — already resets to 0 for
// every player whenever a new session is created (see the `players` object
// built in PickleballOpenPlay.jsx's createSession) and never persists
// beyond a session's own storage key, so the rating itself is inherently
// session-scoped without needing separate reset logic.
//
// Not a real skill rating (like DUPR) — just a simple, transparent blend of
// win rate, average point differential, and current streak, weighted so win
// rate dominates. Meant for at-a-glance "who's playing well today" during
// the session, not to be taken as a certified rating.
export function calculatePerformanceRating(player) {
  const games = player.games || 0;
  const wins = player.wins || 0;
  const losses = player.losses || 0;
  const streak = player.streak || 0;
  const pointDiff = (player.pointsFor || 0) - (player.pointsAgainst || 0);
  const winPct = games > 0 ? wins / games : 0;

  if (games === 0) {
    return { games, wins, losses, streak, pointDiff, winPct, rating: null };
  }

  const avgPointDiff = pointDiff / games;
  // win rate carries most of the weight (0-70), average point diff adds up
  // to roughly +/-30 for blowout margins, current streak adds a small
  // extra nudge — clamped to keep the number readable at a glance
  const rating = Math.max(0, Math.min(100, Math.round(winPct * 70 + avgPointDiff * 3 + streak * 2)));

  return { games, wins, losses, streak, pointDiff, winPct, rating };
}

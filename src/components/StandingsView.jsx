import { Flame } from "lucide-react";
import { styles } from "../styles.js";
import { calculatePerformanceRating } from "../lib/performanceRating.js";
import Avatar from "./Avatar.jsx";
import SectionLabel from "./SectionLabel.jsx";

export default function StandingsView({ players }) {
  const rows = Object.values(players)
    .filter((p) => (p.games || 0) > 0)
    .map((p) => ({
      ...p,
      wins: p.wins || 0,
      losses: p.losses || 0,
      streak: p.streak || 0,
      diff: (p.pointsFor || 0) - (p.pointsAgainst || 0),
      performance: calculatePerformanceRating(p),
    }))
    .sort((a, b) => b.wins - a.wins || b.diff - a.diff || a.losses - b.losses);

  const notPlayed = Object.values(players).filter((p) => !(p.games > 0));

  return (
    <div>
      <SectionLabel>Standings</SectionLabel>
      {rows.length === 0 ? (
        <p style={styles.emptyQueue}>No completed games yet — standings fill in as matches end.</p>
      ) : (
        <div style={styles.standingsTable}>
          <div style={styles.standingsHeadRow}>
            <span style={styles.standingsRankCol}>#</span>
            <span style={styles.standingsNameCol}>Player</span>
            <span style={styles.standingsStatCol}>W</span>
            <span style={styles.standingsStatCol}>L</span>
            <span style={styles.standingsStatCol}>+/-</span>
            <span style={styles.standingsRatingCol}>RTG</span>
          </div>
          {rows.map((p, i) => (
            <div key={p.id} style={styles.standingsRow}>
              <span style={styles.standingsRankCol}>{i + 1}</span>
              <span style={styles.standingsNameCol}>
                <Avatar player={p} size={24} />
                <span style={styles.standingsName}>{p.name}</span>
                {p.streak >= 3 && (
                  <Flame
                    size={14}
                    strokeWidth={2.5}
                    color="var(--coral)"
                    fill="var(--coral)"
                    style={{ flexShrink: 0 }}
                    aria-label={`${p.streak} game win streak`}
                  />
                )}
              </span>
              <span style={styles.standingsStatCol}>{p.wins}</span>
              <span style={styles.standingsStatCol}>{p.losses}</span>
              <span
                style={{
                  ...styles.standingsStatCol,
                  color: p.diff > 0 ? "var(--color-success)" : p.diff < 0 ? "var(--color-error)" : "var(--color-text-faint)",
                  fontWeight: 700,
                }}
              >
                {p.diff > 0 ? `+${p.diff}` : p.diff}
              </span>
              <span style={styles.standingsRatingCol}>
                <span
                  style={styles.ratingBadge(p.performance.rating)}
                  title={`${Math.round(p.performance.winPct * 100)}% win rate`}
                >
                  {p.performance.rating === null ? "—" : p.performance.rating}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
      {notPlayed.length > 0 && (
        <p style={styles.standingsNote}>
          {notPlayed.length} checked-in player{notPlayed.length === 1 ? "" : "s"} haven't finished a game yet.
        </p>
      )}
    </div>
  );
}

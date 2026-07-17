import { useState } from "react";
import { Flame } from "lucide-react";
import { styles } from "../styles.js";
import { calculatePerformanceRating } from "../lib/performanceRating.js";
import Avatar from "./Avatar.jsx";
import SectionLabel from "./SectionLabel.jsx";

// sortable columns: click cycles ascending -> descending -> back to the
// default standings order (see SORT_COLUMNS below for value getters)
const SORT_COLUMNS = [
  { key: "gp", label: "GP", getValue: (p) => p.gp },
  { key: "wins", label: "W", getValue: (p) => p.wins },
  { key: "losses", label: "L", getValue: (p) => p.losses },
  { key: "diff", label: "+/-", getValue: (p) => p.diff },
  { key: "rating", label: "RTG", getValue: (p) => p.performance.rating ?? 0 },
];

// default order (no active sort): highest rating, then highest wins, then
// highest point differential, then alphabetical name as the final tie-break
function defaultCompare(a, b) {
  return (
    (b.performance.rating ?? 0) - (a.performance.rating ?? 0) ||
    b.wins - a.wins ||
    b.diff - a.diff ||
    a.name.localeCompare(b.name)
  );
}

export default function StandingsView({ players }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState(null); // "asc" | "desc" | null

  const handleSort = (key) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir(null);
    }
  };

  const rows = Object.values(players)
    .filter((p) => (p.games || 0) > 0)
    .map((p) => ({
      ...p,
      wins: p.wins || 0,
      losses: p.losses || 0,
      streak: p.streak || 0,
      gp: (p.wins || 0) + (p.losses || 0),
      diff: (p.pointsFor || 0) - (p.pointsAgainst || 0),
      performance: calculatePerformanceRating(p),
    }));

  const activeColumn = SORT_COLUMNS.find((c) => c.key === sortKey);
  if (activeColumn) {
    const dirMultiplier = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => dirMultiplier * (activeColumn.getValue(a) - activeColumn.getValue(b)) || a.name.localeCompare(b.name));
  } else {
    rows.sort(defaultCompare);
  }

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
            {SORT_COLUMNS.map((col) => (
              <span
                key={col.key}
                style={col.key === "rating" ? styles.standingsRatingCol : styles.standingsStatCol}
              >
                <button
                  style={styles.standingsSortBtn(sortKey === col.key)}
                  onClick={() => handleSort(col.key)}
                  aria-label={`Sort by ${col.label}`}
                  title={`Sort by ${col.label}`}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span style={styles.standingsSortArrow}>{sortDir === "asc" ? "▲" : "▼"}</span>
                  )}
                </button>
              </span>
            ))}
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
              <span style={styles.standingsStatCol}>{p.gp}</span>
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

import { useState } from "react";
import { styles } from "../styles.js";
import { buildStandingsRows } from "../lib/performanceRating.js";
import { getPlayerQueueStatus } from "../lib/utils.js";
import { QUEUE_STATUSES } from "../lib/constants.js";
import Avatar from "./Avatar.jsx";
import SectionLabel from "./SectionLabel.jsx";

// sortable columns: click cycles ascending -> descending -> back to the
// default standings order (see SORT_COLUMNS below for value getters)
const SORT_COLUMNS = [
  { key: "gp", label: "GP", getValue: (p) => p.gp },
  { key: "wins", label: "W", getValue: (p) => p.wins },
  { key: "losses", label: "L", getValue: (p) => p.losses },
  { key: "winPct", label: "WIN%", getValue: (p) => p.performance.winPct },
  { key: "diff", label: "+/-", getValue: (p) => p.diff },
  { key: "rating", label: "RTG", getValue: (p) => p.performance.rating ?? 0 },
];

// LIVE vs OVERALL — see PROJECT.md. Two views over the SAME ranking
// (buildStandingsRows, unchanged, imported once) — Live only differs by
// which players are handed to it first. No second rating formula: per the
// approved product decision, Live intentionally uses the identical
// rating -> wins -> point-differential -> name order Overall already uses.
const STANDINGS_MODES = [
  { key: "overall", label: "Overall" },
  { key: "live", label: "Live" },
];

// Simplify Standings Table — see PROJECT.md/FEATURES.md. Reduced to
// exactly Player/GP/W/L/+/-/RTG, per a real 32-player session's
// facilitator feedback that the live Standings tab carried more
// information than needed at a glance (skill tag + skill-override button,
// payment badge, win-streak flame). Those aren't lost capabilities — skill
// correction already lives in the Scorer tab's Waiting Players panel, and
// payment status in both the Waiting Players panel and the Scorer tab's
// own stats bar — this view just no longer duplicates them. Session
// Analytics' own reporting (lib/sessionAnalytics.js) is untouched; this is
// a presentation-only change to the live Standings tab.
export default function StandingsView({ players, state }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState(null); // "asc" | "desc" | null
  const [standingsMode, setStandingsMode] = useState("overall"); // "overall" | "live"

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

  // OVERALL — buildStandingsRows(state.players) unchanged: every session
  // participant with at least one completed game, full session performance.
  // LIVE — the SAME buildStandingsRows, just fed only players whose
  // getPlayerQueueStatus is PLAYING right now (on a live court this
  // instant) — held/upcoming/waiting/checked-out players are excluded, same
  // taxonomy the In-Court Player Count and Fixed Partner panel already
  // reuse. Neither view alters completed-game data in any way — this is a
  // read-only, presentation-only filter over data that already exists.
  const sourcePlayers =
    standingsMode === "live"
      ? Object.fromEntries(
          Object.entries(players).filter(([, p]) => getPlayerQueueStatus(p, state) === QUEUE_STATUSES.PLAYING)
        )
      : players;

  // buildStandingsRows already returns rows in the default order (rating,
  // then wins, then point differential, then name) — an active column sort
  // just re-orders that same row set.
  const rows = buildStandingsRows(sourcePlayers);

  const activeColumn = SORT_COLUMNS.find((c) => c.key === sortKey);
  if (activeColumn) {
    const dirMultiplier = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => dirMultiplier * (activeColumn.getValue(a) - activeColumn.getValue(b)) || a.name.localeCompare(b.name));
  }

  const notPlayed = Object.values(sourcePlayers).filter((p) => !(p.games > 0));

  return (
    <div>
      <SectionLabel>Standings</SectionLabel>
      <div style={styles.skillToggle}>
        {STANDINGS_MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            style={styles.skillToggleBtn(standingsMode === m.key)}
            onClick={() => setStandingsMode(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p style={styles.emptyQueue}>
          {standingsMode === "live"
            ? "No one is currently playing on a live court right now."
            : "No completed games yet — standings fill in as matches end."}
        </p>
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
              </span>
              <span style={styles.standingsStatCol}>{p.gp}</span>
              <span style={styles.standingsStatCol}>{p.wins}</span>
              <span style={styles.standingsStatCol}>{p.losses}</span>
              <span style={styles.standingsStatCol}>{Math.round(p.performance.winPct * 100)}%</span>
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

import { useState } from "react";
import { styles } from "../styles.js";

// Searchable, alphabetically-sorted list of replacement candidates — used
// wherever a scorer swaps a player in (live-court substitution, next-matchup
// substitution). `candidates` is { waiting, upcoming } from
// buildReplacementCandidates (lib/utils.js): players already in the waiting
// queue, and players scheduled into a later matchup who haven't started yet
// — real-world Open Play organizers need to pull from either. Rendered as
// two labeled sections so it's always clear where a candidate is coming
// from and, for an upcoming one, which matchup they'd be pulled out of.
// Filters as-you-type by name, case-insensitive, across both sections.
export default function PlayerPicker({ candidates, recommendedIds, selectedId, onSelect, emptyMessage }) {
  const [search, setSearch] = useState("");

  const waiting = candidates?.waiting ?? [];
  const upcoming = candidates?.upcoming ?? [];

  if (waiting.length === 0 && upcoming.length === 0) {
    return <p style={styles.editWarning}>{emptyMessage}</p>;
  }

  const query = search.trim().toLowerCase();
  const sortByName = (a, b) => a.name.localeCompare(b.name);
  const filterByQuery = (p) => !query || p.name.toLowerCase().includes(query);

  // Substitute Recommendation — see PROJECT.md/FEATURES.md. `recommendedIds`
  // (getRecommendedSubstitutes, lib/utils.js) is already priority-ordered
  // (longest-waiting, never-held first) — those appear first, in that
  // order, followed by everyone else alphabetically. A search query still
  // filters across all of them the same as before.
  const recommendedOrder = recommendedIds ?? [];
  const recommendedSet = new Set(recommendedOrder);
  const recommendedWaiting = recommendedOrder
    .map((id) => waiting.find((p) => p.id === id))
    .filter(Boolean)
    .filter(filterByQuery);
  const restWaiting = [...waiting]
    .filter((p) => !recommendedSet.has(p.id))
    .sort(sortByName)
    .filter(filterByQuery);
  const filteredWaiting = [...recommendedWaiting, ...restWaiting];
  const filteredUpcoming = [...upcoming].sort(sortByName).filter(filterByQuery);

  return (
    <div>
      <input
        style={{ ...styles.input, ...styles.playerSearchInput }}
        placeholder="Search players…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {filteredWaiting.length === 0 && filteredUpcoming.length === 0 ? (
        <p style={styles.editWarning}>No players match "{search.trim()}".</p>
      ) : (
        <>
          {filteredWaiting.length > 0 && (
            <>
              <p style={styles.pickerGroupLabel}>Waiting queue</p>
              <div style={styles.editGrid}>
                {filteredWaiting.map((p) => (
                  <button
                    key={p.id}
                    style={{ ...styles.editChip, ...(selectedId === p.id ? styles.editChipA : {}) }}
                    onClick={() => onSelect(p.id)}
                  >
                    <span style={styles.editChipName}>
                      {p.name}
                      {recommendedSet.has(p.id) && <span style={styles.pickerScheduledTag}> (recommended)</span>}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          {filteredUpcoming.length > 0 && (
            <>
              <p style={styles.pickerGroupLabel}>Upcoming matchups</p>
              <div style={styles.editGrid}>
                {filteredUpcoming.map((p) => (
                  <button
                    key={p.id}
                    style={{ ...styles.editChip, ...(selectedId === p.id ? styles.editChipA : {}) }}
                    onClick={() => onSelect(p.id)}
                  >
                    <span style={styles.editChipName}>
                      {p.name}
                      <span style={styles.pickerScheduledTag}>{p.scheduledLabel}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

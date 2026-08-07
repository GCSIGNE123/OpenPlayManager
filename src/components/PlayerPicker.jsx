import { useState } from "react";
import { styles } from "../styles.js";
import { getSubstituteRecommendations } from "../lib/utils.js";
import WaitingTimer from "./WaitingTimer.jsx";

// Searchable, alphabetically-sorted list of replacement candidates — used
// wherever a scorer swaps a player in (live-court substitution, next-matchup
// substitution). `candidates` is { waiting, upcoming } from
// buildReplacementCandidates (lib/utils.js): players already in the waiting
// queue, and players scheduled into a later matchup who haven't started yet
// — real-world Open Play organizers need to pull from either. Rendered as
// two labeled sections so it's always clear where a candidate is coming
// from and, for an upcoming one, which matchup they'd be pulled out of.
// Filters as-you-type by name, case-insensitive, across both sections.
//
// Better Player Substitution — see PROJECT.md/FEATURES.md. `outgoingPlayer`
// (the full player record of whoever's being subbed out, or undefined for
// callers with no substitution context — e.g. Manual Court Assignment's
// slot picker) is used to compute recommendations locally, right here,
// against the waiting pool actually being offered — so the recommendation
// can never disagree with who's really a candidate. Every waiting candidate
// row (recommended or not) also shows Skill, Games Played, and a live
// Waiting Time, informational only — the facilitator always has the final
// decision and can pick anyone else in the list.
export default function PlayerPicker({ candidates, outgoingPlayer, selectedId, onSelect, emptyMessage }) {
  const [search, setSearch] = useState("");

  const waiting = candidates?.waiting ?? [];
  const upcoming = candidates?.upcoming ?? [];

  if (waiting.length === 0 && upcoming.length === 0) {
    return <p style={styles.editWarning}>{emptyMessage}</p>;
  }

  const query = search.trim().toLowerCase();
  const sortByName = (a, b) => a.name.localeCompare(b.name);
  const filterByQuery = (p) => !query || p.name.toLowerCase().includes(query);

  const recommendations = getSubstituteRecommendations(waiting, outgoingPlayer);
  const reasonById = new Map(recommendations.map((r) => [r.id, r.reason]));
  const recommendedOrder = recommendations.map((r) => r.id);
  const recommendedWaiting = recommendedOrder
    .map((id) => waiting.find((p) => p.id === id))
    .filter(Boolean)
    .filter(filterByQuery);
  const restWaiting = [...waiting]
    .filter((p) => !reasonById.has(p.id))
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
                {filteredWaiting.map((p) => {
                  const reason = reasonById.get(p.id);
                  return (
                    <button
                      key={p.id}
                      style={{ ...styles.editChip, ...(selectedId === p.id ? styles.editChipA : {}) }}
                      onClick={() => onSelect(p.id)}
                    >
                      <span style={styles.editChipName}>
                        {p.name}
                        <span style={styles.pickerCandidateMeta}>
                          {p.skill && (
                            <span style={styles.skillTag(p.skill)}>
                              {p.skill === "intermediate" ? "INT" : "BEG"}
                            </span>
                          )}
                          <span style={styles.pickerCandidateStat}>{p.games || 0} games</span>
                          <span style={styles.pickerCandidateStat}>
                            <WaitingTimer player={p} />
                          </span>
                        </span>
                        {reason && (
                          <span style={styles.pickerRecommendedTag}>
                            ⭐⭐ Recommended
                            <span style={styles.pickerRecommendedReason}>{reason}</span>
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
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

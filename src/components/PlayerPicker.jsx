import { useState } from "react";
import { styles } from "../styles.js";
import Avatar from "./Avatar.jsx";

// Searchable, alphabetically-sorted list of players to pick one from — used
// wherever a scorer swaps a player in (live-court substitution, next-matchup
// substitution). Filters as-you-type by name, case-insensitive.
export default function PlayerPicker({ players, selectedId, onSelect, emptyMessage }) {
  const [search, setSearch] = useState("");

  if (players.length === 0) {
    return <p style={styles.editWarning}>{emptyMessage}</p>;
  }

  const query = search.trim().toLowerCase();
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name));
  const filtered = query ? sorted.filter((p) => p.name.toLowerCase().includes(query)) : sorted;

  return (
    <div>
      <input
        style={{ ...styles.input, ...styles.playerSearchInput }}
        placeholder="Search players…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {filtered.length === 0 ? (
        <p style={styles.editWarning}>No players match "{search.trim()}".</p>
      ) : (
        <div style={styles.editGrid}>
          {filtered.map((p) => (
            <button
              key={p.id}
              style={{
                ...styles.editChip,
                ...(selectedId === p.id ? styles.editChipA : {}),
              }}
              onClick={() => onSelect(p.id)}
            >
              <Avatar player={p} size={22} />
              <span style={styles.editChipName}>{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

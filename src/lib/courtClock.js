// Court Play Clock — see FEATURES.md ("Court play clock"). Stamps each court
// with `liveSince` (epoch ms) at the moment its game goes live, so screens
// can show how long a court has been playing (first consumer: the spectator
// page in PickleKing Player). Pure; called once from save(), the single
// place every court change passes through, so none of the half-dozen code
// paths that put a match on court need to know about it.
//
// Rules:
//   - a court that is "live" keeps the stamp it has; it gets a new one when
//     it wasn't live on the previous save, or when it now holds a different
//     game (fewer than 3 of the same players — a single substitution keeps
//     the clock running);
//   - a "finished" court (winner declared, not yet ended) keeps its stamp;
//   - any other court (open, dispatching) has no stamp.
// Returns the SAME array when nothing changed.
const idsOf = (c) => [...(c?.teamA || []), ...(c?.teamB || [])];

export function stampCourtClocks(prevCourts, courts, now = Date.now()) {
  if (!Array.isArray(courts)) return courts;
  const prevByNumber = new Map((Array.isArray(prevCourts) ? prevCourts : []).map((c) => [c.number, c]));
  let changed = false;
  const next = courts.map((c) => {
    const has = typeof c.liveSince === "number";
    if (c.status === "live") {
      const prev = prevByNumber.get(c.number);
      const prevIds = new Set(idsOf(prev));
      const sameGame = prev && (prev.status === "live" || prev.status === "finished") && idsOf(c).filter((id) => prevIds.has(id)).length >= 3;
      if (has && sameGame) return c;
      if (has && !prev) return c; // first save after a reload: trust the stored stamp
      changed = true;
      return { ...c, liveSince: now };
    }
    if (c.status === "finished") return c;
    if (!has && c.liveSince == null) return c;
    changed = true;
    return { ...c, liveSince: null };
  });
  return changed ? next : courts;
}

// Minutes:seconds a court has been in play (null when it has no stamp).
export function courtElapsedText(court, now = Date.now()) {
  if (typeof court?.liveSince !== "number") return null;
  const total = Math.max(0, Math.floor((now - court.liveSince) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

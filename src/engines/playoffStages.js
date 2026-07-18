// Shared "how many teams -> what's this stage called" mapping, used by both
// PoolQualificationService (naming the overall playoff stage a qualifier
// count implies) and the bracket generators (naming each individual round
// by how many teams enter it). Kept as its own tiny module rather than
// living inside either service so neither one "owns" a table the other
// also needs — a genuine shared fact, not scheduling/ranking/seeding logic
// specific to any one of them.
const STAGE_BY_COUNT = {
  2: "Championship Match",
  4: "Semifinals",
  8: "Quarterfinals",
  16: "Round of 16",
};

// Exact lookup only — null if `count` isn't one of the four canonical
// sizes. Callers pick their own fallback, since "what to call an
// unrecognized count" differs by context: a bracket round (always a power
// of two by construction) reads naturally as "Round of N", while an overall
// playoff-stage count (which can be any number — Playoff Qualification's
// "Teams Advancing Per Pool" doesn't have to land on a power of two) reads
// better as "N-Team Playoff".
export function exactStageName(count) {
  return STAGE_BY_COUNT[count] ?? null;
}

// Counts that aren't one of the four called-out sizes still get a usable
// label ("Round of 32") rather than nothing — "future bracket sizes should
// be easy to add" falls out of this for free. Used by bracket round naming,
// where the count is always a power of two.
export function stageNameForCount(count) {
  return exactStageName(count) ?? `Round of ${count}`;
}

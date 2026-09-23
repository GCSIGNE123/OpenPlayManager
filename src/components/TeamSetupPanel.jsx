import { styles } from "../styles.js";

// Custom Doubles Team Assignment — see PROJECT.md/FEATURES.md. UI-ONLY
// feature: this panel introduces no new data model and no tournament-engine
// change. It is a second UI surface over the exact same mutual-partner
// primitive Open Play's Fixed Partner Mode already uses
// (setFixedPartner/clearFixedPartner, lib/queueManagement.js — both reused
// completely unchanged here) — the same one FixedPartnerPanel.jsx already
// exposes mid-session. All this adds is a TEAM-shaped view of that same
// partnerId data, shown at the one place it matters for a tournament: before
// Generate Schedule is clicked.
//
// Why this is enough to "lock" teams at tournament start, with no new
// locking mechanism: lib/tournament.js's buildEntrants/pairIntoTeams reads
// partnerId exactly ONCE, at the moment Generate Schedule runs, and the
// result is frozen into the saved Tournament record (tournament.pools[].
// entrants / tournament.entrants) — nothing ever re-derives entrants from
// players again. So a partner changed here after Generate has already run
// has zero effect on the active tournament; this panel simply isn't shown
// then (TournamentParticipantsView renders the frozen, read-only entrant
// table instead — see its own header comment). The only thing that DOES
// rebuild entrants from current players/partners is the pre-existing,
// separately-labeled "Regenerate schedule" action (TournamentScheduleView),
// which already warns "any results already saved will be lost" — untouched
// by this feature.
//
// Mutual-exclusivity ("a player can't belong to two teams") needs no new
// code either: setFixedPartner's own core (queueManagement.js) already
// detaches any prior partner on both sides before establishing a new link,
// so grouping players by partnerId can never produce overlapping teams.
//
// Team numbering ("Team 1", "Team 2"...) is a purely positional, display-
// only label computed here — never persisted, never sent anywhere. The
// entrant's actual stored label (built by buildEntrants) stays "A / B",
// unchanged, exactly as every pool/bracket/standings/public-viewer consumer
// already expects.
export default function TeamSetupPanel({ players, state, onSetPartner, onClearPartner }) {
  if (!onSetPartner || !onClearPartner) return null;

  const roster = Object.values(players || {})
    .filter((p) => p.checkedIn && p.status !== "CHECKED_OUT")
    .sort((a, b) => a.name.localeCompare(b.name));

  if (roster.length === 0) {
    return <div style={styles.tEmptyState}>Check in players before setting up doubles teams.</div>;
  }

  const byId = new Map(roster.map((p) => [p.id, p]));
  const teams = [];
  const unassigned = [];
  const seen = new Set();
  for (const p of roster) {
    if (seen.has(p.id)) continue;
    const partner = p.partnerId ? byId.get(p.partnerId) : null;
    // Mirrors pairIntoTeams's own re-check (RoundRobinScheduler.js): only a
    // genuinely mutual link counts as a team here, never a one-sided pointer.
    if (partner && partner.partnerId === p.id) {
      teams.push([p, partner]);
      seen.add(p.id);
      seen.add(partner.id);
    } else {
      unassigned.push(p);
      seen.add(p.id);
    }
  }

  const partnerPicker = (p) => (
    <select
      style={styles.tPartnerSelect}
      value={p.partnerId || ""}
      onChange={(e) => (e.target.value ? onSetPartner(p.id, e.target.value) : onClearPartner(p.id))}
      title="Set this player's doubles partner for the upcoming tournament schedule."
    >
      <option value="">+ Partner</option>
      {roster
        .filter((other) => other.id !== p.id)
        .map((other) => (
          <option key={other.id} value={other.id}>
            {other.name}
          </option>
        ))}
    </select>
  );

  return (
    <div>
      <h2 style={styles.tSectionHeading}>Team Setup — doubles ({roster.length} checked in)</h2>
      <p style={styles.tControlHint}>
        Pick each team's two players below. Teams are locked in the moment you click Generate Schedule — changing a
        partner afterward never alters an already-generated tournament.
      </p>

      {teams.length > 0 && (
        <>
          <p style={styles.tFieldLabel}>Teams ({teams.length})</p>
          <ul style={styles.rosterList}>
            {teams.map(([a, b], i) => (
              <li key={a.id} style={styles.tRosterRow}>
                <span style={{ ...styles.tQueueName, ...styles.tTeamNameProminent }}>
                  Team {i + 1}: {a.name} + {b.name}
                </span>
                <button type="button" style={styles.tActionBtn} onClick={() => onClearPartner(a.id)}>
                  Clear
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <p style={styles.tFieldLabel}>Unassigned Players ({unassigned.length})</p>
      {unassigned.length === 0 ? (
        <p style={styles.tControlHint}>Every checked-in player is on a team.</p>
      ) : (
        <ul style={styles.rosterList}>
          {unassigned.map((p) => (
            <li key={p.id} style={styles.tRosterRow}>
              <span style={{ ...styles.tQueueName, ...styles.tTeamNameProminent }}>{p.name}</span>
              {partnerPicker(p)}
            </li>
          ))}
        </ul>
      )}

      {unassigned.length > 0 && unassigned.length % 2 !== 0 && (
        <p style={styles.tWarningText}>
          {unassigned.length} unassigned player{unassigned.length === 1 ? "" : "s"} — an odd one out will be paired
          automatically when you generate the schedule.
        </p>
      )}
    </div>
  );
}

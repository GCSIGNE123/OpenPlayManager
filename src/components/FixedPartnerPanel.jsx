import { styles } from "../styles.js";
import { getPlayerQueueStatus } from "../lib/utils.js";
import SectionLabel from "./SectionLabel.jsx";

// Fixed Partner — mid-session — see PROJECT.md/FEATURES.md and
// lib/queueManagement.js's setFixedPartner/clearFixedPartner (both reused
// completely unchanged here — this is a second UI SURFACE for the same
// existing action, never a second partner system/data model).
//
// WaitingPlayersPanel already exposes the same select-based partner control,
// but only for `unassignedPlayers` — a player currently on a live/dispatching
// court, or already locked into an upcoming matchup, is never in that list,
// so the organizer had no way to set/clear their partner. This panel lists
// EVERY checked-in, not-checked-out player (regardless of PLAYING/HELD/
// UPCOMING/WAITING status, via the same getPlayerQueueStatus taxonomy
// WaitingPlayersPanel/Standings already use) with that identical control.
//
// Semantics — unchanged from the existing pure functions, confirmed by
// inspection: setting/clearing a partner here only ever affects FUTURE
// matchmaking (BalancedRotationEngine.extractFixedPartnerTeams reads
// partnerId fresh from the waiting pool every time matchups are generated).
// It never touches courts, nextMatchups, queueIds, or matchHistory — a
// currently-playing player's live match and an already-built next matchup
// are completely unaffected by a partner change made here.
export default function FixedPartnerPanel({ players, state, onSetPartner, onClearPartner }) {
  if (!onSetPartner || !onClearPartner) return null;
  const roster = Object.values(players || {})
    .filter((p) => p.checkedIn && p.status !== "CHECKED_OUT")
    .sort((a, b) => a.name.localeCompare(b.name));
  if (roster.length === 0) return null;

  return (
    <>
      <SectionLabel>Fixed Partner — all checked-in players ({roster.length})</SectionLabel>
      <ul style={styles.rosterList}>
        {roster.map((p) => {
          const queueStatus = getPlayerQueueStatus(p, state);
          return (
            <li key={p.id} style={styles.rosterItem}>
              <span style={{ ...styles.queueName, ...styles.teamNameProminent }}>{p.name}</span>
              <span style={styles.queueStatusTag(queueStatus)}>{queueStatus}</span>
              <select
                style={styles.partnerSelect}
                value={p.partnerId || ""}
                onChange={(e) => (e.target.value ? onSetPartner(p.id, e.target.value) : onClearPartner(p.id))}
                title="Fixed partner — always teamed together once both are eligible for future matchmaking. Never affects a match already playing or already built as a next matchup."
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
            </li>
          );
        })}
      </ul>
    </>
  );
}

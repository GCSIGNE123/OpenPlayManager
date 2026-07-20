// Manual Qualification Override audit trail storage — see PROJECT.md. One
// growing array per tournament (opl-qualaudit-{tournamentId}), the same
// "array embedded in one owner record" shape RatingHistory/matchHistory
// already use, avoiding a KV key explosion for a tournament with many
// overrides. Deliberately separate from the Tournament record itself
// (tournament.manualOverrides is the current/live delta the qualification
// engine applies; this is the permanent, append-only history of every
// change that ever produced it) — an audit trail that lived inside the
// tournament record could be edited or lost on a reopen/rewrite, which
// defeats the point of an audit trail.
import { uid } from "./random.js";
import { QUALIFICATION_AUDIT_PREFIX } from "./constants.js";

// entry = {
//   id, timestamp (ms epoch), director (free-text name — this app has no
//   per-user login for tournament directors, see PROJECT.md), action
//   ('promote' | 'eliminate' | 'replace' | 'reset'), reason (required for
//   promote/eliminate/replace; a fixed string for reset), previousState
//   (the participant's qualificationStatus before this change),
//   newState (after), participantLabel, participantId
// }
export function makeAuditEntry({ director, action, reason, previousState, newState, participantId, participantLabel }) {
  return {
    id: uid(),
    timestamp: Date.now(),
    director,
    action,
    reason,
    previousState,
    newState,
    participantId,
    participantLabel,
  };
}

export async function fetchAuditHistory(tournamentId) {
  try {
    const res = await window.storage.get(`${QUALIFICATION_AUDIT_PREFIX}${tournamentId}`, true);
    return JSON.parse(res.value);
  } catch (e) {
    return [];
  }
}

export async function appendAuditEntry(tournamentId, entry) {
  const history = await fetchAuditHistory(tournamentId);
  const next = [...history, entry];
  await window.storage.set(`${QUALIFICATION_AUDIT_PREFIX}${tournamentId}`, JSON.stringify(next), true);
  return next;
}

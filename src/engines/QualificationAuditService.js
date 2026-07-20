// Manual Qualification Override — see PROJECT.md. Thin wrapper over
// lib/qualificationAuditModel.js's storage functions, matching the spec's
// requested architecture (recordOverride()/getAuditHistory()) — kept
// separate from PoolQualificationService itself since audit logging is a
// distinct concern (persistence + history) from qualification computation
// (pure derivation), the same "engine vs. lib storage" split
// RatingEngine/lib/ratingModel.js already establishes.
import { makeAuditEntry, fetchAuditHistory, appendAuditEntry } from "../lib/qualificationAuditModel.js";

export class QualificationAuditService {
  // Builds and persists one audit entry. Returns the entry itself (not the
  // whole history) — callers that want the full log call getAuditHistory()
  // separately, same "the write returns what changed, not a re-fetch"
  // shape saveTournament's own callers already follow.
  async recordOverride(tournamentId, { director, action, reason, previousState, newState, participantId, participantLabel }) {
    const entry = makeAuditEntry({ director, action, reason, previousState, newState, participantId, participantLabel });
    await appendAuditEntry(tournamentId, entry);
    return entry;
  }

  async getAuditHistory(tournamentId) {
    return fetchAuditHistory(tournamentId);
  }
}

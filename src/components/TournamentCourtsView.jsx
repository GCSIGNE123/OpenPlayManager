import { useState } from "react";
import { Play, Plus, X } from "lucide-react";
import { styles } from "../styles.js";
import { CourtAssignmentService } from "../engines/CourtAssignmentService.js";
import SectionLabel from "./SectionLabel.jsx";

const courtAssignmentService = new CourtAssignmentService();

const STATUS_LABELS = { pending: "Pending", inProgress: "In Progress", completed: "Completed" };

function matchupLabel(match) {
  return `${match.teamA.label} vs ${match.teamB.label}`;
}

// One court's card on the Court Board — Court Name / Current Match / Match
// Status / (if free) the next queued match as "up next." No estimated
// time — just which match would go next, per spec ("Estimated Next Match"
// isn't a duration estimate, Estimated Match Duration is explicitly out of
// scope).
function CourtCard({ court, availableCourts, queue, onAssign, onRelease, onReassign, onStartMatch, onSetStatus, onRemove }) {
  const [reassignTo, setReassignTo] = useState("");

  const nextUp = queue[0];
  const otherAvailable = availableCourts.filter((c) => c.number !== court.number);

  return (
    <div style={styles.courtCard(court.derivedStatus)}>
      <div style={styles.courtCardHead}>
        <span style={styles.courtCardName}>{court.name}</span>
        <span style={styles.courtStatusBadge(court.derivedStatus)}>{court.derivedStatus}</span>
      </div>

      {court.currentMatch ? (
        <>
          <div style={styles.historyTeamLine}>
            <span>{matchupLabel(court.currentMatch)}</span>
            <span style={styles.matchStatusBadge(court.currentMatch.status)}>{STATUS_LABELS[court.currentMatch.status]}</span>
          </div>
          <div style={styles.editActions}>
            {court.currentMatch.status === "pending" && (
              <button type="button" style={styles.secondaryBtn} onClick={() => onStartMatch(court.currentMatch)}>
                <Play size={13} strokeWidth={2.5} />
                Start match
              </button>
            )}
            <button type="button" style={styles.secondaryBtn} onClick={() => onRelease(court.number)}>
              <X size={13} strokeWidth={2.5} />
              Release
            </button>
          </div>
          {otherAvailable.length > 0 && (
            <div style={styles.editActions}>
              <select style={styles.courtSelect} value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                <option value="">Reassign to…</option>
                {otherAvailable.map((c) => (
                  <option key={c.id} value={c.number}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                style={styles.secondaryBtn}
                disabled={!reassignTo}
                onClick={() => {
                  onReassign(court.currentMatch.id, court.number, Number(reassignTo));
                  setReassignTo("");
                }}
              >
                Move
              </button>
            </div>
          )}
        </>
      ) : court.status === "maintenance" ? (
        <p style={styles.bracketTbdLabel}>Under maintenance</p>
      ) : (
        <p style={styles.bracketTbdLabel}>{nextUp ? `Up next: ${matchupLabel(nextUp.match)}` : "No matches waiting"}</p>
      )}

      <div style={styles.editActions}>
        {court.status === "maintenance" ? (
          <button type="button" style={styles.secondaryBtn} onClick={() => onSetStatus(court.id, "available")}>
            Mark available
          </button>
        ) : (
          !court.currentMatch && (
            <button type="button" style={styles.secondaryBtn} onClick={() => onSetStatus(court.id, "maintenance")}>
              Mark maintenance
            </button>
          )
        )}
        {!court.currentMatch && (
          <button type="button" style={styles.secondaryBtn} onClick={() => onRemove(court.id)}>
            Remove court
          </button>
        )}
      </div>
    </div>
  );
}

function QueueRow({ entry, availableCourts, onAssign }) {
  const [courtNumber, setCourtNumber] = useState("");
  return (
    <li style={styles.queueListItem}>
      <span>
        <span style={styles.queueMatchup}>{matchupLabel(entry.match)}</span>
        <span style={styles.queueSourceTag}>{entry.sourceLabel}</span>
      </span>
      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select style={styles.courtSelect} value={courtNumber} onChange={(e) => setCourtNumber(e.target.value)}>
          <option value="">Assign to…</option>
          {availableCourts.map((c) => (
            <option key={c.id} value={c.number}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          style={styles.secondaryBtn}
          disabled={!courtNumber}
          onClick={() => {
            onAssign(entry.match.id, Number(courtNumber));
            setCourtNumber("");
          }}
        >
          Assign
        </button>
      </span>
    </li>
  );
}

// Courts tab — see PROJECT.md's Tournament Court Assignment & Match Queue
// section. Everything here is either persisted court metadata
// (tournament.courts) or pure derived data recomputed from it +
// tournament.pools/tournament.bracket on every render via
// CourtAssignmentService.refreshQueue — the Court Board "refreshes
// automatically" for free, same as every other live view in this app.
export default function TournamentCourtsView({
  tournament,
  loading,
  courtError,
  onAssignMatch,
  onReleaseCourt,
  onReassignMatch,
  onAddCourt,
  onRemoveCourt,
  onSetCourtStatus,
  onStartPoolMatch,
  onStartPlayoffMatch,
}) {
  const [newCourtName, setNewCourtName] = useState("");

  if (loading) return <p style={styles.editHint}>Loading tournament…</p>;
  if (!tournament) {
    return <div style={styles.placeholderCard}>Generate a schedule from the Schedule tab to manage courts here.</div>;
  }

  const { courts, queue } = courtAssignmentService.refreshQueue(tournament);
  const availableCourts = courtAssignmentService.getAvailableCourts(tournament);

  const handleStartMatch = (entryOrMatch) => {
    // court.currentMatch doesn't carry its own `source`, so match id
    // membership in tournament.bracket's matches is the simplest reliable
    // check — cheaper than threading source through refreshQueue's shape.
    const isPlayoffMatch = tournament.bracket?.rounds.some((r) => r.matches.some((m) => m.id === entryOrMatch.id));
    if (isPlayoffMatch) onStartPlayoffMatch(entryOrMatch.id);
    else onStartPoolMatch(entryOrMatch.id);
  };

  return (
    <div>
      <SectionLabel>Courts</SectionLabel>
      {courtError && <p style={styles.editWarning}>{courtError}</p>}

      <div style={{ ...styles.editActions, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="New court name (e.g. Championship Court)"
          style={styles.courtNameInput}
          value={newCourtName}
          onChange={(e) => setNewCourtName(e.target.value)}
        />
        <button
          type="button"
          style={styles.primaryBtn}
          onClick={() => {
            onAddCourt(newCourtName.trim() || undefined);
            setNewCourtName("");
          }}
        >
          <Plus size={14} strokeWidth={2.5} />
          Add court
        </button>
      </div>

      <div style={styles.courtCardsGrid}>
        {courts.map((court) => (
          <CourtCard
            key={court.id}
            court={court}
            availableCourts={availableCourts}
            queue={queue}
            onAssign={onAssignMatch}
            onRelease={onReleaseCourt}
            onReassign={onReassignMatch}
            onStartMatch={handleStartMatch}
            onSetStatus={onSetCourtStatus}
            onRemove={onRemoveCourt}
          />
        ))}
      </div>

      <h3 style={styles.poolHeading}>Match Queue</h3>
      {queue.length === 0 ? (
        <p style={styles.bracketTbdLabel}>No matches are waiting for a court right now.</p>
      ) : (
        <ul style={styles.qualifiersList}>
          {queue.map((entry) => (
            <QueueRow key={entry.match.id} entry={entry} availableCourts={availableCourts} onAssign={onAssignMatch} />
          ))}
        </ul>
      )}
    </div>
  );
}

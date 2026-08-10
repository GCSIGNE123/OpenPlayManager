import { useState } from "react";
import { Play, Plus, Minus, X, ArrowLeftRight, Pause, PlayCircle, Pin, PinOff, Megaphone, Trophy, CheckCircle2, Star } from "lucide-react";
import { styles } from "../styles.js";
import { CourtAssignmentService } from "../engines/CourtAssignmentService.js";
import { CourtQueueService } from "../engines/CourtQueueService.js";
import SectionLabel from "./SectionLabel.jsx";

const courtAssignmentService = new CourtAssignmentService();
const courtQueueService = new CourtQueueService();

const STATUS_LABELS = { pending: "Pending", inProgress: "In Progress", completed: "Completed" };

function matchupLabel(match) {
  return `${match.teamA.label} vs ${match.teamB.label}`;
}

function formatElapsed(startedAt) {
  if (!startedAt) return "—";
  const minutes = Math.max(0, Math.round((Date.now() - startedAt) / 60000));
  return `${minutes}m`;
}

// One court's card on the Court Board — Court / Current Match / Next Match /
// Status / Time Running / Estimated Finish, per the Court Assignment &
// Match Queue Engine spec. Time Running/Estimated Finish read off
// match.startedAt (new this task, see lib/tournamentModel.js) — "—" for a
// match started before that field existed, or not yet started at all.
function CourtCard({ court, availableCourts, queue, onAssign, onRelease, onReassign, onSwap, onStartMatch, onSetStatus, onRemove, onReannounce, onAdjustScore, onDeclareWinner, onEndMatch, assumedDurationMinutes }) {
  const [reassignTo, setReassignTo] = useState("");
  const [swapWith, setSwapWith] = useState("");

  const nextUp = queue[0];
  const otherAvailable = availableCourts.filter((c) => c.number !== court.number);
  const current = court.currentMatch;
  const estimatedFinishLabel = current?.startedAt
    ? new Date(current.startedAt + assumedDurationMinutes * 60000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "—";

  return (
    <div style={styles.courtCard(court.derivedStatus)}>
      <div style={styles.courtCardHead}>
        <span style={styles.courtCardName}>{court.name}</span>
        <span style={styles.courtStatusBadge(court.derivedStatus)}>{court.derivedStatus}</span>
      </div>

      {current ? (
        <>
          <div style={styles.historyTeamLine}>
            <span>{matchupLabel(current)}</span>
            <span style={styles.matchStatusBadge(current.status)}>{STATUS_LABELS[current.status]}</span>
          </div>
          {current.status === "inProgress" && (
            <p style={styles.editHint}>
              Running: {formatElapsed(current.startedAt)} · Est. finish: {estimatedFinishLabel}
            </p>
          )}
          {current.status === "inProgress" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={styles.scoreControl}>
                  <button type="button" style={styles.scoreBtn} onClick={() => onAdjustScore(current.id, "teamA", -1)} aria-label="decrease Team A score">
                    <Minus size={14} strokeWidth={3} />
                  </button>
                  <span style={styles.scoreDigit}>{current.score?.teamA ?? 0}</span>
                  <button type="button" style={styles.scoreBtn} onClick={() => onAdjustScore(current.id, "teamA", 1)} aria-label="increase Team A score">
                    <Plus size={14} strokeWidth={3} />
                  </button>
                </div>
                <button
                  type="button"
                  style={styles.declareWinnerBtn}
                  onClick={() => onDeclareWinner(current.id, "teamA")}
                  title="Skip point-by-point scoring — mark Team A the winner, 11-0"
                >
                  <Trophy size={12} strokeWidth={2.5} />
                  Won
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={styles.scoreControl}>
                  <button type="button" style={styles.scoreBtn} onClick={() => onAdjustScore(current.id, "teamB", -1)} aria-label="decrease Team B score">
                    <Minus size={14} strokeWidth={3} />
                  </button>
                  <span style={styles.scoreDigit}>{current.score?.teamB ?? 0}</span>
                  <button type="button" style={styles.scoreBtn} onClick={() => onAdjustScore(current.id, "teamB", 1)} aria-label="increase Team B score">
                    <Plus size={14} strokeWidth={3} />
                  </button>
                </div>
                <button
                  type="button"
                  style={styles.declareWinnerBtn}
                  onClick={() => onDeclareWinner(current.id, "teamB")}
                  title="Skip point-by-point scoring — mark Team B the winner, 11-0"
                >
                  <Trophy size={12} strokeWidth={2.5} />
                  Won
                </button>
              </div>
            </div>
          )}
          <p style={styles.bracketTbdLabel}>{nextUp ? `Next: ${matchupLabel(nextUp.match)}` : "No match waiting next"}</p>
          {current.status === "pending" && (
            <div style={styles.editActions}>
              <button type="button" style={{ ...styles.secondaryBtn, flex: 1 }} onClick={() => onStartMatch(current)}>
                <Play size={13} strokeWidth={2.5} />
                Start match
              </button>
            </div>
          )}
          {current.status === "inProgress" && (
            <div style={{ ...styles.editActions, marginBottom: 0 }}>
              <button type="button" style={styles.endMatchBtn} onClick={() => onEndMatch(current.id)}>
                <CheckCircle2 size={13} strokeWidth={2.5} />
                End Match
              </button>
            </div>
          )}
          <div style={{ ...styles.editActions, flexWrap: "wrap" }}>
            <button type="button" style={styles.secondaryBtn} onClick={() => onReannounce(current.id, court.number)}>
              <Megaphone size={13} strokeWidth={2.5} />
              Re-announce
            </button>
          </div>
          {otherAvailable.length > 0 && (
            <div style={{ ...styles.editActions, flexWrap: "wrap" }}>
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
                  onReassign(current.id, court.number, Number(reassignTo));
                  setReassignTo("");
                }}
              >
                Move
              </button>
            </div>
          )}
          <div style={{ ...styles.editActions, flexWrap: "wrap" }}>
            <select style={styles.courtSelect} value={swapWith} onChange={(e) => setSwapWith(e.target.value)}>
              <option value="">Swap with…</option>
              {queue.allOccupiedCourts
                ?.filter((c) => c.number !== court.number)
                .map((c) => (
                  <option key={c.id} value={c.number}>
                    {c.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              style={styles.secondaryBtn}
              disabled={!swapWith}
              onClick={() => {
                onSwap(court.number, Number(swapWith));
                setSwapWith("");
              }}
            >
              <ArrowLeftRight size={13} strokeWidth={2.5} />
              Swap
            </button>
          </div>
        </>
      ) : court.status === "maintenance" ? (
        <p style={styles.bracketTbdLabel}>Under maintenance</p>
      ) : court.status === "disabled" ? (
        <p style={styles.bracketTbdLabel}>Disabled — out of rotation</p>
      ) : (
        <p style={styles.bracketTbdLabel}>{nextUp ? `Up next: ${matchupLabel(nextUp.match)}` : "No matches waiting"}</p>
      )}

      <div style={styles.editActions}>
        {court.status === "available" && !current && (
          <>
            <button type="button" style={styles.secondaryBtn} onClick={() => onSetStatus(court.id, "maintenance")}>
              Mark maintenance
            </button>
            <button type="button" style={styles.secondaryBtn} onClick={() => onSetStatus(court.id, "disabled")}>
              Disable
            </button>
          </>
        )}
        {(court.status === "maintenance" || court.status === "disabled") && (
          <button type="button" style={styles.secondaryBtn} onClick={() => onSetStatus(court.id, "available")}>
            Mark available
          </button>
        )}
        {!current && (
          <button type="button" style={styles.secondaryBtn} onClick={() => onRemove(court.id)}>
            Remove court
          </button>
        )}
      </div>
    </div>
  );
}

// One Match Queue row — enriched with Queue Position/Match Type/Priority/
// Estimated Wait (see CourtQueueService.getQueue), plus manual-override
// Delay/Pin actions.
function QueueRow({ entry, availableCourts, onAssign, onDelay, onUndelay, onPin, onUnpin, isNextMatch, onSetNextMatch }) {
  const [courtNumber, setCourtNumber] = useState("");
  const delayed = entry.match.queueOverride?.delayed;
  const pinnedCourt = entry.match.queueOverride?.pinnedCourt;

  return (
    <li style={styles.queueListItem}>
      <span>
        <span style={styles.queueNum}>#{entry.queuePosition}</span>{" "}
        <span style={styles.queueMatchup}>{matchupLabel(entry.match)}</span>
        <span style={styles.queueSourceTag}>{entry.matchType}</span>
        <span style={styles.queueSourceTag}>~{entry.estimatedWaitMinutes}m wait</span>
        {delayed && <span style={styles.queueSourceTag}>DELAYED</span>}
        {pinnedCourt != null && <span style={styles.queueSourceTag}>PINNED: Court {pinnedCourt}</span>}
        {isNextMatch && (
          <span style={{ ...styles.courtBadge, background: "var(--ball)" }}>
            <Star size={11} strokeWidth={2.5} style={{ verticalAlign: "-1px", marginRight: 3 }} />
            NEXT MATCH
          </span>
        )}
      </span>
      <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {!isNextMatch && (
          <button type="button" style={styles.secondaryBtn} onClick={() => onSetNextMatch(entry.match.id)}>
            <Star size={13} strokeWidth={2.5} />
            Set as Next Match
          </button>
        )}
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
        <button type="button" style={styles.secondaryBtn} onClick={() => (delayed ? onUndelay(entry.match.id) : onDelay(entry.match.id))}>
          {delayed ? <PlayCircle size={13} strokeWidth={2.5} /> : <Pause size={13} strokeWidth={2.5} />}
          {delayed ? "Undelay" : "Delay"}
        </button>
        {pinnedCourt != null ? (
          <button type="button" style={styles.secondaryBtn} onClick={() => onUnpin(entry.match.id)}>
            <PinOff size={13} strokeWidth={2.5} />
            Unpin
          </button>
        ) : (
          <select
            style={styles.courtSelect}
            value=""
            onChange={(e) => e.target.value && onPin(entry.match.id, Number(e.target.value))}
          >
            <option value="">Pin to…</option>
            {availableCourts.map((c) => (
              <option key={c.id} value={c.number}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </span>
    </li>
  );
}

// Courts tab — see PROJECT.md's Court Assignment & Match Queue Engine
// section. Courts (tournament.courts) and the Match Queue are both pure
// derived data, recomputed fresh from tournament.pools/tournament.bracket
// on every render via CourtAssignmentService.refreshQueue +
// CourtQueueService.getQueue — the Court Board and Queue "refresh
// automatically" for free, same as every other live view in this app.
// Auto-assignment itself (filling a freed court automatically) happens
// server-side in lib/tournament.js's saveMatchResult/saveCourtRelease —
// this view just reflects whatever CourtAssignmentEngine already decided.
export default function TournamentCourtsView({
  tournament,
  loading,
  courtError,
  onAssignMatch,
  onReleaseCourt,
  onReassignMatch,
  onSwapCourts,
  onDelayMatch,
  onUndelayMatch,
  onPinMatch,
  onUnpinMatch,
  onAddCourt,
  onRemoveCourt,
  onSetCourtStatus,
  onStartPoolMatch,
  onStartPlayoffMatch,
  onReannounce,
  onAdjustScore,
  onDeclareWinner,
  onEndMatch,
  nextMatchId,
  onSetNextMatch,
}) {
  const [newCourtName, setNewCourtName] = useState("");

  if (loading) return <p style={styles.editHint}>Loading tournament…</p>;
  if (!tournament) {
    return <div style={styles.placeholderCard}>Generate a schedule from the Schedule tab to manage courts here.</div>;
  }

  const { courts } = courtAssignmentService.refreshQueue(tournament);
  const availableCourts = courtAssignmentService.getAvailableCourts(tournament);
  const queue = courtQueueService.getQueue(tournament);
  const occupiedCourts = courts.filter((c) => c.currentMatch);
  const queueWithOccupied = Object.assign(queue, { allOccupiedCourts: occupiedCourts });

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
            queue={queueWithOccupied}
            onAssign={onAssignMatch}
            onRelease={onReleaseCourt}
            onReassign={onReassignMatch}
            onSwap={onSwapCourts}
            onStartMatch={handleStartMatch}
            onSetStatus={onSetCourtStatus}
            onRemove={onRemoveCourt}
            onReannounce={onReannounce}
            onAdjustScore={onAdjustScore}
            onDeclareWinner={onDeclareWinner}
            onEndMatch={onEndMatch}
            assumedDurationMinutes={20}
          />
        ))}
      </div>

      <h3 style={styles.poolHeading}>Match Queue</h3>
      {queue.length === 0 ? (
        <p style={styles.bracketTbdLabel}>No matches are waiting for a court right now.</p>
      ) : (
        <ul style={styles.qualifiersList}>
          {queue.map((entry) => (
            <QueueRow
              key={entry.match.id}
              entry={entry}
              availableCourts={availableCourts}
              onAssign={onAssignMatch}
              onDelay={onDelayMatch}
              onUndelay={onUndelayMatch}
              onPin={onPinMatch}
              onUnpin={onUnpinMatch}
              isNextMatch={entry.match.id === nextMatchId}
              onSetNextMatch={onSetNextMatch}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

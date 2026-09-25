import { useState } from "react";
import { Play, Plus, Minus, X, ArrowLeftRight, Pause, PlayCircle, Pin, PinOff, Megaphone, Trophy, CheckCircle2, Star, RefreshCw, Clock } from "lucide-react";
import { styles } from "../styles.js";
import { CourtAssignmentService, collectMatches } from "../engines/CourtAssignmentService.js";
import { CourtQueueService } from "../engines/CourtQueueService.js";
import { courtDisplayName } from "../lib/utils.js";

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

// Tournament Manager visual redesign, Stage 1 — see PROJECT.md/FEATURES.md.
// Sidebar status for one court, LIVE / UP NEXT / EMPTY — purely a display
// bucketing of the SAME `court.derivedStatus`/`currentMatch.status` data
// CourtCard already reads; no new state, no new rule.
function courtSidebarStatus(court) {
  if (court.derivedStatus === "maintenance" || court.derivedStatus === "disabled") return "empty";
  if (!court.currentMatch) return "empty";
  return court.currentMatch.status === "inProgress" ? "live" : "upNext";
}
const SIDEBAR_STATUS_LABEL = { live: "LIVE", upNext: "UP NEXT", empty: "EMPTY" };

// One compact row in the left Courts sidebar — click to select which
// court's full detail (CourtCard below) shows in the main panel. Purely a
// local UI focus concern (selectedCourtId lives in the outer component's
// own useState); no tournament data changes, no new engine calls.
function CourtListItem({ court, selected, onSelect, divisionLabel }) {
  const status = courtSidebarStatus(court);
  const current = court.currentMatch;
  return (
    <button type="button" style={styles.tCourtListItem(selected)} onClick={onSelect}>
      <div style={styles.tCourtListHead}>
        <span style={styles.tCourtListName}>{courtDisplayName(court)}</span>
        <span style={styles.tCourtStatusPill(status)}>{SIDEBAR_STATUS_LABEL[status]}</span>
      </div>
      {current ? (
        <>
          <div style={styles.tCourtListMatchup}>{matchupLabel(current)}</div>
          {divisionLabel && <div style={styles.tCourtListMeta}>{divisionLabel}</div>}
        </>
      ) : (
        <div style={styles.tCourtListMeta}>{court.derivedStatus === "maintenance" ? "Under maintenance" : court.derivedStatus === "disabled" ? "Disabled" : "No match scheduled"}</div>
      )}
    </button>
  );
}

// The selected court's full detail — Match header (court/LIVE/division/
// round/timer/End Match), team score cards (SERVING/RECEIVING, score,
// Won), Server panel (1st/2nd Serve), Switch Serve (Side Out/Change
// Serve), Score History, Current Rotation, then the existing
// reassign/swap/maintenance/remove controls unchanged. Every prop/handler
// here is the exact same one this component already had — restyled only.
function CourtCard({ court, availableCourts, queue, onAssign, onRelease, onReassign, onSwap, onStartMatch, onSetStatus, onRemove, onReannounce, onAdjustScore, onDeclareWinner, onSetServeNumber, onChangeServe, onSideOut, onEndMatch, assumedDurationMinutes, divisionLabel }) {
  const [reassignTo, setReassignTo] = useState("");
  const [swapWith, setSwapWith] = useState("");

  const nextUp = queue[0];
  const otherAvailable = availableCourts.filter((c) => c.number !== court.number);
  const current = court.currentMatch;
  const estimatedFinishLabel = current?.startedAt
    ? new Date(current.startedAt + assumedDurationMinutes * 60000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "—";

  const isLive = current?.status === "inProgress";
  const servingTeam = current?.serve?.team ?? "teamA";
  const serveNumber = current?.serve?.number ?? 2;

  return (
    <div>
      <div style={styles.tMatchHeader}>
        <div style={styles.tMatchHeaderLeft}>
          <h3 style={styles.tMatchHeaderCourt}>{courtDisplayName(court)}</h3>
          <span style={styles.tLivePill(isLive)}>
            {isLive
              ? "● LIVE"
              : court.derivedStatus === "maintenance"
                ? "MAINTENANCE"
                : court.derivedStatus === "disabled"
                  ? "DISABLED"
                  : current
                    ? STATUS_LABELS[current.status]
                    : "EMPTY"}
          </span>
          {current && (
            <span style={styles.tMatchHeaderMeta}>
              {divisionLabel ? `${divisionLabel} · ` : ""}
              {current.matchNumber ? `Match #${current.matchNumber}` : `Round ${current.round}`}
            </span>
          )}
        </div>
        <div style={styles.tMatchHeaderLeft}>
          {isLive && (
            <span style={styles.tTimerPill}>
              <Clock size={13} strokeWidth={2.5} />
              {formatElapsed(current.startedAt)} · Est. {estimatedFinishLabel}
            </span>
          )}
          {isLive && (
            <button type="button" style={styles.tEndMatchBtn} onClick={() => onEndMatch(current.id)}>
              <CheckCircle2 size={14} strokeWidth={2.5} />
              End Match
            </button>
          )}
        </div>
      </div>

      {current ? (
        <>
          {isLive && (
            <>
              <div style={styles.tTeamCards}>
                <div style={styles.tTeamCard(servingTeam === "teamA")}>
                  <div style={styles.tTeamCardHead}>
                    <span style={styles.tTeamName}>{current.teamA.label}</span>
                    <span style={styles.tServeStatePill(servingTeam === "teamA")}>{servingTeam === "teamA" ? "SERVING" : "RECEIVING"}</span>
                  </div>
                  <div style={styles.tTeamScoreRow}>
                    <span style={styles.tScoreDigit}>{current.score?.teamA ?? 0}</span>
                    <div style={styles.tScoreBtnRow}>
                      <button type="button" style={styles.tScoreBtn} onClick={() => onAdjustScore(current.id, "teamA", -1)} aria-label="decrease Team A score">
                        <Minus size={14} strokeWidth={3} />
                      </button>
                      <button type="button" style={styles.tScoreBtn} onClick={() => onAdjustScore(current.id, "teamA", 1)} aria-label="increase Team A score">
                        <Plus size={14} strokeWidth={3} />
                      </button>
                    </div>
                  </div>
                  <button type="button" style={styles.tWonBtn} onClick={() => onDeclareWinner(current.id, "teamA")} title="Skip point-by-point scoring — mark Team A the winner, 11-0">
                    <Trophy size={11} strokeWidth={2.5} />
                    Won
                  </button>
                </div>
                <div style={styles.tTeamCard(servingTeam === "teamB")}>
                  <div style={styles.tTeamCardHead}>
                    <span style={styles.tTeamName}>{current.teamB.label}</span>
                    <span style={styles.tServeStatePill(servingTeam === "teamB")}>{servingTeam === "teamB" ? "SERVING" : "RECEIVING"}</span>
                  </div>
                  <div style={styles.tTeamScoreRow}>
                    <span style={styles.tScoreDigit}>{current.score?.teamB ?? 0}</span>
                    <div style={styles.tScoreBtnRow}>
                      <button type="button" style={styles.tScoreBtn} onClick={() => onAdjustScore(current.id, "teamB", -1)} aria-label="decrease Team B score">
                        <Minus size={14} strokeWidth={3} />
                      </button>
                      <button type="button" style={styles.tScoreBtn} onClick={() => onAdjustScore(current.id, "teamB", 1)} aria-label="increase Team B score">
                        <Plus size={14} strokeWidth={3} />
                      </button>
                    </div>
                  </div>
                  <button type="button" style={styles.tWonBtn} onClick={() => onDeclareWinner(current.id, "teamB")} title="Skip point-by-point scoring — mark Team B the winner, 11-0">
                    <Trophy size={11} strokeWidth={2.5} />
                    Won
                  </button>
                </div>
              </div>

              {/* Tournament Scorer — 1st Serve / 2nd Serve. Manual,
                  scorer-controlled: never touches score, never gates the
                  +/- buttons above. Same setServeNumber/changeServe/sideOut
                  calls as before — restyled only, see
                  engines/CourtAssignmentService.js. */}
              <div style={styles.tControlsRow}>
                <div style={styles.tControlCard}>
                  <div style={styles.tControlLabel}>Server</div>
                  <div style={styles.tToggleRow}>
                    <button type="button" style={styles.tToggleBtn(serveNumber === 1)} onClick={() => onSetServeNumber(current.id, 1)}>
                      1st Serve
                    </button>
                    <button type="button" style={styles.tToggleBtn(serveNumber === 2)} onClick={() => onSetServeNumber(current.id, 2)}>
                      2nd Serve
                    </button>
                  </div>
                  <p style={styles.tControlHint}>Toggle when the serve changes hands.</p>
                </div>
                <div style={styles.tControlCard}>
                  <div style={styles.tControlLabel}>
                    <ArrowLeftRight size={13} strokeWidth={2.5} />
                    Side Out / Change Serve
                  </div>
                  <p style={{ ...styles.tControlHint, marginTop: 0 }}>Switch Serve</p>
                  <div style={styles.tToggleRow}>
                    <button type="button" style={styles.tActionBtn} onClick={() => onSideOut(current.id)} title="Service passes to the other team — resets to 1st Serve">
                      Side Out
                    </button>
                    <button type="button" style={styles.tActionBtn} onClick={() => onChangeServe(current.id)} title="Same team's 1st/2nd server handoff">
                      <RefreshCw size={12} strokeWidth={2.5} />
                      Change Serve
                    </button>
                  </div>
                  <p style={styles.tControlHint}>Use when the receiving team wins the rally.</p>
                </div>
              </div>

              <div style={styles.tPanel}>
                <div style={styles.tControlLabel}>Score History</div>
                {current.pointLog?.length > 0 ? (
                  <div style={styles.tHistoryWrap}>
                    {[...current.pointLog].reverse().map((pt, i) => (
                      <div key={current.pointLog.length - i} style={styles.tHistoryRow}>
                        <span style={styles.tHistoryScore}>
                          {pt.scoreA}–{pt.scoreB}
                        </span>
                        <span style={styles.tHistoryTeam}>{pt.servingTeam === "teamA" ? current.teamA.label : current.teamB.label}</span>
                        <span style={styles.tHistoryServePill}>{pt.serveNumber === 1 ? "1st Serve" : "2nd Serve"}</span>
                        <span style={styles.tHistoryTime}>{new Date(pt.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={styles.tControlHint}>No points recorded yet.</p>
                )}
              </div>

              <div style={styles.tPanel}>
                <div style={styles.tControlLabel}>Current Rotation</div>
                <div style={styles.tRotationRow}>
                  <div style={styles.tRotationField}>
                    <span style={styles.tRotationLabel}>Server Team</span>
                    <span style={styles.tRotationValue("")}>{servingTeam === "teamA" ? current.teamA.label : current.teamB.label}</span>
                  </div>
                  <div style={styles.tRotationField}>
                    <span style={styles.tRotationLabel}>Current Serve</span>
                    <span style={styles.tRotationValue("live")}>{serveNumber === 1 ? "1st Serve" : "2nd Serve"}</span>
                  </div>
                </div>
              </div>

              <div style={styles.tPanel}>
                <div style={styles.tStatusDotRow}>
                  <span style={styles.tStatusDot(current.status)} />
                  Match Status: {STATUS_LABELS[current.status]}
                  {current.scorerName ? ` · Scorer: ${current.scorerName}` : ""}
                </div>
              </div>
            </>
          )}

          {current.status === "pending" && (
            <div style={styles.tControlsRow}>
              <button type="button" style={{ ...styles.tActionBtn, flex: 1, background: "var(--t-primary)", color: "#FFFFFF", border: "none" }} onClick={() => onStartMatch(current)}>
                <Play size={13} strokeWidth={2.5} />
                Start match
              </button>
            </div>
          )}

          <div style={styles.tControlsRow}>
            <button type="button" style={styles.tActionBtn} onClick={() => onReannounce(current.id, court.number)}>
              <Megaphone size={13} strokeWidth={2.5} />
              Re-announce
            </button>
            {otherAvailable.length > 0 && (
              <>
                <select style={styles.courtSelect} value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                  <option value="">Reassign to…</option>
                  {otherAvailable.map((c) => (
                    <option key={c.id} value={c.number}>
                      {courtDisplayName(c)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  style={styles.tActionBtn}
                  disabled={!reassignTo}
                  onClick={() => {
                    onReassign(current.id, court.number, Number(reassignTo));
                    setReassignTo("");
                  }}
                >
                  Move
                </button>
              </>
            )}
            <select style={styles.courtSelect} value={swapWith} onChange={(e) => setSwapWith(e.target.value)}>
              <option value="">Swap with…</option>
              {queue.allOccupiedCourts
                ?.filter((c) => c.number !== court.number)
                .map((c) => (
                  <option key={c.id} value={c.number}>
                    {courtDisplayName(c)}
                  </option>
                ))}
            </select>
            <button
              type="button"
              style={styles.tActionBtn}
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
      ) : (
        <p style={styles.tEmptyCourt}>
          {court.status === "maintenance" ? "Under maintenance" : court.status === "disabled" ? "Disabled — out of rotation" : nextUp ? `Up next: ${matchupLabel(nextUp.match)}` : "No matches waiting"}
        </p>
      )}

      <div style={styles.tControlsRow}>
        {court.status === "available" && !current && (
          <>
            <button type="button" style={styles.tActionBtn} onClick={() => onSetStatus(court.id, "maintenance")}>
              Mark maintenance
            </button>
            <button type="button" style={styles.tActionBtn} onClick={() => onSetStatus(court.id, "disabled")}>
              Disable
            </button>
          </>
        )}
        {(court.status === "maintenance" || court.status === "disabled") && (
          <button type="button" style={styles.tActionBtn} onClick={() => onSetStatus(court.id, "available")}>
            Mark available
          </button>
        )}
        {!current && (
          <button type="button" style={styles.tActionBtn} onClick={() => onRemove(court.id)}>
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
        {pinnedCourt != null && <span style={styles.queueSourceTag}>PINNED: {(() => { const pc = availableCourts.find((c) => c.number === pinnedCourt); return pc ? courtDisplayName(pc) : `Court ${pinnedCourt}`; })()}</span>}
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
              {courtDisplayName(c)}
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
                {courtDisplayName(c)}
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
  onSetServeNumber,
  onChangeServe,
  onSideOut,
  onEndMatch,
  nextMatchId,
  onSetNextMatch,
}) {
  const [newCourtName, setNewCourtName] = useState("");
  // Tournament Manager visual redesign, Stage 1 — see PROJECT.md/
  // FEATURES.md. Left-sidebar court selection: purely a local UI focus
  // concern (which court's full detail shows on the right). Must be
  // declared here, before the early returns below, per the Rules of Hooks;
  // starts null and is resolved (first LIVE court, else first court) once
  // `courts` exists further down.
  const [selectedCourtId, setSelectedCourtId] = useState(null);
  const [pendingStart, setPendingStart] = useState(null);
  const [scorerDraft, setScorerDraft] = useState("");

  if (loading) return <p style={styles.editHint}>Loading tournament…</p>;
  if (!tournament) {
    return <div style={styles.placeholderCard}>Generate a schedule from the Schedule tab to manage courts here.</div>;
  }

  const { courts } = courtAssignmentService.refreshQueue(tournament);
  const availableCourts = courtAssignmentService.getAvailableCourts(tournament);
  const queue = courtQueueService.getQueue(tournament);
  const occupiedCourts = courts.filter((c) => c.currentMatch);
  const queueWithOccupied = Object.assign(queue, { allOccupiedCourts: occupiedCourts });

  const requestStart = (entryOrMatch) => {
    let saved = "";
    try { saved = localStorage.getItem("opl-tournament-scorer-name") || ""; } catch { /* storage unavailable */ }
    setScorerDraft(saved);
    setPendingStart(entryOrMatch);
  };
  const confirmStart = () => {
    const name = scorerDraft.trim();
    if (!name || !pendingStart) return;
    try { localStorage.setItem("opl-tournament-scorer-name", name); } catch { /* storage unavailable */ }
    handleStartMatch(pendingStart, name);
    setPendingStart(null);
  };
  const handleStartMatch = (entryOrMatch, scorerName) => {
    // court.currentMatch doesn't carry its own `source`, so match id
    // membership in tournament.bracket's matches is the simplest reliable
    // check — cheaper than threading source through refreshQueue's shape.
    const isPlayoffMatch = tournament.bracket?.rounds.some((r) => r.matches.some((m) => m.id === entryOrMatch.id));
    if (isPlayoffMatch) onStartPlayoffMatch(entryOrMatch.id, scorerName);
    else onStartPoolMatch(entryOrMatch.id, scorerName);
  };

  // Tournament Manager visual redesign, Stage 1 — see PROJECT.md/
  // FEATURES.md. `divisionLabelByMatchId` maps a match id to its pool/
  // round label (collectMatches' own `sourceLabel`, unchanged/pre-existing
  // data — just not previously surfaced on this screen) combined with the
  // tournament's Singles/Doubles mode, e.g. "Doubles · Pool A" — no
  // invented data (no gender/division concept exists in this app).
  const divisionLabelByMatchId = new Map(
    collectMatches(tournament).map((entry) => [
      entry.match.id,
      `${tournament.mode === "doubles" ? "Doubles" : "Singles"} · ${entry.sourceLabel}`,
    ])
  );

  // Resolves the hook declared above: the organizer's explicit click wins
  // once made; before that, default to the first LIVE court, else the
  // first court overall. No tournament data is read or written here.
  const liveCourt = courts.find((c) => c.currentMatch?.status === "inProgress");
  const selectedCourt = (selectedCourtId && courts.find((c) => c.id === selectedCourtId)) || liveCourt || courts[0] || null;

  return (
    <div>
      <h2 style={styles.tSectionHeading}>Courts</h2>
      {courtError && <p style={styles.editWarning}>{courtError}</p>}

      <div style={{ ...styles.tControlsRow, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="New court name (e.g. Championship Court)"
          style={styles.courtNameInput}
          value={newCourtName}
          onChange={(e) => setNewCourtName(e.target.value)}
        />
        <button
          type="button"
          style={{ ...styles.tActionBtn, background: "var(--t-primary)", color: "#FFFFFF", border: "none", flex: "0 0 auto" }}
          onClick={() => {
            onAddCourt(newCourtName.trim() || undefined);
            setNewCourtName("");
          }}
        >
          <Plus size={14} strokeWidth={2.5} />
          Add court
        </button>
      </div>

      {pendingStart && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={() => setPendingStart(null)}>
          <form
            style={{ ...styles.tPanel, width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 12 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); confirmStart(); }}
          >
            <p style={styles.tFieldLabel}>Scorer name (for match records)</p>
            <input autoFocus style={styles.tInput} value={scorerDraft} onChange={(e) => setScorerDraft(e.target.value)} placeholder="Enter your name" maxLength={60} />
            <div style={styles.tControlsRow}>
              <button type="button" style={{ ...styles.tActionBtn, flex: 1 }} onClick={() => setPendingStart(null)}>Cancel</button>
              <button type="submit" disabled={!scorerDraft.trim()} style={{ ...styles.tActionBtn, flex: 1, background: "var(--t-primary)", color: "#FFFFFF", border: "none", opacity: scorerDraft.trim() ? 1 : 0.5 }}>Start match</button>
            </div>
          </form>
        </div>
      )}

      <div style={styles.tCourtsLayout}>
        <div style={styles.tCourtsSidebar}>
          <div style={styles.tSectionHeading}>Courts</div>
          {courts.map((court) => (
            <CourtListItem
              key={court.id}
              court={court}
              selected={court.id === selectedCourt?.id}
              onSelect={() => setSelectedCourtId(court.id)}
              divisionLabel={court.currentMatch ? divisionLabelByMatchId.get(court.currentMatch.id) : null}
            />
          ))}
        </div>

        <div style={styles.tMatchMain}>
          {selectedCourt ? (
            <CourtCard
              key={selectedCourt.id}
              court={selectedCourt}
              availableCourts={availableCourts}
              queue={queueWithOccupied}
              onAssign={onAssignMatch}
              onRelease={onReleaseCourt}
              onReassign={onReassignMatch}
              onSwap={onSwapCourts}
              onStartMatch={requestStart}
              onSetStatus={onSetCourtStatus}
              onRemove={onRemoveCourt}
              onReannounce={onReannounce}
              onAdjustScore={onAdjustScore}
              onDeclareWinner={onDeclareWinner}
              onSetServeNumber={onSetServeNumber}
              onChangeServe={onChangeServe}
              onSideOut={onSideOut}
              onEndMatch={onEndMatch}
              assumedDurationMinutes={20}
              divisionLabel={selectedCourt.currentMatch ? divisionLabelByMatchId.get(selectedCourt.currentMatch.id) : null}
            />
          ) : (
            <p style={styles.tEmptyCourt}>Add a court to get started.</p>
          )}
        </div>
      </div>

      <h3 style={{ ...styles.tSectionHeading, marginTop: 20 }}>Match Queue</h3>
      {queue.length === 0 ? (
        <p style={styles.tControlHint}>No matches are waiting for a court right now.</p>
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

import { useState } from "react";
import { Check, ClipboardEdit, Clock, Lock, Megaphone, Pencil, PhoneCall, Play, RotateCcw, Shuffle, Trophy, Unlock, X } from "lucide-react";
import { styles } from "../styles.js";
import { courtDisplayName } from "../lib/utils.js";
import Avatar from "./Avatar.jsx";
import PlayerPicker from "./PlayerPicker.jsx";
import TeamRow from "./TeamRow.jsx";

export default function CourtCard({
  court,
  players,
  candidates,
  readOnly,
  onFill,
  onScore,
  onDeclareWinner,
  onEnd,
  onReassign,
  onSubstitute,
  onSetAssignmentMode,
  onSetManualPlayer,
  onClearManualPlayer,
  onLock,
  onUnlock,
  canFill,
  pairPartnerNumber,
  poolingMode,
  reserved,
  onRequestCheckout,
  onStartMatch,
  onRepeatAnnouncement,
  onRename,
  onCancelLiveMatch,
  onReportScore,
  hideAvatar,
}) {
  const isLive = court.status === "live" || court.status === "finished";
  // Smart Court Dispatch — "dispatching" is its own dedicated court state
  // (see constants.js's emptyCourt): the matchup is already assigned, but
  // scoring hasn't started — the court reads "Calling Players..." instead.
  const isDispatching = court.status === "dispatching";
  const isManual = court.assignmentMode === "manual";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  // Court Renaming — see PROJECT.md/FEATURES.md. Local-only draft text
  // while the facilitator is actively editing the court's display name;
  // committed via onRename (renameCourt, lib/utils.js) only on Save.
  const [renamingCourt, setRenamingCourt] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [subbingId, setSubbingId] = useState(null);
  const [subChoice, setSubChoice] = useState(null);
  const [manualSlot, setManualSlot] = useState(null); // { side, slotIndex } — which empty slot is currently being filled

  const manualAllIds = [...court.teamA, ...court.teamB];
  const manualComplete =
    court.teamA.length === 2 &&
    court.teamB.length === 2 &&
    new Set(manualAllIds).size === manualAllIds.length;

  const startEdit = () => {
    const map = {};
    court.teamA.forEach((id) => (map[id] = "A"));
    court.teamB.forEach((id) => (map[id] = "B"));
    setDraft(map);
    setSubbingId(null);
    setEditing(true);
  };

  const startSub = (id) => {
    setSubbingId(id);
    setSubChoice(null);
    setEditing(false);
  };

  const cancelSub = () => setSubbingId(null);

  // Substitute Right Away — see PROJECT.md/FEATURES.md. Picking a name from
  // PlayerPicker now performs the substitution immediately — no separate
  // "Confirm sub" click required. `subChoice` is still tracked briefly
  // (PlayerPicker highlights the just-picked chip) but the swap itself
  // happens on this same click.
  const chooseSub = (incomingId) => {
    setSubChoice(incomingId);
    onSubstitute(subbingId, incomingId);
    setSubbingId(null);
  };

  const toggleSide = (id) => {
    setDraft((d) => ({ ...d, [id]: d[id] === "A" ? "B" : "A" }));
  };

  const allIds = [...court.teamA, ...court.teamB];
  const draftACount = allIds.filter((id) => draft[id] === "A").length;
  const draftValid = draftACount === 2;

  const saveEdit = () => {
    if (!draftValid) return;
    const teamA = allIds.filter((id) => draft[id] === "A");
    const teamB = allIds.filter((id) => draft[id] === "B");
    onReassign(teamA, teamB);
    setEditing(false);
  };

  const startRenaming = () => {
    setNameDraft(court.name || "");
    setRenamingCourt(true);
  };
  const saveRename = () => {
    onRename(nameDraft);
    setRenamingCourt(false);
  };

  return (
    <div style={styles.courtCard(court.status)}>
      <div style={styles.courtHeadRow}>
        {renamingCourt ? (
          <span style={styles.courtRenameRow}>
            <input
              style={styles.courtRenameInput}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRename();
                if (e.key === "Escape") setRenamingCourt(false);
              }}
              placeholder={`Court ${court.number}`}
              autoFocus
            />
            <button style={styles.iconBtn} onClick={saveRename} aria-label="save court name">
              <Check size={13} strokeWidth={3} />
            </button>
            <button style={styles.iconBtn} onClick={() => setRenamingCourt(false)} aria-label="cancel renaming court">
              <X size={13} strokeWidth={3} />
            </button>
          </span>
        ) : (
          <span style={styles.courtBadge}>
            {courtDisplayName(court).toUpperCase()}
            {onRename && (
              <button
                style={styles.courtRenameBtn}
                onClick={startRenaming}
                aria-label={`rename ${courtDisplayName(court)}`}
                title="Rename this court (display only — its court number never changes)"
              >
                <Pencil size={10} strokeWidth={2.5} />
              </button>
            )}
          </span>
        )}
        <span style={styles.courtHeadRightGroup}>
          {court.manualLocked ? (
            <span style={styles.manualBadge}>
              <Lock size={10} strokeWidth={3} />
              Manual Assignment
            </span>
          ) : reserved && court.status === "open" ? (
            // Court Booking & Reservations integration — see PROJECT.md.
            // Only shown for an otherwise-OPEN court — a court already LIVE/
            // FINISHED keeps its normal badge, since Court Booking never
            // interrupts a match already in progress, only blocks a NEW one
            // from being assigned onto a reserved slot.
            <span style={styles.resultTag("loss")}>RESERVED</span>
          ) : (
            <span style={styles.statusTag(court.status)}>
              {court.awaitingPair
                ? "WAITING"
                : court.status === "open"
                  ? "OPEN"
                  : court.status === "dispatching"
                    ? "CALLING PLAYERS..."
                    : court.status === "finished"
                      ? "MATCH POINT"
                      : "LIVE"}
            </span>
          )}
          {/* Self-Service Score Reporting — see PROJECT.md/FEATURES.md.
              Immediately next to the LIVE badge, only while the match is
              actually live (not yet at match point, not mid-pooling-wait) —
              lets the organizer hand the device to the winning team to type
              in both final scores directly, instead of tapping +/- for the
              whole game. Reuses the exact same authoritative reportScore
              path (lib/utils.js's applyReportedScore) as every other
              scoring action here; never a separate/parallel completion
              system. */}
          {!readOnly && onReportScore && court.status === "live" && !court.awaitingPair && (
            <button
              style={styles.reportScoreBtn}
              onClick={onReportScore}
              aria-label={`report score for ${courtDisplayName(court)}`}
              title="Report Score — let the winning team enter both final scores directly"
            >
              <ClipboardEdit size={12} strokeWidth={2.5} />
              Report Score
            </button>
          )}
        </span>
      </div>

      {!isLive && !isDispatching && (
        <div style={styles.courtOpenRow}>
          {!readOnly && (
            <div style={styles.assignmentToggleRow}>
              <button
                style={styles.assignmentToggleBtn(!isManual)}
                onClick={() => onSetAssignmentMode && onSetAssignmentMode("automatic")}
              >
                Automatic
              </button>
              <button
                style={styles.assignmentToggleBtn(isManual)}
                onClick={() => onSetAssignmentMode && onSetAssignmentMode("manual")}
              >
                Manual
              </button>
            </div>
          )}
          {!isManual && (
            <>
              <span style={styles.openCourtText}>{reserved ? "Reserved via Court Booking" : "Court is free"}</span>
              {!readOnly && (
                <button
                  style={{ ...styles.secondaryBtn, ...(!canFill ? styles.btnDisabled : {}) }}
                  onClick={onFill}
                  disabled={!canFill}
                >
                  <Shuffle size={14} strokeWidth={2.5} />
                  Assign match
                </button>
              )}
            </>
          )}
        </div>
      )}

      {!isLive && isManual && (
        <div>
          {manualSlot ? (
            <div>
              <p style={styles.editHint}>
                Pick a player for Team {manualSlot.side === "teamA" ? "A" : "B"}
              </p>
              <PlayerPicker
                candidates={candidates}
                selectedId={null}
                onSelect={(playerId) => {
                  onSetManualPlayer && onSetManualPlayer(manualSlot.side, manualSlot.slotIndex, playerId);
                  setManualSlot(null);
                }}
                emptyMessage="No eligible players available right now."
              />
              <div style={styles.editActions}>
                <button style={styles.secondaryBtn} onClick={() => setManualSlot(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p style={styles.manualTeamLabel}>Team A</p>
              {[0, 1].map((slotIndex) => {
                const id = court.teamA[slotIndex];
                return id ? (
                  <div key={slotIndex} style={styles.manualSlotFilled}>
                    <div style={styles.playerChip}>
                      {!hideAvatar && <Avatar player={players[id]} size={20} />}
                      <span style={hideAvatar ? styles.teamNameProminent : undefined}>{players[id]?.name}</span>
                    </div>
                    {!readOnly && (
                      <button
                        style={styles.subBtn}
                        onClick={() => onClearManualPlayer && onClearManualPlayer("teamA", slotIndex)}
                      >
                        <X size={11} strokeWidth={3} />
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    key={slotIndex}
                    style={styles.manualSlotEmpty}
                    onClick={() => setManualSlot({ side: "teamA", slotIndex })}
                  >
                    + Add player
                  </button>
                );
              })}
              <p style={styles.manualTeamLabel}>Team B</p>
              {[0, 1].map((slotIndex) => {
                const id = court.teamB[slotIndex];
                return id ? (
                  <div key={slotIndex} style={styles.manualSlotFilled}>
                    <div style={styles.playerChip}>
                      {!hideAvatar && <Avatar player={players[id]} size={20} />}
                      <span style={hideAvatar ? styles.teamNameProminent : undefined}>{players[id]?.name}</span>
                    </div>
                    {!readOnly && (
                      <button
                        style={styles.subBtn}
                        onClick={() => onClearManualPlayer && onClearManualPlayer("teamB", slotIndex)}
                      >
                        <X size={11} strokeWidth={3} />
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    key={slotIndex}
                    style={styles.manualSlotEmpty}
                    onClick={() => setManualSlot({ side: "teamB", slotIndex })}
                  >
                    + Add player
                  </button>
                );
              })}
              {!readOnly && (
                <div style={styles.editActions}>
                  <button
                    style={{ ...styles.primaryBtn, ...(!manualComplete ? styles.btnDisabled : {}) }}
                    onClick={onLock}
                    disabled={!manualComplete}
                  >
                    <Lock size={14} strokeWidth={2.5} />
                    Lock court
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {isDispatching && (
        <div>
          <div style={styles.courtLiveRow}>
            <div style={styles.courtTeamHalf}>
              <span style={styles.courtTeamBadge}>Team A</span>
              <TeamRow ids={court.teamA} players={players} score={0} readOnly hideAvatar={hideAvatar} hidePayment startIndex={0} />
            </div>
            <div style={styles.courtVerticalDivider} />
            <div style={styles.courtTeamHalf}>
              <span style={styles.courtTeamBadge}>Team B</span>
              <TeamRow ids={court.teamB} players={players} score={0} readOnly hideAvatar={hideAvatar} hidePayment startIndex={court.teamA.length} />
            </div>
          </div>
          <p style={styles.awaitingPairText}>
            <PhoneCall size={12} strokeWidth={2.5} style={{ verticalAlign: "-1px", marginRight: 4 }} />
            Calling players to {courtDisplayName(court)}…
          </p>
          {!readOnly && (
            <div style={styles.courtActionsRow}>
              {onStartMatch && (
                <button style={styles.fixTeamsBtn} onClick={onStartMatch}>
                  <Play size={12} strokeWidth={2.5} />
                  Start Match
                </button>
              )}
              {onRepeatAnnouncement && (
                <button style={styles.fixTeamsBtn} onClick={onRepeatAnnouncement}>
                  <Megaphone size={12} strokeWidth={2.5} />
                  Repeat Announcement
                </button>
              )}
              {onCancelLiveMatch && (
                <button
                  style={styles.lockToggleBtn(false)}
                  onClick={onCancelLiveMatch}
                  aria-label={`cancel this match on ${courtDisplayName(court)}`}
                  title="Cancel — free this court and return all 4 players to the front of Next Matchups, same pairing, no result recorded (e.g. a player stepped away)"
                >
                  <X size={12} strokeWidth={2.5} />
                  Cancel match
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {isLive && editing && (
        <div>
          <p style={styles.editHint}>Tap a player to move them to the other side.</p>
          <div style={styles.editGrid}>
            {allIds.map((id) => (
              <button
                key={id}
                style={{
                  ...styles.editChip,
                  ...(draft[id] === "A" ? styles.editChipA : styles.editChipB),
                }}
                onClick={() => toggleSide(id)}
              >
                {!hideAvatar && <Avatar player={players[id]} size={22} />}
                <span style={styles.editChipName}>{players[id]?.name}</span>
                <span style={styles.editChipSide}>{draft[id]}</span>
              </button>
            ))}
          </div>
          {!draftValid && <p style={styles.editWarning}>Each side needs exactly 2 players.</p>}
          <div style={styles.editActions}>
            <button style={styles.secondaryBtn} onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              style={{ ...styles.primaryBtn, ...(!draftValid ? styles.btnDisabled : {}) }}
              onClick={saveEdit}
              disabled={!draftValid}
            >
              <Check size={14} strokeWidth={3} />
              Save teams
            </button>
          </div>
        </div>
      )}

      {isLive && subbingId && (
        <div>
          <p style={styles.editHint}>Substitute for {players[subbingId]?.name} — tap a name to sub in right away</p>
          <PlayerPicker
            candidates={candidates}
            outgoingPlayer={players[subbingId]}
            selectedId={subChoice}
            onSelect={chooseSub}
            emptyMessage="No one is available to sub in right now."
          />
          <p style={styles.subReturnLabel}>
            {players[subbingId]?.name} will go back to the waiting queue.
          </p>
          <div style={styles.editActions}>
            <button style={styles.secondaryBtn} onClick={cancelSub}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLive && court.awaitingPair && (
        <div>
          <div style={styles.courtLiveRow}>
            <div style={styles.courtTeamHalf}>
              <span style={styles.courtTeamBadge}>Team A</span>
              <TeamRow ids={court.teamA} players={players} score={court.scoreA} readOnly leading={court.scoreA > court.scoreB} hideAvatar={hideAvatar} hidePayment={hideAvatar} startIndex={0} />
            </div>
            <div style={styles.courtVerticalDivider} />
            <div style={styles.courtTeamHalf}>
              <span style={styles.courtTeamBadge}>Team B</span>
              <TeamRow ids={court.teamB} players={players} score={court.scoreB} readOnly leading={court.scoreB > court.scoreA} hideAvatar={hideAvatar} hidePayment={hideAvatar} startIndex={court.teamA.length} />
            </div>
          </div>
          <p style={styles.awaitingPairText}>
            <Clock size={12} strokeWidth={2.5} style={{ verticalAlign: "-1px", marginRight: 4 }} />
            {pairPartnerNumber
              ? `Waiting for Court ${pairPartnerNumber} to finish — winners and losers will then join the back of the queue.`
              : "Waiting to regroup with its paired court."}
          </p>
        </div>
      )}

      {isLive && !court.awaitingPair && !editing && !subbingId && (
        <>
          <div style={styles.courtLiveRow}>
            <div style={styles.courtTeamHalf}>
              <span style={styles.courtTeamBadge}>Team A</span>
              <TeamRow
                ids={court.teamA}
                players={players}
                score={court.scoreA}
                onMinus={() => onScore && onScore("A", -1)}
                onPlus={() => onScore && onScore("A", 1)}
                readOnly={readOnly}
                leading={court.scoreA > court.scoreB}
                onRequestSub={!readOnly ? startSub : null}
                onDeclareWinner={!readOnly && onDeclareWinner ? () => onDeclareWinner("A") : null}
                onRequestCheckout={!readOnly ? onRequestCheckout : null}
                hideAvatar={hideAvatar}
                hidePayment={hideAvatar}
                startIndex={0}
              />
            </div>
            <div style={styles.courtVerticalDivider} />
            <div style={styles.courtTeamHalf}>
              <span style={styles.courtTeamBadge}>Team B</span>
              <TeamRow
                ids={court.teamB}
                players={players}
                score={court.scoreB}
                onMinus={() => onScore && onScore("B", -1)}
                onPlus={() => onScore && onScore("B", 1)}
                readOnly={readOnly}
                leading={court.scoreB > court.scoreA}
                onRequestSub={!readOnly ? startSub : null}
                onDeclareWinner={!readOnly && onDeclareWinner ? () => onDeclareWinner("B") : null}
                onRequestCheckout={!readOnly ? onRequestCheckout : null}
                hideAvatar={hideAvatar}
                hidePayment={hideAvatar}
                startIndex={court.teamA.length}
              />
            </div>
          </div>
          {!readOnly && (
            <div style={styles.courtActionsInline}>
              <button style={styles.fixTeamsBtn} onClick={startEdit}>
                <Shuffle size={12} strokeWidth={2.5} />
                Fix teams
              </button>
              {onRepeatAnnouncement && (
                <button style={styles.fixTeamsBtn} onClick={onRepeatAnnouncement}>
                  <Megaphone size={12} strokeWidth={2.5} />
                  Repeat Announcement
                </button>
              )}
              {court.manualLocked && court.status !== "finished" && (
                <button style={styles.fixTeamsBtn} onClick={onUnlock}>
                  <Unlock size={12} strokeWidth={2.5} />
                  Unlock
                </button>
              )}
              {onCancelLiveMatch && court.status === "live" && (
                <button
                  style={styles.lockToggleBtn(false)}
                  onClick={onCancelLiveMatch}
                  aria-label={`cancel this match on ${courtDisplayName(court)}`}
                  title="Cancel — free this court and return all 4 players to the front of Next Matchups, same pairing, no result recorded (e.g. a player stepped away)"
                >
                  <X size={12} strokeWidth={2.5} />
                  Cancel match
                </button>
              )}
              <button
                style={{
                  ...styles.endMatchBtn,
                  ...(court.status !== "finished" ? { opacity: 0.55 } : {}),
                }}
                onClick={onEnd}
              >
                {court.status === "finished" ? (
                  <>
                    <Trophy size={14} strokeWidth={2.5} />
                    {poolingMode ? "Confirm result" : "End match & requeue players"}
                  </>
                ) : (
                  <>
                    <RotateCcw size={14} strokeWidth={2.5} /> End match early
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

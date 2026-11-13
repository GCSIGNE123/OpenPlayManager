import { Info } from "lucide-react";
import { styles } from "../styles.js";
import { shouldUseRandomFirstRound } from "../engines/ProgressiveSkillRotationStrategy.js";
import { computePodiums } from "../lib/podium.js";
import { useNow } from "../lib/useNow.js";
import CourtCard from "./CourtCard.jsx";
import PodiumBoard from "./PodiumBoard.jsx";
import RoulettePanel from "./RoulettePanel.jsx";
import QueueList from "./QueueList.jsx";
import SectionLabel from "./SectionLabel.jsx";

// Progressive Skill Rotation Fallback — see PROJECT.md. Purely
// informational, never blocks anything: shown only while the session is
// genuinely still in its opening round (no completed games yet) AND
// Progressive Skill Rotation's own single-skill fallback is actually
// active for this roster (shouldUseRandomFirstRound — the exact same
// detection the engine itself uses, so this can never say "randomly
// generated" for a round that wasn't). Disappears on its own the moment
// the first match finishes, or the moment a second skill level joins the
// roster — no dismiss button, no persisted "seen it" flag needed.
function showsRandomFirstRoundNotice(state) {
  return state.rotationMode === "progressiveSkill" && (state.matchHistory || []).length === 0 && shouldUseRandomFirstRound(state.players);
}

export default function BoardView({ state }) {
  // Running Podium — see lib/podium.js — sits above the courts on the
  // public Live Board so spectators and players see it first.
  // Division Podiums: a Skill Divisions session gets a Beginner and an
  // Intermediate podium (PodiumBoard); every other mode the single podium.
  const now = useNow(30000);
  const podiums = computePodiums(state, now);
  return (
    <div>
      <PodiumBoard podiums={podiums} />
      {/* Roulette sessions: round n of N + the round clock, read-only (renders nothing in other modes) */}
      <RoulettePanel state={state} />
      {showsRandomFirstRoundNotice(state) && (
        <div style={styles.infoBanner}>
          <Info size={15} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            All registered players are currently in the same skill level. The first round was generated randomly.
            Progressive Skill Rotation will resume from Round 2 onward.
          </span>
        </div>
      )}
      <div style={styles.courtGrid}>
        {state.courts.map((court, i) => (
          <CourtCard key={i} court={court} players={state.players} readOnly />
        ))}
      </div>
      <SectionLabel>Waiting queue</SectionLabel>
      <QueueList queueIds={state.queueIds} players={state.players} nextMatchups={state.nextMatchups || []} />
    </div>
  );
}

import { useEffect, useRef } from "react";
import { Play, RefreshCw, Timer } from "lucide-react";
import { styles } from "../styles.js";
import { useNow } from "../lib/useNow.js";
import { ROULETTE_PHASES, formatClock, isRouletteMode, rouletteClock, rouletteOf, roulettePool, rouletteRepeats, rouletteStatusText } from "../lib/roulette.js";
import { playChime } from "./AlertBell.jsx";
import RouletteFinalCard from "./RouletteFinalCard.jsx";

// Roulette (random-draw rounds) — the round banner. See lib/roulette.js for
// the rules (pure, tested); this component only shows the round state:
//
//   - `controls` (Scorer tab): round n of N, the status line, the round
//     clock, who is sitting out the drawn round, any repeat partner /
//     opponent in the draw, and the Start Round / Redraw buttons;
//   - without `controls` (Live Board, TV Mode): the same round + clock,
//     read-only.
//
// The clock is a render-only 1-second tick; the buzzer is the same Web
// Audio chime the alert bell uses, sounded three times when the clock hits
// zero (Scorer only). Renders nothing outside Roulette sessions.
export default function RoulettePanel({ state, controls = false, dark = false, onStartRound, onRedraw, onCreateFinal, onSaveFinalScore, onClearFinalResult, onRemoveFinal }) {
  const active = isRouletteMode(state);
  const now = useNow(active ? 1000 : 60000);
  const ctxRef = useRef(null);
  const buzzedRef = useRef(null);
  const clock = active ? rouletteClock(state, now) : null;
  const r = rouletteOf(state);

  useEffect(() => {
    if (!controls || !clock) return;
    if (clock.expired && buzzedRef.current !== clock.endsAt) {
      buzzedRef.current = clock.endsAt;
      // only buzz if we actually watched it run out (not on a page load long after)
      if (now - clock.endsAt < 5000) [0, 450, 900].forEach((ms) => setTimeout(() => playChime(ctxRef), ms));
    }
  }, [controls, clock, now]);

  if (!active) return null;
  const P = ROULETTE_PHASES;
  const players = state.players || {};
  const name = (id) => players[id]?.name || "Player";
  const drawn = r.phase === P.DRAWN ? state.nextMatchups || [] : [];
  const drawnIds = new Set(drawn.flatMap((m) => [...m.teamA, ...m.teamB]));
  const sitting = r.phase === P.DRAWN ? roulettePool(state).filter((id) => !drawnIds.has(id)) : r.phase === P.PLAYING ? r.rounds.find((x) => x.round === r.round)?.sat || [] : [];
  const repeats = r.phase === P.DRAWN ? rouletteRepeats(drawn, state.matchHistory) : [];
  const partnerRepeats = repeats.filter((x) => x.kind === "partner");
  const opponentRepeats = repeats.filter((x) => x.kind === "opponent");
  const urgent = clock && clock.remainingMs <= 60000;

  return (
    <div style={styles.roulettePanel(dark)} data-testid="roulette-panel" data-phase={r.phase}>
      <div style={styles.rouletteHead}>
        <span style={styles.rouletteRound(dark)}>
          {r.phase === P.COMPLETE ? "Roulette complete" : `Round ${Math.max(1, r.phase === P.WAITING ? r.round + 1 : r.round)} of ${r.totalRounds}`}
        </span>
        {clock && (
          <span style={styles.rouletteClock(dark, urgent)} data-testid="roulette-clock">
            <Timer size={dark ? 22 : 16} strokeWidth={2.5} />
            {clock.expired ? "TIME" : formatClock(clock.remainingMs)}
          </span>
        )}
        {controls && r.phase === P.PLAYING && (state.nextMatchups || []).length > 0 && (
          <span style={styles.rouletteActions}>
            <button style={styles.primaryBtn} onClick={onStartRound} title="Put the matchups that are still waiting onto the courts that are free now">
              <Play size={14} strokeWidth={2.5} />
              Start remaining courts
            </button>
          </span>
        )}
        {controls && r.phase === P.DRAWN && (
          <span style={styles.rouletteActions}>
            <button style={{ ...styles.secondaryBtn, margin: 0 }} onClick={onRedraw} title="Throw this draw away and draw the round again (same sit-out rotation and pairing rules)">
              <RefreshCw size={13} strokeWidth={2.5} />
              Redraw
            </button>
            <button style={styles.primaryBtn} onClick={onStartRound} title="Put every matchup on its court and start the round clock">
              <Play size={14} strokeWidth={2.5} />
              Start Round {r.round}
            </button>
          </span>
        )}
      </div>
      <div style={styles.rouletteStatus(dark)}>
        {clock?.expired ? `Time is up for Round ${r.round} — finish the rally, settle any tie with one more point, and enter the scores.` : rouletteStatusText(state)}
      </div>
      {sitting.length > 0 && (
        <div style={styles.rouletteLine(dark)}>
          <span style={styles.rouletteLabel(dark)}>Sitting out</span> {sitting.map(name).join(", ")}
        </div>
      )}
      {controls && partnerRepeats.length > 0 && (
        <div style={{ ...styles.rouletteLine(dark), color: "var(--coral)" }}>
          <span style={styles.rouletteLabel(dark)}>Repeat partners</span> {partnerRepeats.map((x) => `${name(x.ids[0])} & ${name(x.ids[1])}`).join("; ")}
        </div>
      )}
      {controls && opponentRepeats.length > 0 && (
        <div style={styles.rouletteLine(dark)}>
          <span style={styles.rouletteLabel(dark)}>Repeat opponents</span> {opponentRepeats.map((x) => `${name(x.ids[0])} vs ${name(x.ids[1])}`).join("; ")} — as few as this round allows.
        </div>
      )}
      {/* The separate Final Match award (#1 & #4 vs #2 & #3) — offered once every round is played */}
      <RouletteFinalCard state={state} controls={controls} dark={dark} onCreate={onCreateFinal} onSaveScore={onSaveFinalScore} onClearResult={onClearFinalResult} onRemove={onRemoveFinal} />
      {controls && r.phase === P.DRAWN && (
        <div style={styles.rouletteHint(dark)}>Edit the draw in Next matchups (substitute or swap players) before starting — nothing goes on court until you press Start Round.</div>
      )}
    </div>
  );
}

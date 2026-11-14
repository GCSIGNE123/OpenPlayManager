import { useState } from "react";
import { Trophy } from "lucide-react";
import { styles } from "../styles.js";
import { ROULETTE_PHASES, isRouletteMode, rouletteFinalists, rouletteFinalScoreProblem, rouletteFinalView, rouletteOf } from "../lib/roulette.js";

// Roulette — the Final Match card. See lib/roulette.js ("THE FINAL MATCH"):
// a separate award played by the top four after the last round (#1 & #4 vs
// #2 & #3). It never goes through a court, so it cannot change anyone's
// record, the standings or the podium.
//
//   - `view` — a saved rouletteFinalView (report / read-only screens);
//   - `state` — a live session: shown once every round has been played;
//   - `controls` (Scorer): Create Final Match, enter the score, change it,
//     or remove the match. `onChange(fn)` applies a pure roulette.js
//     state -> state function.
export default function RouletteFinalCard({ state, view, controls = false, dark = false, onCreate, onSaveScore, onClearResult, onRemove }) {
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [error, setError] = useState("");

  const live = !view && isRouletteMode(state);
  const final = view || (live ? rouletteFinalView(state) : null);
  const complete = live && rouletteOf(state).phase === ROULETTE_PHASES.COMPLETE;
  if (!final && !(controls && complete)) return null;

  const side = (team) => team.map((p) => `#${p.seed} ${p.name}`).join(" & ");

  if (!final) {
    const finalists = rouletteFinalists(state);
    return (
      <div style={styles.rouletteFinal(dark)} data-testid="roulette-final">
        <div style={styles.rouletteFinalTitle(dark)}>
          <Trophy size={15} strokeWidth={2.5} /> Final Match
        </div>
        {finalists.length < 4 ? (
          <div style={styles.rouletteLine(dark)}>Needs four eligible players still at the venue (currently {finalists.length}).</div>
        ) : (
          <>
            <div style={styles.rouletteFinalTeams(dark)}>
              {side([finalists[0], finalists[3]])} <span style={styles.rouletteFinalVs}>vs</span> {side([finalists[1], finalists[2]])}
            </div>
            <div style={styles.rouletteLine(dark)}>A separate award — the podium stays as the round standings decided it.</div>
            <div>
              <button style={styles.primaryBtn} onClick={onCreate}>
                <Trophy size={14} strokeWidth={2.5} />
                Create Final Match
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  const save = () => {
    const problem = rouletteFinalScoreProblem(scoreA, scoreB);
    if (problem) return setError(problem);
    setError("");
    onSaveScore?.(Number(scoreA), Number(scoreB));
    setScoreA("");
    setScoreB("");
  };

  return (
    <div style={styles.rouletteFinal(dark)} data-testid="roulette-final" data-decided={final.winner ? "yes" : "no"}>
      <div style={styles.rouletteFinalTitle(dark)}>
        <Trophy size={dark ? 20 : 15} strokeWidth={2.5} /> Final Match
      </div>
      <div style={styles.rouletteFinalTeams(dark)}>
        {side(final.teamA)}
        <span style={styles.rouletteFinalVs}>{final.winner ? `${final.scoreA} – ${final.scoreB}` : "vs"}</span>
        {side(final.teamB)}
      </div>
      {final.winner ? (
        <div style={styles.rouletteFinalWinners(dark)}>Final Match Winners: {final.winnersText}</div>
      ) : (
        !controls && <div style={styles.rouletteLine(dark)}>To be played.</div>
      )}
      {controls && !final.winner && (
        <div style={styles.rouletteFinalScoreRow}>
          <input type="number" min={0} style={styles.expectedGamesInput} value={scoreA} onChange={(e) => setScoreA(e.target.value)} aria-label="Final Match score, first team" placeholder="0" />
          <span style={styles.rouletteFinalVs}>–</span>
          <input type="number" min={0} style={styles.expectedGamesInput} value={scoreB} onChange={(e) => setScoreB(e.target.value)} aria-label="Final Match score, second team" placeholder="0" />
          <button style={styles.primaryBtn} onClick={save}>
            Save result
          </button>
          <button style={{ ...styles.secondaryBtn, margin: 0 }} onClick={onRemove} title="Remove this Final Match and rebuild it from the current standings">
            Remove
          </button>
        </div>
      )}
      {controls && final.winner && (
        <div style={styles.rouletteFinalScoreRow}>
          <button style={{ ...styles.secondaryBtn, margin: 0 }} onClick={onClearResult}>
            Change score
          </button>
        </div>
      )}
      {error && <div style={{ ...styles.rouletteLine(dark), color: "var(--coral)" }}>{error}</div>}
    </div>
  );
}

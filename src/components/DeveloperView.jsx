import { useState } from "react";
import { ArrowLeft, Play } from "lucide-react";
import { styles } from "../styles.js";
import {
  runSimulation,
  randomPlayerCount,
  DEFAULT_SIMULATION_CONFIG,
  MIN_RANDOM_PLAYERS,
  MAX_RANDOM_PLAYERS,
} from "../lib/simulation/RotationSimulationEngine.js";
import SectionLabel from "./SectionLabel.jsx";

// Simple developer-only page: configure and run RotationSimulationEngine
// entirely client-side (it's plain JS, no server round-trip needed) and
// display the results. Not part of the organizer/player flow — reached via
// a link on the landing screen, same pattern as "Organizer? Manage access
// codes". No session, no Supabase writes; purely a local dev tool.
export default function DeveloperView({ onBack }) {
  const [playerCount, setPlayerCount] = useState(DEFAULT_SIMULATION_CONFIG.playerCount);
  const [randomizePlayers, setRandomizePlayers] = useState(false);
  const [courtCount, setCourtCount] = useState(DEFAULT_SIMULATION_CONFIG.courtCount);
  const [compareCourts, setCompareCourts] = useState(false);
  const [expectedGamesPerPlayer, setExpectedGamesPerPlayer] = useState(DEFAULT_SIMULATION_CONFIG.expectedGamesPerPlayer);
  const [skillSplit, setSkillSplit] = useState(DEFAULT_SIMULATION_CONFIG.skillSplit);
  const [result, setResult] = useState(null);
  const [comparison, setComparison] = useState(null);

  const runOne = () => {
    const config = {
      playerCount: Number(playerCount) || DEFAULT_SIMULATION_CONFIG.playerCount,
      randomizePlayers,
      courtCount: Number(courtCount) || DEFAULT_SIMULATION_CONFIG.courtCount,
      expectedGamesPerPlayer: Number(expectedGamesPerPlayer) || DEFAULT_SIMULATION_CONFIG.expectedGamesPerPlayer,
      skillSplit: Number(skillSplit),
    };

    if (!compareCourts) {
      setComparison(null);
      setResult(runSimulation(config));
      return;
    }

    // apples-to-apples: resolve a random headcount once (if requested) and
    // reuse it across all three court counts, rather than re-randomizing
    // per run
    const sharedConfig = { ...config };
    if (sharedConfig.randomizePlayers) {
      sharedConfig.playerCount = randomPlayerCount();
      sharedConfig.randomizePlayers = false;
    }
    setResult(null);
    setComparison([2, 3, 4].map((courts) => runSimulation({ ...sharedConfig, courtCount: courts })));
  };

  return (
    <div style={styles.devWrap}>
      <button style={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>
      <SectionLabel>Developer: Rotation Simulator</SectionLabel>
      <p style={styles.landingCardText}>
        Runs a complete simulated Open Play session under Progressive Skill Rotation, entirely in your browser. No
        session is created and nothing is saved.
      </p>

      <div style={styles.devFormCard}>
        <div style={styles.devFormGrid}>
          <label style={styles.settingsField}>
            Players
            <input
              type="number"
              min={4}
              style={styles.expectedGamesInput}
              value={playerCount}
              disabled={randomizePlayers}
              onChange={(e) => setPlayerCount(e.target.value)}
            />
          </label>
          <label style={styles.settingsField}>
            Courts
            <input
              type="number"
              min={1}
              style={styles.expectedGamesInput}
              value={courtCount}
              disabled={compareCourts}
              onChange={(e) => setCourtCount(e.target.value)}
            />
          </label>
          <label style={styles.settingsField}>
            Games/player
            <input
              type="number"
              min={1}
              style={styles.expectedGamesInput}
              value={expectedGamesPerPlayer}
              onChange={(e) => setExpectedGamesPerPlayer(e.target.value)}
            />
          </label>
          <label style={styles.settingsField}>
            Beginner %
            <input
              type="number"
              min={0}
              max={100}
              style={styles.expectedGamesInput}
              value={Math.round(skillSplit * 100)}
              onChange={(e) => setSkillSplit(Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100)}
            />
          </label>
        </div>

        <label style={styles.devCheckboxRow}>
          <input type="checkbox" checked={randomizePlayers} onChange={(e) => setRandomizePlayers(e.target.checked)} />
          Randomize player count ({MIN_RANDOM_PLAYERS}–{MAX_RANDOM_PLAYERS})
        </label>
        <label style={styles.devCheckboxRow}>
          <input type="checkbox" checked={compareCourts} onChange={(e) => setCompareCourts(e.target.checked)} />
          Compare 2, 3, and 4 courts instead of a single court count
        </label>

        <button style={styles.primaryBtn} onClick={runOne}>
          <Play size={15} strokeWidth={2.5} />
          Run simulation
        </button>
      </div>

      {result && <SingleResult result={result} />}
      {comparison && <ComparisonResult results={comparison} />}
    </div>
  );
}

function SingleResult({ result }) {
  const f = result.fairnessStats;
  return (
    <div style={styles.devSummaryCard}>
      <div style={styles.devSummaryLine}>
        <strong>{result.config.playerCount}</strong> players · <strong>{result.config.courtCount}</strong> courts ·{" "}
        <strong>{result.config.expectedGamesPerPlayer}</strong> expected games/player
      </div>
      <div style={styles.devSummaryLine}>
        <strong>{result.roundsRun}</strong> rounds · <strong>{result.totalMatches}</strong> matches · {result.stopReason}
      </div>
      <div style={styles.devSummaryLine}>
        Phases — Mentorship {result.phaseCounts.mentorship} · Transition {result.phaseCounts.transition} ·
        Competitive {result.phaseCounts.competitive}
      </div>

      <div style={styles.devFairnessRow}>
        <span style={styles.devFairnessScore(f.fairnessScore)}>{f.fairnessScore}</span>
        <div style={styles.devSummaryLine}>
          Fairness Score (games played) — min {f.minGames} · max {f.maxGames} · avg {f.avgGames} · stdDev{" "}
          {f.stdDevGames}
        </div>
      </div>

      <div style={styles.devSectionGap}>
        <SectionLabel>Final standings</SectionLabel>
        <StandingsTable playerSummaries={result.playerSummaries} />
      </div>
    </div>
  );
}

function ComparisonResult({ results }) {
  return (
    <div style={styles.devSummaryCard}>
      <SectionLabel>Court count comparison</SectionLabel>
      <div style={styles.standingsTable}>
        <div style={styles.standingsHeadRow}>
          <span style={styles.standingsRankCol}>CT</span>
          <span style={styles.standingsNameCol}>Rounds / Matches</span>
          <span style={styles.standingsStatCol}>Min</span>
          <span style={styles.standingsStatCol}>Max</span>
          <span style={styles.standingsStatCol}>SD</span>
          <span style={styles.standingsRatingCol}>FS</span>
        </div>
        {results.map((r) => (
          <div key={r.config.courtCount} style={styles.standingsRow}>
            <span style={styles.standingsRankCol}>{r.config.courtCount}</span>
            <span style={styles.standingsNameCol}>
              {r.roundsRun} rounds / {r.totalMatches} matches
            </span>
            <span style={styles.standingsStatCol}>{r.fairnessStats.minGames}</span>
            <span style={styles.standingsStatCol}>{r.fairnessStats.maxGames}</span>
            <span style={styles.standingsStatCol}>{r.fairnessStats.stdDevGames}</span>
            <span style={styles.standingsRatingCol}>
              <span style={styles.ratingBadge(r.fairnessStats.fairnessScore)}>{r.fairnessStats.fairnessScore}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StandingsTable({ playerSummaries }) {
  return (
    <div style={styles.standingsTable}>
      <div style={styles.standingsHeadRow}>
        <span style={styles.standingsRankCol}>#</span>
        <span style={styles.standingsNameCol}>Player</span>
        <span style={styles.standingsStatCol}>GP</span>
        <span style={styles.standingsStatCol}>W</span>
        <span style={styles.standingsStatCol}>L</span>
        <span style={styles.standingsStatCol}>+/-</span>
        <span style={styles.standingsRatingCol}>RTG</span>
      </div>
      {playerSummaries.map((p, i) => (
        <div key={p.id} style={styles.standingsRow}>
          <span style={styles.standingsRankCol}>{i + 1}</span>
          <span style={styles.standingsNameCol}>
            <span style={styles.standingsName}>{p.name}</span>
          </span>
          <span style={styles.standingsStatCol}>{p.games}</span>
          <span style={styles.standingsStatCol}>{p.wins}</span>
          <span style={styles.standingsStatCol}>{p.losses}</span>
          <span
            style={{
              ...styles.standingsStatCol,
              color: p.pointDiff > 0 ? "var(--color-success)" : p.pointDiff < 0 ? "var(--color-error)" : "var(--color-text-faint)",
              fontWeight: 700,
            }}
          >
            {p.pointDiff > 0 ? `+${p.pointDiff}` : p.pointDiff}
          </span>
          <span style={styles.standingsRatingCol}>
            <span style={styles.ratingBadge(p.rating)}>{p.rating === null ? "—" : p.rating}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

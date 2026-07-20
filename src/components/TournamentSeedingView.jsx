import { useEffect, useState } from "react";
import { styles } from "../styles.js";
import { getTournamentEngine, buildSeedingContext } from "../lib/tournament.js";
import { PoolQualificationService } from "../engines/PoolQualificationService.js";
import { getSeedingStrategy } from "../engines/BracketSeeding.js";
import { SEEDING_METHODS } from "../engines/TournamentSettings.js";
import SectionLabel from "./SectionLabel.jsx";

const qualificationService = new PoolQualificationService();

const METHOD_LABELS = Object.fromEntries(SEEDING_METHODS.map((m) => [m.value, m.label]));

// Manual & Advanced Seeding — see PROJECT.md. Qualified Participants/Pool/
// Rank/Seed Number/Seeding Method, a live bracket preview (round 1
// pairings, computed via the selected strategy's previewBracket() — never
// persisted), and — for Manual mode — editable seed-number fields with
// live validation. "Generate Bracket" is the one explicit action every
// non-default method needs (see RoundRobinEngine.updateMatchResult's
// header comment for why Standard Cross-Pool alone still auto-generates).
export default function TournamentSeedingView({ tournament, loading, seedError, onSaveManualSeeds, onGenerateBracket }) {
  const method = tournament?.seedingMethod ?? "standardCrossPool";
  const [draftSeeds, setDraftSeeds] = useState({});
  const [context, setContext] = useState({});
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setDraftSeeds(tournament?.manualSeeds || {});
  }, [tournament?.id, tournament?.manualSeeds]);

  // Rating context needs an async fetch (player ratings live in storage) —
  // built once per tournament/method via the exact same helper
  // saveGenerateBracket actually generates with, so the preview never
  // drifts from what Generate Bracket would really produce. Every other
  // method's context is synchronous and just resolves immediately.
  useEffect(() => {
    let cancelled = false;
    if (!tournament) return;
    const qualification = qualificationService.determineQualifiers(tournament, getTournamentEngine(tournament.format));
    buildSeedingContext(tournament, method, qualification.qualifiedTeams).then((c) => {
      if (!cancelled) setContext(c);
    });
    return () => {
      cancelled = true;
    };
  }, [tournament?.id, tournament?.updatedAt, method]);

  if (loading) return <p style={styles.editHint}>Loading tournament…</p>;
  if (!tournament) {
    return <div style={styles.placeholderCard}>Generate a schedule from the Schedule tab to see seeding here.</div>;
  }
  if (tournament.format !== "roundRobin") {
    return <div style={styles.placeholderCard}>Seeding isn't available for this tournament format yet.</div>;
  }

  const engine = getTournamentEngine(tournament.format);
  const qualification = qualificationService.determineQualifiers(tournament, engine);

  if (tournament.bracket) {
    return (
      <div>
        <SectionLabel>Seeding</SectionLabel>
        <div style={styles.placeholderCard}>
          The bracket has already been generated ({METHOD_LABELS[method]} seeding) — see the Bracket tab.
        </div>
      </div>
    );
  }
  if (!qualification.ready) {
    return (
      <div>
        <SectionLabel>Seeding</SectionLabel>
        <p style={styles.editHint}>Seeding is available once every pool completes and qualification is finalized.</p>
      </div>
    );
  }

  const isManual = method === "manual";
  const liveContext = isManual ? { manualSeeds: draftSeeds } : context;
  const strategy = getSeedingStrategy(method);
  const validation = strategy.validateSeeds(qualification.qualifiedTeams, liveContext);
  const { seeds, pairs } = strategy.previewBracket(qualification.qualifiedTeams, liveContext);
  const seedByParticipant = new Map(seeds.map((s) => [s.participantId, s.seed]));

  const handleSeedChange = (participantId, value) => {
    setDraftSeeds((prev) => ({ ...prev, [participantId]: value === "" ? undefined : Number(value) }));
  };

  const handleSave = () => onSaveManualSeeds(draftSeeds);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await onGenerateBracket();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <SectionLabel>Seeding</SectionLabel>
      <p style={styles.editHint}>Seeding method: {METHOD_LABELS[method]} — change it on the Settings tab before generating.</p>

      <div style={styles.tournamentStandingsScroll}>
        <table style={styles.tournamentStandingsTable}>
          <thead>
            <tr style={styles.tournamentStandingsHeadRow}>
              <th style={styles.tournamentStandingsHeadCell}>Seed</th>
              <th style={{ ...styles.tournamentStandingsHeadCell, textAlign: "left" }}>Participant</th>
              <th style={{ ...styles.tournamentStandingsHeadCell, textAlign: "left" }}>Pool</th>
              <th style={styles.tournamentStandingsHeadCell}>Current Rank</th>
            </tr>
          </thead>
          <tbody>
            {qualification.qualifiedTeams.map((team) => (
              <tr key={team.participantId} style={styles.tournamentStandingsRow(99)}>
                <td style={styles.tournamentStandingsCell}>
                  {isManual ? (
                    <input
                      type="number"
                      min={1}
                      max={qualification.qualifiedTeams.length}
                      style={styles.expectedGamesInput}
                      value={draftSeeds[team.participantId] ?? ""}
                      onChange={(e) => handleSeedChange(team.participantId, e.target.value)}
                    />
                  ) : (
                    seedByParticipant.get(team.participantId) ?? "—"
                  )}
                </td>
                <td style={styles.tournamentStandingsNameCell}>{team.label}</td>
                <td style={styles.tournamentStandingsCell}>{team.poolLabel}</td>
                <td style={styles.tournamentStandingsCell}>{team.rank}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isManual && (
        <div style={styles.editActions}>
          <button type="button" style={styles.secondaryBtn} onClick={handleSave}>
            Save Seeds
          </button>
        </div>
      )}

      {!validation.valid && <p style={styles.editWarning}>{validation.errors.join(" ")}</p>}
      {seedError && <p style={styles.editWarning}>{seedError}</p>}

      <h3 style={styles.poolHeading}>Bracket Preview — Round 1</h3>
      {validation.valid ? (
        <ul style={styles.qualifiersList}>
          {pairs.map((pair, i) => (
            <li key={i} style={styles.qualifiersListItem}>
              <span>
                #{pair.seedA.seed} {pair.seedA.label}
              </span>
              <span>vs</span>
              <span>
                #{pair.seedB.seed} {pair.seedB.label}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p style={styles.editHint}>Resolve the seeding issue above to see a bracket preview.</p>
      )}

      <div style={styles.editActions}>
        <button type="button" style={{ ...styles.primaryBtn, ...(!validation.valid || generating ? styles.btnDisabled : {}) }} disabled={!validation.valid || generating} onClick={handleGenerate}>
          {generating ? "Generating…" : "Generate Bracket"}
        </button>
      </div>
    </div>
  );
}

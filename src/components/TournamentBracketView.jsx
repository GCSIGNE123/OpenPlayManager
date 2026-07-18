import { styles } from "../styles.js";
import { getTournamentEngine } from "../lib/tournament.js";
import { SingleEliminationBracketGenerator } from "../engines/SingleEliminationBracketGenerator.js";
import SectionLabel from "./SectionLabel.jsx";

const bracketGenerator = new SingleEliminationBracketGenerator();

const STATUS_LABELS = { pending: "Pending", inProgress: "In Progress", completed: "Completed" };

// One bracket match card — shows both seed slots (a real seeded team, or an
// empty "TBD" slot for a round no team has advanced into yet, since no
// winner-advancement logic exists this milestone) plus a status badge and a
// placeholder court field (explicitly asked for — no real court assignment
// is implemented here either).
function BracketMatchCard({ match }) {
  return (
    <div style={styles.historyMatchCard}>
      <div style={styles.historyMatchHead}>
        <span style={styles.courtBadge}>COURT TBD</span>
        <span style={styles.matchStatusBadge(match.status)}>{STATUS_LABELS[match.status]}</span>
      </div>
      <div style={styles.historyMatchTeams}>
        {[match.teamA, match.teamB].map((team, i) => (
          <div key={i} style={styles.historyTeamLine}>
            {team ? (
              <>
                <span style={styles.bracketSeedTag}>#{team.seed}</span>
                <span>{team.label}</span>
              </>
            ) : (
              <span style={styles.bracketTbdLabel}>TBD</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketRoundColumn({ round }) {
  return (
    <div style={styles.bracketRoundColumn}>
      <h3 style={styles.poolHeading}>{round.name}</h3>
      {round.matches.map((m) => (
        <BracketMatchCard key={m.id} match={m} />
      ))}
    </div>
  );
}

// Bracket tab — see PROJECT.md's Playoff Bracket Generation section.
// SingleEliminationBracketGenerator is pure derived data (same pattern as
// Standings/Qualification): recomputed from the tournament's qualified
// teams on every render, nothing persisted, nothing to keep in sync. Only
// wired up for Round Robin so far, matching Standings/Qualification's own
// scope. Match scoring, winner advancement, and real court assignment are
// explicitly out of scope this milestone — every match here is `pending`
// and every non-round-1 slot is "TBD".
export default function TournamentBracketView({ tournament, loading }) {
  if (loading) return <p style={styles.editHint}>Loading tournament…</p>;
  if (!tournament) {
    return <div style={styles.placeholderCard}>Generate a schedule from the Schedule tab to see the bracket here.</div>;
  }
  if (tournament.format !== "roundRobin") {
    return <div style={styles.placeholderCard}>Bracket generation isn't available for this tournament format yet.</div>;
  }

  const engine = getTournamentEngine(tournament.format);
  const bracket = bracketGenerator.generateBracket(tournament, engine);

  if (!bracket.ready && bracket.reason === "unsupported_size") {
    return (
      <div>
        <SectionLabel>Bracket</SectionLabel>
        <div style={styles.placeholderCard}>
          Bracket generation needs a power-of-two number of qualified teams (2, 4, 8, 16, …) — currently {bracket.size}.
          Adjust Teams Advancing Per Pool on the Schedule tab so the qualifier count lands on one of those sizes.
        </div>
      </div>
    );
  }

  if (!bracket.ready) {
    return (
      <div>
        <SectionLabel>Bracket</SectionLabel>
        <div style={styles.placeholderCard}>
          The bracket is generated once every pool has finished and qualified teams are determined. Check the
          Qualification tab once the Schedule tab's remaining matches are complete.
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionLabel>Bracket</SectionLabel>
      <p style={styles.editHint}>{bracket.size}-team elimination bracket, seeded by Standard Cross-Pool Seeding.</p>
      <div style={styles.bracketScroll}>
        {bracket.rounds.map((round) => (
          <BracketRoundColumn key={round.roundNumber} round={round} />
        ))}
      </div>
    </div>
  );
}

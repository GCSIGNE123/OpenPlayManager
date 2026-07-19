import { useState } from "react";
import { styles } from "../styles.js";
import { LeagueStandingsService } from "../engines/LeagueStandingsService.js";
import { TournamentReportService } from "../engines/TournamentReportService.js";
import { ExportService } from "../engines/ExportService.js";
import SectionLabel from "./SectionLabel.jsx";

const standingsService = new LeagueStandingsService();
const reportService = new TournamentReportService();
const exportService = new ExportService();

function formatDate(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Every real (non-bye) match across every division, tagged with its
// division/week — the same "walk every pool's rounds" traversal
// CourtAssignmentService/TournamentReportService already established,
// reused here for the Dashboard's Upcoming/Completed lists.
function collectAllMatches(season) {
  const matches = [];
  for (const pool of season.pools) {
    for (const week of pool.rounds) {
      for (const match of week.matches) {
        if (!match.isBye) matches.push({ match, week, divisionName: pool.label });
      }
    }
  }
  return matches;
}

// "Current Week" — the earliest week, across any division, that still has
// an unfinished match; once every week in every division is done, the
// season's last week is shown instead.
function currentWeekNumber(season) {
  const allWeeks = season.pools.flatMap((p) => p.rounds);
  const active = allWeeks.find((w) => w.status !== "completed");
  if (active) return active.weekNumber;
  return Math.max(...allWeeks.map((w) => w.weekNumber));
}

function MatchRow({ entry, onStart, onEnterScore }) {
  const { match, week, divisionName } = entry;
  return (
    <li style={styles.rosterItem}>
      <span style={{ fontWeight: 700 }}>
        {divisionName} · Wk {week.weekNumber}
      </span>
      <span style={styles.queueSourceTag}>{formatDate(week.matchDate)}</span>
      <span>{match.teamA.label} vs {match.teamB.label}</span>
      <span style={styles.matchStatusBadge(match.status)}>
        {match.status === "inProgress" ? "In Progress" : match.status === "completed" ? "Completed" : "Pending"}
      </span>
      {match.status === "completed" && (
        <span style={styles.queueGames}>
          {match.score.teamA}–{match.score.teamB}
        </span>
      )}
      {match.status === "pending" && (
        <button style={styles.checkInTapBtn} onClick={() => onStart(match.id)}>
          Start
        </button>
      )}
      {match.status === "inProgress" && (
        <button style={styles.checkInTapBtn} onClick={() => onEnterScore(match)}>
          Enter score
        </button>
      )}
    </li>
  );
}

function ScoreEntryForm({ match, onSave, onCancel }) {
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [winnerId, setWinnerId] = useState(null);
  const [error, setError] = useState("");

  const save = async () => {
    setError("");
    try {
      await onSave(match.id, { scoreA, scoreB, winnerId });
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div style={styles.tournamentSetupCard}>
      <p style={styles.editHint}>
        {match.teamA.label} vs {match.teamB.label}
      </p>
      <div style={styles.scoreInputRow}>
        <label style={styles.scoreInputField}>
          {match.teamA.label}
          <input style={styles.expectedGamesInput} type="number" min={0} value={scoreA} onChange={(e) => setScoreA(e.target.value)} />
        </label>
        <label style={styles.scoreInputField}>
          {match.teamB.label}
          <input style={styles.expectedGamesInput} type="number" min={0} value={scoreB} onChange={(e) => setScoreB(e.target.value)} />
        </label>
      </div>
      <div style={styles.winnerSelectRow}>
        <button type="button" style={styles.winnerSelectBtn(winnerId === match.teamA.id)} onClick={() => setWinnerId(match.teamA.id)}>
          {match.teamA.label} wins
        </button>
        <button type="button" style={styles.winnerSelectBtn(winnerId === match.teamB.id)} onClick={() => setWinnerId(match.teamB.id)}>
          {match.teamB.label} wins
        </button>
      </div>
      {error && <p style={styles.editWarning}>{error}</p>}
      <div style={styles.editActions}>
        <button type="button" style={styles.secondaryBtn} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" style={styles.primaryBtn} onClick={save}>
          Save result
        </button>
      </div>
    </div>
  );
}

function StandingsTable({ divisionName, rows }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h3 style={styles.poolHeading}>{divisionName}</h3>
      <div style={styles.tournamentStandingsScroll}>
        <table style={styles.tournamentStandingsTable}>
          <thead>
            <tr style={styles.tournamentStandingsHeadRow}>
              <th style={styles.tournamentStandingsHeadCell}>#</th>
              <th style={{ ...styles.tournamentStandingsHeadCell, textAlign: "left" }}>Player</th>
              <th style={styles.tournamentStandingsHeadCell}>W</th>
              <th style={styles.tournamentStandingsHeadCell}>L</th>
              <th style={styles.tournamentStandingsHeadCell}>Games Won</th>
              <th style={styles.tournamentStandingsHeadCell}>Games Lost</th>
              <th style={styles.tournamentStandingsHeadCell}>+/-</th>
              <th style={styles.tournamentStandingsHeadCell}>League Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.participantId} style={styles.tournamentStandingsRow(row.rank)}>
                <td style={styles.tournamentStandingsCell}>{row.rank}</td>
                <td style={styles.tournamentStandingsNameCell}>{row.label}</td>
                <td style={styles.tournamentStandingsCell}>{row.wins}</td>
                <td style={styles.tournamentStandingsCell}>{row.losses}</td>
                <td style={styles.tournamentStandingsCell}>{row.pointsFor}</td>
                <td style={styles.tournamentStandingsCell}>{row.pointsAgainst}</td>
                <td style={styles.tournamentStandingsCell}>{row.pointDiff > 0 ? `+${row.pointDiff}` : row.pointDiff}</td>
                <td style={styles.tournamentStandingsCell}>{row.leaguePoints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "standings", label: "Standings" },
  { id: "rankings", label: "Player Rankings" },
  { id: "reports", label: "Reports" },
];

// League Season Dashboard — see PROJECT.md's League Management section.
// `season` is a full LeagueSeason record (Tournament-shaped, see
// lib/leagueModel.js); `onSave` is called with the updated season after
// every mutating action (start/score/swap), following the same
// "call the lib function, replace the local season" shape
// TournamentDashboardView's handlers already use.
export default function LeagueSeasonDashboardView({ season, onSave, onBack, onStartMatch, onEnterScore, onSwap }) {
  const [tab, setTab] = useState("overview");
  const [scoringMatch, setScoringMatch] = useState(null);
  const [error, setError] = useState("");

  const allMatches = collectAllMatches(season);
  const upcoming = allMatches.filter((e) => e.match.status !== "completed");
  const completed = allMatches.filter((e) => e.match.status === "completed");
  const week = currentWeekNumber(season);

  const handleStart = async (matchId) => {
    setError("");
    try {
      await onStartMatch(matchId);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSaveScore = async (matchId, result) => {
    await onEnterScore(matchId, result);
    setScoringMatch(null);
  };

  const divisionStandings = standingsService.getAllDivisionStandings(season);
  const rankings = standingsService.getPlayerRankings(season);

  const printReport = (report) => {
    exportService.exportPDF();
  };

  return (
    <div style={styles.createWrap}>
      <button style={styles.backBtn} onClick={onBack}>
        Back
      </button>
      <SectionLabel>{season.name}</SectionLabel>
      <p style={styles.editHint}>
        {season.season} · {season.matchDay}s at {season.matchTime} · Week {week}
      </p>

      <div style={styles.dashboardTabRow}>
        {TABS.map((t) => (
          <button key={t.id} type="button" style={styles.dashboardTabBtn(tab === t.id)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <p style={styles.editWarning}>{error}</p>}

      {tab === "overview" && (
        <div>
          {scoringMatch && (
            <ScoreEntryForm match={scoringMatch} onSave={handleSaveScore} onCancel={() => setScoringMatch(null)} />
          )}
          <SectionLabel>Upcoming Matches</SectionLabel>
          {upcoming.length === 0 ? (
            <p style={styles.emptyQueue}>No upcoming matches — season complete.</p>
          ) : (
            <ul style={styles.rosterList}>
              {upcoming.map((entry) => (
                <MatchRow key={entry.match.id} entry={entry} onStart={handleStart} onEnterScore={setScoringMatch} />
              ))}
            </ul>
          )}
          <SectionLabel>Completed Matches</SectionLabel>
          {completed.length === 0 ? (
            <p style={styles.emptyQueue}>No completed matches yet.</p>
          ) : (
            <ul style={styles.rosterList}>
              {completed.map((entry) => (
                <MatchRow key={entry.match.id} entry={entry} onStart={handleStart} onEnterScore={setScoringMatch} />
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "standings" && (
        <div>
          <SectionLabel>Division Standings</SectionLabel>
          {divisionStandings.map((d) => (
            <StandingsTable key={d.poolId} divisionName={d.divisionName} rows={d.rows} />
          ))}
        </div>
      )}

      {tab === "rankings" && (
        <div>
          <SectionLabel>Player Rankings</SectionLabel>
          <div style={styles.tournamentStandingsScroll}>
            <table style={styles.tournamentStandingsTable}>
              <thead>
                <tr style={styles.tournamentStandingsHeadRow}>
                  <th style={{ ...styles.tournamentStandingsHeadCell, textAlign: "left" }}>Player</th>
                  <th style={{ ...styles.tournamentStandingsHeadCell, textAlign: "left" }}>Division</th>
                  <th style={styles.tournamentStandingsHeadCell}>League Pts</th>
                  <th style={styles.tournamentStandingsHeadCell}>W</th>
                  <th style={styles.tournamentStandingsHeadCell}>L</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((row, i) => (
                  <tr key={`${row.divisionName}-${row.participantId}`} style={styles.tournamentStandingsRow(i + 1)}>
                    <td style={styles.tournamentStandingsNameCell}>{row.label}</td>
                    <td style={styles.tournamentStandingsCell}>{row.divisionName}</td>
                    <td style={styles.tournamentStandingsCell}>{row.leaguePoints}</td>
                    <td style={styles.tournamentStandingsCell}>{row.wins}</td>
                    <td style={styles.tournamentStandingsCell}>{row.losses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "reports" && (
        <div>
          <SectionLabel>Reports</SectionLabel>
          <p style={styles.editHint}>Reuses the Tournament Manager's own report generation and export.</p>
          <div style={styles.editActions}>
            <button style={styles.secondaryBtn} onClick={() => printReport(reportService.generateTournamentSummary(season))}>
              Print Season Summary
            </button>
            <button
              style={styles.secondaryBtn}
              onClick={() => exportService.exportCSV(reportService.generateMatchReport(season))}
            >
              Export Match Results CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

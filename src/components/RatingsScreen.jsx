import { useEffect, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { styles } from "../styles.js";
import { fetchAllPlayers, filterPlayersByQuery } from "../lib/playerDatabase.js";
import { fetchPlayerRating } from "../lib/ratingModel.js";
import { fetchRatingHistory } from "../lib/ratingModel.js";
import { RatingEngine } from "../engines/RatingEngine.js";
import { RatingLeaderboardService } from "../engines/RatingLeaderboardService.js";
import { fetchAchievements } from "../engines/AchievementService.js";
import SectionLabel from "./SectionLabel.jsx";

const ratingEngine = new RatingEngine();
const leaderboardService = new RatingLeaderboardService();

const ACHIEVEMENT_LABELS = {
  firstWin: "🏓 First Win",
  wins10: "🥉 10 Wins",
  wins50: "🥈 50 Wins",
  wins100: "🥇 100 Wins",
  tournamentChampion: "🏆 Tournament Champion",
  leagueChampion: "🏆 League Champion",
  kingSlayer: "👑 King Slayer",
};

function formatTrend(trend) {
  if (trend > 0) return `+${trend}`;
  if (trend < 0) return String(trend);
  return "±0";
}

// A minimal inline sparkline — no charting library, just a polyline over
// the player's rating history (ratingAfter per entry). Kept intentionally
// small; this is the "Rating Chart" the spec asks for, not a full charting
// surface.
function RatingChart({ history }) {
  if (history.length < 2) return <p style={styles.editHint}>Not enough history yet for a chart.</p>;
  const values = history.map((h) => h.ratingAfter);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 320;
  const height = 80;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ maxWidth: 360 }}>
      <polyline points={points} fill="none" stroke="var(--court)" strokeWidth="2" />
    </svg>
  );
}

const LEADERBOARD_TABS = [
  { id: "overall", label: "Overall" },
  { id: "monthly", label: "Monthly" },
  { id: "annual", label: "Annual" },
  { id: "improved", label: "Most Improved" },
  { id: "winPct", label: "Highest Win %" },
  { id: "mostMatches", label: "Most Matches" },
];

function LeaderboardPanel({ playersById }) {
  const [tab, setTab] = useState("overall");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const loaders = {
      overall: () => leaderboardService.getOverallRanking(),
      monthly: () => leaderboardService.getMonthlyRanking(),
      annual: () => leaderboardService.getAnnualRanking(),
      improved: () => leaderboardService.getMostImproved(),
      winPct: () => leaderboardService.getHighestWinPct(),
      mostMatches: () => leaderboardService.getMostMatchesPlayed(),
    };
    loaders[tab]().then(setRows).finally(() => setLoading(false));
  }, [tab]);

  const nameFor = (playerId) => playersById[playerId]?.displayName || "Unknown";

  return (
    <div>
      <div style={styles.dashboardTabRow}>
        {LEADERBOARD_TABS.map((t) => (
          <button key={t.id} type="button" style={styles.dashboardTabBtn(tab === t.id)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {loading ? (
        <p style={styles.editHint}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={styles.editHint}>No rated matches yet.</p>
      ) : (
        <div style={styles.tournamentStandingsScroll}>
          <table style={styles.tournamentStandingsTable}>
            <thead>
              <tr style={styles.tournamentStandingsHeadRow}>
                <th style={styles.tournamentStandingsHeadCell}>#</th>
                <th style={{ ...styles.tournamentStandingsHeadCell, textAlign: "left" }}>Player</th>
                <th style={styles.tournamentStandingsHeadCell}>
                  {tab === "improved" || tab === "monthly" || tab === "annual" ? "Net Change" : tab === "winPct" ? "Win %" : tab === "mostMatches" ? "Matches" : "Rating"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.playerId} style={styles.tournamentStandingsRow(row.rank)}>
                  <td style={styles.tournamentStandingsCell}>{row.rank}</td>
                  <td style={styles.tournamentStandingsNameCell}>{nameFor(row.playerId)}</td>
                  <td style={styles.tournamentStandingsCell}>
                    {tab === "improved" || tab === "monthly" || tab === "annual"
                      ? formatTrend(row.netChange)
                      : tab === "winPct"
                        ? `${Math.round(row.winPct * 100)}%`
                        : tab === "mostMatches"
                          ? row.totalMatches
                          : row.currentRating}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PlayerProfilePanel({ allPlayers }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [rating, setRating] = useState(null);
  const [history, setHistory] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(false);

  const results = filterPlayersByQuery(allPlayers, query);
  const playersById = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  const openProfile = async (playerId) => {
    setSelectedId(playerId);
    setLoading(true);
    const [r, h, a] = await Promise.all([fetchPlayerRating(playerId), fetchRatingHistory(playerId), fetchAchievements(playerId)]);
    setRating(r);
    setHistory(h);
    setAchievements(a);
    setLoading(false);
  };

  if (!selectedId) {
    return (
      <div>
        <div style={styles.historySearchBox}>
          <Search size={14} strokeWidth={2.5} />
          <input style={styles.historySearchInput} placeholder="Search players…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <ul style={styles.rosterList}>
          {results.map((p) => (
            <li key={p.id} style={styles.rosterItem}>
              <span style={{ fontWeight: 700 }}>{p.displayName}</span>
              <button style={styles.checkInTapBtn} onClick={() => openProfile(p.id)}>
                View profile
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (loading) return <p style={styles.editHint}>Loading profile…</p>;

  const view = rating ? ratingEngine.deriveRatingView(rating) : null;
  const recentForm = history.slice(-10).reverse();
  const partnerCounts = {};
  const opponentCounts = {};
  for (const h of history) {
    if (h.partnerId) partnerCounts[h.partnerId] = (partnerCounts[h.partnerId] || 0) + 1;
    if (h.opponentId) opponentCounts[h.opponentId] = (opponentCounts[h.opponentId] || 0) + 1;
  }
  const topOf = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const favoritePartnerId = topOf(partnerCounts);
  const frequentOpponentId = topOf(opponentCounts);
  const nameFor = (id) => playersById[id]?.displayName || "Unknown";

  return (
    <div>
      <button style={styles.backBtn} onClick={() => setSelectedId(null)}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back to search
      </button>
      <SectionLabel>{nameFor(selectedId)}</SectionLabel>

      {!view ? (
        <p style={styles.editHint}>No rated matches yet for this player.</p>
      ) : (
        <>
          <div style={styles.sessionInfoCard}>
            <div style={styles.sessionInfoItem}>
              <span style={styles.sessionInfoLabel}>Current Rating</span>
              <span style={styles.sessionInfoValue}>{view.currentRating}</span>
            </div>
            <div style={styles.sessionInfoItem}>
              <span style={styles.sessionInfoLabel}>Previous Rating</span>
              <span style={styles.sessionInfoValue}>{view.previousRating}</span>
            </div>
            <div style={styles.sessionInfoItem}>
              <span style={styles.sessionInfoLabel}>Highest Rating</span>
              <span style={styles.sessionInfoValue}>{view.highestRating}</span>
            </div>
            <div style={styles.sessionInfoItem}>
              <span style={styles.sessionInfoLabel}>Trend</span>
              <span style={styles.sessionInfoValue}>{formatTrend(view.trend)}</span>
            </div>
            <div style={styles.sessionInfoItem}>
              <span style={styles.sessionInfoLabel}>Total Matches</span>
              <span style={styles.sessionInfoValue}>{view.totalMatches}</span>
            </div>
            <div style={styles.sessionInfoItem}>
              <span style={styles.sessionInfoLabel}>Wins</span>
              <span style={styles.sessionInfoValue}>{view.wins}</span>
            </div>
            <div style={styles.sessionInfoItem}>
              <span style={styles.sessionInfoLabel}>Losses</span>
              <span style={styles.sessionInfoValue}>{view.losses}</span>
            </div>
            <div style={styles.sessionInfoItem}>
              <span style={styles.sessionInfoLabel}>Win %</span>
              <span style={styles.sessionInfoValue}>{Math.round(view.winPct * 100)}%</span>
            </div>
          </div>

          <h3 style={styles.poolHeading}>Rating Chart</h3>
          <RatingChart history={history} />

          <h3 style={styles.poolHeading}>Recent Form (Last 10)</h3>
          <p style={styles.editHint}>
            {recentForm.length === 0 ? "—" : recentForm.map((h) => (h.result === "win" ? "W" : "L")).join(" ")}
          </p>

          <h3 style={styles.poolHeading}>Favorite Partner / Most Frequent Opponent</h3>
          <p style={styles.editHint}>
            Favorite partner: {favoritePartnerId ? nameFor(favoritePartnerId) : "—"} · Most frequent opponent:{" "}
            {frequentOpponentId ? nameFor(frequentOpponentId) : "—"}
          </p>

          <h3 style={styles.poolHeading}>Achievements</h3>
          {achievements.length === 0 ? (
            <p style={styles.editHint}>No achievements yet.</p>
          ) : (
            <p style={styles.editHint}>{achievements.map((a) => ACHIEVEMENT_LABELS[a.type] || a.type).join("   ")}</p>
          )}

          <h3 style={styles.poolHeading}>Rating History</h3>
          <ul style={styles.rosterList}>
            {[...history].reverse().map((h) => (
              <li key={h.id} style={styles.rosterItem}>
                <span>{new Date(h.recordedAt).toLocaleDateString()}</span>
                <span style={styles.queueSourceTag}>{h.source}</span>
                <span>{h.result === "win" ? "Won" : "Lost"}</span>
                <span>
                  {h.ratingBefore} → {h.ratingAfter} ({formatTrend(h.delta)})
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const TABS = [
  { id: "leaderboards", label: "Leaderboards" },
  { id: "profile", label: "Player Profile" },
];

// Club Rating & Ranking Engine — see PROJECT.md. Reached from the landing
// page. Both panels are pure read surfaces over PlayerRating/RatingHistory/
// Achievement records — nothing here writes anything; ratings only ever
// update via the match-completion hooks in lib/tournament.js/lib/league.js/
// PickleballOpenPlay.jsx.
export default function RatingsScreen({ onBack }) {
  const [tab, setTab] = useState("leaderboards");
  const [allPlayers, setAllPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllPlayers()
      .then(setAllPlayers)
      .finally(() => setLoading(false));
  }, []);

  const playersById = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  return (
    <div style={styles.createWrap}>
      <button style={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>
      <SectionLabel>Club Ratings & Rankings</SectionLabel>

      <div style={styles.dashboardTabRow}>
        {TABS.map((t) => (
          <button key={t.id} type="button" style={styles.dashboardTabBtn(tab === t.id)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={styles.editHint}>Loading…</p>
      ) : tab === "leaderboards" ? (
        <LeaderboardPanel playersById={playersById} />
      ) : (
        <PlayerProfilePanel allPlayers={allPlayers} />
      )}
    </div>
  );
}

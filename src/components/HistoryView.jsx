import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Search, X } from "lucide-react";
import { styles } from "../styles.js";
import Avatar from "./Avatar.jsx";
import SectionLabel from "./SectionLabel.jsx";

function teamLabel(ids, players) {
  return ids.map((id) => players[id]?.name || "Unknown").join(" + ");
}

function formatDateTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function downloadFile(content, mimeType, filename) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// CSV/JSON export both read straight from matchHistory (see PROJECT.md —
// it's already stored in a reusable, denormalized-friendly shape: round,
// court, teamA/teamB player ids, scores, winner, endedAt, phase). Exporting
// resolves ids to names at export time since matchHistory itself only
// stores ids (so a later name edit can't retroactively change history).
function exportHistoryCsv(matchHistory, players) {
  const header = ["Round", "Court", "Team A", "Team B", "Score A", "Score B", "Winner", "Date/Time", "Phase"];
  const rows = matchHistory.map((m) => [
    m.round,
    m.court,
    teamLabel(m.teamA, players),
    teamLabel(m.teamB, players),
    m.scoreA,
    m.scoreB,
    m.winner === "A" ? teamLabel(m.teamA, players) : m.winner === "B" ? teamLabel(m.teamB, players) : "Tie",
    formatDateTime(m.endedAt),
    m.phase || "",
  ]);
  const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(escape).join(",")).join("\r\n");
  downloadFile(csv, "text/csv;charset=utf-8", "open-play-history.csv");
}

function exportHistoryJson(matchHistory, players) {
  const withNames = matchHistory.map((m) => ({
    ...m,
    teamANames: m.teamA.map((id) => players[id]?.name || "Unknown"),
    teamBNames: m.teamB.map((id) => players[id]?.name || "Unknown"),
  }));
  downloadFile(JSON.stringify(withNames, null, 2), "application/json", "open-play-history.json");
}

function TeamLine({ ids, players, score, isWinner, onSelectPlayer }) {
  return (
    <div style={styles.historyTeamLine}>
      <div style={styles.teamPlayers}>
        {ids.map((id) => (
          <button key={id} style={styles.historyPlayerLink} onClick={() => onSelectPlayer(id)}>
            <Avatar player={players[id]} size={18} />
            <span>{players[id]?.name || "Unknown"}</span>
          </button>
        ))}
      </div>
      <span style={{ ...styles.historyScore, ...(isWinner ? styles.historyScoreWin : {}) }}>{score}</span>
    </div>
  );
}

function RoundCard({ round, matches, players, expanded, onToggle, onSelectPlayer }) {
  return (
    <div style={styles.historyRoundCard}>
      <button style={styles.historyRoundHead} onClick={onToggle}>
        {expanded ? <ChevronDown size={14} strokeWidth={2.5} /> : <ChevronRight size={14} strokeWidth={2.5} />}
        <span>Round {round}</span>
        <span style={styles.historyRoundCount}>
          {matches.length} game{matches.length === 1 ? "" : "s"}
        </span>
      </button>
      {expanded && (
        <div style={styles.historyRoundBody}>
          {matches.map((m) => (
            <div key={`${m.round}-${m.court}`} style={styles.historyMatchCard}>
              <div style={styles.historyMatchHead}>
                <span style={styles.courtBadge}>COURT {m.court}</span>
                <span style={styles.historyMatchTime}>{formatDateTime(m.endedAt)}</span>
              </div>
              <div style={styles.historyMatchTeams}>
                <TeamLine
                  ids={m.teamA}
                  players={players}
                  score={m.scoreA}
                  isWinner={m.winner === "A"}
                  onSelectPlayer={onSelectPlayer}
                />
                <div style={styles.vsLine} />
                <TeamLine
                  ids={m.teamB}
                  players={players}
                  score={m.scoreB}
                  isWinner={m.winner === "B"}
                  onSelectPlayer={onSelectPlayer}
                />
              </div>
              <p style={styles.historyWinnerLine}>
                Winner:{" "}
                <strong>
                  {m.winner === "A"
                    ? teamLabel(m.teamA, players)
                    : m.winner === "B"
                      ? teamLabel(m.teamB, players)
                      : "Tie"}
                </strong>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Player History: every completed game this player was part of, plus who
// their partner/opponents were and the result — drawn straight from
// matchHistory (read-only), so it can never drift from what actually
// happened even if pairings or the schedule change afterward.
function PlayerHistoryPanel({ playerId, players, matchHistory, onClose }) {
  const player = players[playerId];
  const matches = [...matchHistory]
    .filter((m) => m.teamA.includes(playerId) || m.teamB.includes(playerId))
    .sort((a, b) => a.round - b.round);
  const courtsPlayed = [...new Set(matches.map((m) => m.court))].sort((a, b) => a - b);
  const wins = matches.filter((m) => {
    const onTeamA = m.teamA.includes(playerId);
    return m.winner === (onTeamA ? "A" : "B");
  }).length;

  return (
    <div style={styles.historyPlayerPanel}>
      <div style={styles.historyPlayerPanelHead}>
        <div style={styles.playerChip}>
          <Avatar player={player} size={24} />
          <strong>{player?.name || "Unknown player"}</strong>
        </div>
        <button style={styles.subBtn} onClick={onClose} aria-label="Close player history">
          <X size={11} strokeWidth={3} />
        </button>
      </div>
      <p style={styles.historyRoundTag}>
        {matches.length} game{matches.length === 1 ? "" : "s"} played · {wins}W–{matches.length - wins}L · courts:{" "}
        {courtsPlayed.join(", ") || "—"}
      </p>
      {matches.length === 0 ? (
        <p style={styles.editWarning}>No completed games yet.</p>
      ) : (
        matches.map((m) => {
          const onTeamA = m.teamA.includes(playerId);
          const partnerId = (onTeamA ? m.teamA : m.teamB).find((id) => id !== playerId);
          const opponentIds = onTeamA ? m.teamB : m.teamA;
          const own = onTeamA ? m.scoreA : m.scoreB;
          const opp = onTeamA ? m.scoreB : m.scoreA;
          const won = m.winner === (onTeamA ? "A" : "B");
          return (
            <div key={`${m.round}-${m.court}`} style={styles.historyPlayerRow}>
              <span style={styles.historyRoundTag}>
                Round {m.round} · Court {m.court}
              </span>
              <span>Partner: {players[partnerId]?.name || "—"}</span>
              <span>Opponents: {opponentIds.map((id) => players[id]?.name || "Unknown").join(", ")}</span>
              <span style={{ color: won ? "var(--color-success)" : "var(--color-error)", fontWeight: 700 }}>
                {won ? "Won" : "Lost"} {own}–{opp}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

// Read-only log of every completed game this session, grouped by "round" —
// matchHistory's round field is the order matches actually finished in
// (see PROJECT.md: courts run continuously, not in synchronized rounds
// across the whole session, so this is a completion sequence rather than a
// "everyone plays round N together" batch). Nothing here writes to
// matchHistory or any other state — it only reads state.matchHistory,
// exactly as Standings reads state.players.
export default function HistoryView({ matchHistory, players }) {
  const [search, setSearch] = useState("");
  const [roundFilter, setRoundFilter] = useState("");
  const [courtFilter, setCourtFilter] = useState("");
  const [toggledRounds, setToggledRounds] = useState(() => new Set());
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  const rounds = useMemo(
    () => [...new Set(matchHistory.map((m) => m.round))].sort((a, b) => a - b),
    [matchHistory]
  );
  const courtsPlayed = useMemo(
    () => [...new Set(matchHistory.map((m) => m.court))].sort((a, b) => a - b),
    [matchHistory]
  );
  const mostRecentRound = rounds.length ? rounds[rounds.length - 1] : null;

  const query = search.trim().toLowerCase();
  const filtered = matchHistory.filter((m) => {
    if (roundFilter && String(m.round) !== roundFilter) return false;
    if (courtFilter && String(m.court) !== courtFilter) return false;
    if (!query) return true;
    if (String(m.round) === query || String(m.court) === query) return true;
    const names = [...m.teamA, ...m.teamB].map((id) => players[id]?.name?.toLowerCase() || "");
    return names.some((n) => n.includes(query));
  });

  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((m) => {
      if (!map.has(m.round)) map.set(m.round, []);
      map.get(m.round).push(m);
    });
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [filtered]);

  const toggleRound = (round) => {
    setToggledRounds((prev) => {
      const next = new Set(prev);
      if (next.has(round)) next.delete(round);
      else next.add(round);
      return next;
    });
  };
  // default: only the most recently completed round starts expanded, every
  // earlier round is collapsed — toggling flips that default per round
  const isExpanded = (round) => {
    const defaultOpen = round === mostRecentRound;
    return toggledRounds.has(round) ? !defaultOpen : defaultOpen;
  };

  return (
    <div>
      <SectionLabel>Game History</SectionLabel>

      {matchHistory.length > 0 && (
        <div style={styles.historyToolbar}>
          <div style={styles.historySearchBox}>
            <Search size={14} strokeWidth={2.5} />
            <input
              style={styles.historySearchInput}
              placeholder="Search by player, round, or court…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select style={styles.rotationSelect} value={roundFilter} onChange={(e) => setRoundFilter(e.target.value)}>
            <option value="">All rounds</option>
            {rounds.map((r) => (
              <option key={r} value={r}>
                Round {r}
              </option>
            ))}
          </select>
          <select style={styles.rotationSelect} value={courtFilter} onChange={(e) => setCourtFilter(e.target.value)}>
            <option value="">All courts</option>
            {courtsPlayed.map((c) => (
              <option key={c} value={c}>
                Court {c}
              </option>
            ))}
          </select>
          <button style={styles.secondaryBtn} onClick={() => exportHistoryCsv(matchHistory, players)}>
            <Download size={14} strokeWidth={2.5} />
            CSV
          </button>
          <button style={styles.secondaryBtn} onClick={() => exportHistoryJson(matchHistory, players)}>
            <Download size={14} strokeWidth={2.5} />
            JSON
          </button>
        </div>
      )}

      {selectedPlayerId && (
        <PlayerHistoryPanel
          playerId={selectedPlayerId}
          players={players}
          matchHistory={matchHistory}
          onClose={() => setSelectedPlayerId(null)}
        />
      )}

      {matchHistory.length === 0 ? (
        <p style={styles.emptyQueue}>No completed games yet — history fills in as matches end.</p>
      ) : grouped.length === 0 ? (
        <p style={styles.editWarning}>No games match your filters.</p>
      ) : (
        grouped.map(([round, matches]) => (
          <RoundCard
            key={round}
            round={round}
            matches={matches}
            players={players}
            expanded={isExpanded(round)}
            onToggle={() => toggleRound(round)}
            onSelectPlayer={setSelectedPlayerId}
          />
        ))
      )}
    </div>
  );
}

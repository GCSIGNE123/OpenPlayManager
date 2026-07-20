import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Archive, Search, Trash2 } from "lucide-react";
import { styles } from "../styles.js";
import { fetchAllTournaments } from "../lib/tournamentModel.js";
import { saveArchiveTournament, removeTournament } from "../lib/tournament.js";
import { TournamentHistoryService } from "../engines/TournamentHistoryService.js";
import TournamentReportsView from "./TournamentReportsView.jsx";
import SectionLabel from "./SectionLabel.jsx";

const historyService = new TournamentHistoryService();

const FORMAT_LABELS = { roundRobin: "Round Robin", singleElimination: "Single Elimination", doubleElimination: "Double Elimination", league: "League" };

function formatDate(ts) {
  return ts ? new Date(ts).toLocaleDateString() : "—";
}

// A completed (or archived) tournament's read-only view — TournamentReportsView
// is already 100% derivation/no mutation (see its own file header), so
// reusing it directly is what makes "opens in read-only mode" true with no
// new report-rendering code: every tab (Summary/Standings/Playoffs/Player
// Stats/Timeline/etc.) already exists and never writes to the tournament.
function TournamentHistoryDetail({ tournament, onBack, onArchived, onDeleted }) {
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  const handleArchive = async () => {
    setError("");
    try {
      onArchived(await saveArchiveTournament(tournament));
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setError("");
    try {
      await removeTournament(tournament.id);
      onDeleted(tournament.id);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <button style={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back to history
      </button>
      <SectionLabel>{tournament.name}</SectionLabel>
      <p style={styles.editHint}>
        {FORMAT_LABELS[tournament.format] || tournament.format} · Created {formatDate(tournament.createdAt)}
        {tournament.archived ? " · Archived (read-only)" : " · Completed"}
      </p>

      <div style={styles.editActions}>
        {!tournament.archived && (
          <button type="button" style={styles.secondaryBtn} onClick={handleArchive}>
            <Archive size={13} strokeWidth={2.5} />
            Archive tournament
          </button>
        )}
        {tournament.archived && (
          <button type="button" style={styles.dangerBtn} onClick={handleDelete}>
            <Trash2 size={13} strokeWidth={2.5} />
            {confirming ? "Confirm delete? This can't be undone." : "Delete archived tournament"}
          </button>
        )}
      </div>
      {error && <p style={styles.editWarning}>{error}</p>}

      <TournamentReportsView tournament={tournament} loading={false} />
    </div>
  );
}

// Searchable list of every completed tournament (see PROJECT.md's Tournament
// Reports & History section) — a thin UI over TournamentHistoryService,
// which itself is pure list/filter logic over fetchAllTournaments(). Opening
// a tournament here never mutates it (see TournamentHistoryDetail above);
// only the explicit Archive/Delete actions do.
export default function TournamentHistoryScreen({ onBack }) {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [format, setFormat] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetchAllTournaments()
      .then(setTournaments)
      .finally(() => setLoading(false));
  }, []);

  const completed = useMemo(() => historyService.listCompletedTournaments(tournaments), [tournaments]);
  const formats = useMemo(() => [...new Set(completed.map((t) => t.format))], [completed]);

  const filtered = useMemo(
    () =>
      historyService.searchTournaments(completed, {
        query,
        dateFrom: dateFrom ? new Date(dateFrom).getTime() : null,
        dateTo: dateTo ? new Date(dateTo).getTime() + 86400000 - 1 : null,
        format: format || null,
        status: status || null,
      }),
    [completed, query, dateFrom, dateTo, format, status]
  );

  const selected = tournaments.find((t) => t.id === selectedId) || null;

  const handleUpdated = (updated) => {
    setTournaments((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const handleDeleted = (id) => {
    setTournaments((prev) => prev.filter((t) => t.id !== id));
    setSelectedId(null);
  };

  if (selected) {
    return (
      <div style={styles.createWrap}>
        <TournamentHistoryDetail tournament={selected} onBack={() => setSelectedId(null)} onArchived={handleUpdated} onDeleted={handleDeleted} />
      </div>
    );
  }

  return (
    <div style={styles.createWrap}>
      <button style={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={2.5} />
        Back
      </button>
      <SectionLabel>Tournament History</SectionLabel>

      {loading ? (
        <p style={styles.editHint}>Loading…</p>
      ) : completed.length === 0 ? (
        <div style={styles.placeholderCard}>No completed tournaments yet.</div>
      ) : (
        <>
          <div style={styles.historyToolbar}>
            <div style={styles.historySearchBox}>
              <Search size={14} strokeWidth={2.5} />
              <input
                style={styles.historySearchInput}
                placeholder="Search by tournament name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <input type="date" style={styles.rotationSelect} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <input type="date" style={styles.rotationSelect} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <select style={styles.rotationSelect} value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="">All formats</option>
              {formats.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABELS[f] || f}
                </option>
              ))}
            </select>
            <select style={styles.rotationSelect} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Active & archived</option>
              <option value="active">Not archived</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <p style={styles.editWarning}>No tournaments match your filters.</p>
          ) : (
            filtered.map((t) => (
              <button key={t.id} style={{ ...styles.landingCard, textAlign: "left", width: "100%", cursor: "pointer" }} onClick={() => setSelectedId(t.id)}>
                <h2 style={styles.landingCardTitle}>{t.name}</h2>
                <p style={styles.landingCardText}>
                  {FORMAT_LABELS[t.format] || t.format} · {formatDate(t.createdAt)}
                  {t.archived ? " · Archived" : ""}
                </p>
              </button>
            ))
          )}
        </>
      )}
    </div>
  );
}

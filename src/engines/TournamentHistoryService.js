// Tournament History & Archival — see PROJECT.md's Tournament Reports &
// History section. listCompletedTournaments()/searchTournaments() are pure
// reads/filters over whatever fetchAllTournaments() returns (same
// fetchAll*-then-filter shape leagueModel.js/ratingModel.js already use for
// their own list screens); archiveTournament() is the one real mutation
// here, and it's deliberately narrow — it only ever sets archived/archivedAt,
// nothing else about the record changes, and saveTournament's own
// { allowArchived: true } escape hatch (see tournamentModel.js) is what lets
// this specific write through the read-only lock it's creating.
export class TournamentHistoryService {
  // A tournament belongs in history once it's finished pool play + playoffs
  // (status === "completed") — archived tournaments are always completed
  // too (archiveTournament requires it), so this one check covers both.
  listCompletedTournaments(tournaments) {
    return tournaments.filter((t) => t.status === "completed");
  }

  searchTournaments(tournaments, { query = "", dateFrom = null, dateTo = null, format = null, status = null } = {}) {
    const q = query.trim().toLowerCase();
    return tournaments.filter((t) => {
      if (q && !t.name.toLowerCase().includes(q)) return false;
      if (dateFrom != null && t.createdAt < dateFrom) return false;
      if (dateTo != null && t.createdAt > dateTo) return false;
      if (format && t.format !== format) return false;
      if (status === "archived" && !t.archived) return false;
      if (status === "active" && t.archived) return false;
      return true;
    });
  }

  archiveTournament(tournament) {
    if (tournament.status !== "completed") {
      throw new Error("Only a completed tournament can be archived.");
    }
    if (tournament.archived) return tournament;
    return { ...tournament, archived: true, archivedAt: Date.now() };
  }
}

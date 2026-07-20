// Governs when tournament configuration is safe to change — see
// PROJECT.md's Tournament Settings section. Deliberately format-agnostic
// (the phase check only looks at pools/bracket status, never at
// tournament.format), so the same lock logic applies unchanged to any
// future format built on the same pools/bracket shape.
import { deriveSettingsView } from "./TournamentSettings.js";
import { PoolQualificationService } from "./PoolQualificationService.js";

const qualificationService = new PoolQualificationService();

// Field keys locked once pool play has started — the three named
// explicitly in the spec. Everything else (mode, advancesPerPool, playoff
// settings, match rules) stays editable through pool play; only playoffs
// starting locks the rest.
const POOL_PLAY_LOCK = ["format", "poolCount", "assignmentMethod"];

// Everything POOL_PLAY_LOCK already covers, plus every other structural
// field. Name and court names are never in this list — cosmetic
// ("display preferences") fields stay editable at every phase. courtsCount
// isn't in either constant: it's locked as soon as ANY match has started
// (see getPhase below), tighter than the spec's literal minimum — see
// PROJECT.md for why (resizing courts mid-match risks orphaning an
// in-progress assignment; the Courts tab's tested Add/Remove Court actions
// are the supported way to change court count once play has begun).
const PLAYOFFS_LOCK = [
  ...POOL_PLAY_LOCK,
  "mode",
  "advancesPerPool",
  "playoffEnabled",
  "autoDetectPlayoffStage",
  "manualPlayoffStage",
  "matchScoringRules",
  "bronzeMatchEnabled",
  "seedingMethod",
  "qualificationMethod",
  "wildCardCount",
  "bestThirdPlaceCount",
  "allowManualQualificationOverride",
];

export class TournamentRulesService {
  // 'notStarted' — no pool match has started anywhere yet, everything
  // (including courtsCount) is editable.
  // 'poolPlayStarted' — at least one pool match has started/finished, but
  // playoffs haven't begun.
  // 'playoffsStarted' — at least one bracket match has started/finished.
  //
  // Checks match-level status directly rather than trusting
  // pool.status/bracket.status as a shortcut: pool.status IS kept live on
  // every start (tournamentModel.js's startMatch recomputes it via
  // computePoolStatus), but bracket.status is only recomputed inside
  // PlayoffEngine.updateBracket (on a saved RESULT) — PlayoffEngine.
  // startMatch updates the match itself but never rolls bracket.status up
  // to "running". Walking matches directly sidesteps that gap instead of
  // depending on it being fixed elsewhere.
  getPhase(tournament) {
    const anyPoolStarted = tournament.pools.some((p) => p.status !== "ready");
    if (!anyPoolStarted) return "notStarted";
    const bracketStarted =
      tournament.bracket && tournament.bracket.rounds.some((r) => r.matches.some((m) => m.status !== "pending"));
    if (bracketStarted) return "playoffsStarted";
    return "poolPlayStarted";
  }

  // returns: Set<string> of settings field keys that can't be changed right
  // now. "courtsCount" is included from 'poolPlayStarted' onward (tighter
  // than the spec's literal 3-field pool-play lock list — see PLAYOFFS_LOCK
  // comment above).
  getLockedFields(tournament) {
    const phase = this.getPhase(tournament);
    if (phase === "notStarted") return new Set();
    if (phase === "poolPlayStarted") return new Set([...POOL_PLAY_LOCK, "courtsCount"]);
    return new Set([...PLAYOFFS_LOCK, "courtsCount"]);
  }

  isFieldLocked(tournament, fieldKey) {
    return this.getLockedFields(tournament).has(fieldKey);
  }

  // changes: Partial<SettingsView> — only the keys being edited
  // Throws if any changed key is currently locked, or fails validation.
  validateSettings(tournament, changes) {
    const locked = this.getLockedFields(tournament);
    for (const key of Object.keys(changes)) {
      if (locked.has(key)) {
        throw new Error(`${key} can't be changed — ${this.lockReason(tournament)}.`);
      }
    }
    if ("name" in changes && !changes.name?.trim()) {
      throw new Error("Tournament name is required.");
    }
    if ("courtsCount" in changes && !(changes.courtsCount >= 1)) {
      throw new Error("Number of Courts must be at least 1.");
    }
    if ("poolCount" in changes && !(changes.poolCount >= 1)) {
      throw new Error("Number of Pools must be at least 1.");
    }
    if ("advancesPerPool" in changes && !(changes.advancesPerPool >= 1)) {
      throw new Error("Teams Advancing Per Pool must be at least 1.");
    }
    if (changes.matchScoringRules && !(changes.matchScoringRules.winningScore >= 1)) {
      throw new Error("Winning Score must be at least 1.");
    }
    if ("wildCardCount" in changes && ![1, 2, 4].includes(changes.wildCardCount)) {
      throw new Error("Wild Card Count must be 1, 2, or 4.");
    }
    if ("bestThirdPlaceCount" in changes && !(changes.bestThirdPlaceCount >= 1)) {
      throw new Error("Best Third Place Count must be at least 1.");
    }
    // Advanced Qualification — re-validate the FULL resolved qualification
    // config (not just the one field being edited) whenever any of these
    // four change, since "does wildCardCount exceed remaining participants"
    // depends on advancesPerPool too. Reuses PoolQualificationService's own
    // validateQualifiers rather than re-deriving these rules here.
    if ("qualificationMethod" in changes || "wildCardCount" in changes || "bestThirdPlaceCount" in changes || "advancesPerPool" in changes) {
      qualificationService.validateQualifiers(tournament.pools, changes.advancesPerPool ?? tournament.advancesPerPool ?? 1, tournament.playoffEnabled, {
        method: changes.qualificationMethod ?? tournament.qualificationMethod ?? "standard",
        wildCardCount: changes.wildCardCount ?? tournament.wildCardCount ?? 1,
        bestThirdPlaceCount: changes.bestThirdPlaceCount ?? tournament.bestThirdPlaceCount ?? 1,
      });
    }
  }

  lockReason(tournament) {
    const phase = this.getPhase(tournament);
    if (phase === "poolPlayStarted") return "pool play has already started";
    if (phase === "playoffsStarted") return "playoffs have already started";
    return "";
  }

  // Applies `changes` onto the tournament's existing top-level fields —
  // never a separate "settings" sub-object (see TournamentSettings.js's
  // header comment for why). Returns the updated tournament (never mutates
  // the one passed in); caller persists via saveTournament.
  updateSettings(tournament, changes) {
    this.validateSettings(tournament, changes);
    const next = { ...tournament };
    if ("name" in changes) next.name = changes.name.trim();
    if ("mode" in changes) next.mode = changes.mode;
    if ("format" in changes) next.format = changes.format;
    if ("poolCount" in changes) next.poolCount = changes.poolCount;
    if ("assignmentMethod" in changes) next.assignmentMethod = changes.assignmentMethod;
    if ("advancesPerPool" in changes) next.advancesPerPool = changes.advancesPerPool;
    if ("playoffEnabled" in changes) next.playoffEnabled = changes.playoffEnabled;
    if ("autoDetectPlayoffStage" in changes) next.autoDetectPlayoffStage = changes.autoDetectPlayoffStage;
    if ("manualPlayoffStage" in changes) next.manualPlayoffStage = changes.manualPlayoffStage;
    if ("bronzeMatchEnabled" in changes) next.bronzeMatchEnabled = changes.bronzeMatchEnabled;
    if ("seedingMethod" in changes) next.seedingMethod = changes.seedingMethod;
    if ("qualificationMethod" in changes) next.qualificationMethod = changes.qualificationMethod;
    if ("wildCardCount" in changes) next.wildCardCount = changes.wildCardCount;
    if ("bestThirdPlaceCount" in changes) next.bestThirdPlaceCount = changes.bestThirdPlaceCount;
    if ("allowManualQualificationOverride" in changes) next.allowManualQualificationOverride = changes.allowManualQualificationOverride;
    if ("matchScoringRules" in changes) next.matchScoringRules = { ...tournament.matchScoringRules, ...changes.matchScoringRules };
    if ("eligibilityRequirements" in changes) next.eligibilityRequirements = { ...tournament.eligibilityRequirements, ...changes.eligibilityRequirements }; // Membership Management — never locked, same as name/court names: doesn't affect schedule generation
    // courtsCount is deliberately NOT handled here — pre-tournament-start
    // court count changes go through lib/tournament.js's existing
    // saveAddCourt/saveRemoveCourt (Courts tab), not this generic path, so
    // there's exactly one place that creates/removes a Court record.
    return next;
  }

  // Convenience re-export so a caller only needs one import for both "what
  // does this look like" and "can I change it."
  deriveSettingsView(tournament) {
    return deriveSettingsView(tournament);
  }
}

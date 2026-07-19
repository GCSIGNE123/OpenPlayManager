// Tournament Templates — reusable saved tournament configurations. See
// PROJECT.md's Tournament Templates section. One KV record per CUSTOM
// template (`opl-template-{id}`, shared — the exact same one-record-per-
// entity pattern lib/playerDatabase.js already uses). Built-in presets are
// deliberately NOT stored here: they're static in-memory objects always
// merged into the list, so they exist with zero seeding/migration and can
// never be silently edited, corrupted, or deleted.
import { uid } from "../lib/random.js";
import { TEMPLATE_PREFIX, TEMPLATE_DEFAULT_KEY } from "../lib/constants.js";
import { defaultMatchScoringRules } from "./TournamentSettings.js";

// TournamentTemplate = {
//   id, name, isBuiltIn (bool),
//   format ('roundRobin' | future formats — stored as a free string so a
//     future Single/Double Elimination format's own apply path can read it
//     without this shape needing to change),
//   mode ('singles' | 'doubles'), courtsCount, poolCount, assignmentMethod
//     (see engines/PoolAssignment.js), advancesPerPool ("Teams Advancing
//     Per Pool" — the Playoff Qualification config),
//   matchScoringRules ({ matchFormat, winningScore, winByTwo } — see
//     engines/TournamentSettings.js, the same shape Tournament Settings'
//     Match Rules section edits) — captured for reference/future use only;
//     nothing in this app enforces scoring rules yet, so this pre-fills
//     nothing today, same as `seed`/`status` on a Participant carried
//     through as a placeholder for a later feature rather than left out
//     entirely,
//   defaultCourtNames (string[] | null) — applied to the seeded courts at
//     schedule-generation time if present, overriding the usual "Court N"
//     default,
//   createdAt, updatedAt (ms epoch, null on built-ins — they're never
//     "created" or "updated", they just exist)
// }
export function makeTemplate({
  name,
  format = "roundRobin",
  mode = "singles",
  courtsCount = 4,
  poolCount = 1,
  assignmentMethod = "random",
  advancesPerPool = 1,
  matchScoringRules = defaultMatchScoringRules(),
  defaultCourtNames = null,
  isBuiltIn = false,
}) {
  const now = Date.now();
  return {
    id: uid(),
    name,
    isBuiltIn,
    format,
    mode,
    courtsCount,
    poolCount,
    assignmentMethod,
    advancesPerPool,
    matchScoringRules,
    defaultCourtNames,
    createdAt: isBuiltIn ? null : now,
    updatedAt: isBuiltIn ? null : now,
  };
}

// Built-in presets — id is a stable string (not uid()) so "Set Default"
// and duplication work the same way every session, and so re-running this
// module never mints new ids for the same five templates.
function builtIn(id, config) {
  return { ...makeTemplate({ ...config, isBuiltIn: true }), id };
}

export const BUILT_IN_TEMPLATES = [
  builtIn("builtin-club-ladder-night", {
    name: "Club Ladder Night",
    mode: "singles",
    courtsCount: 4,
    poolCount: 1,
    advancesPerPool: 1,
    matchScoringRules: { matchFormat: "oneGame", winningScore: 11, winByTwo: false },
  }),
  builtIn("builtin-weekend-round-robin", {
    name: "Weekend Round Robin",
    mode: "doubles",
    courtsCount: 4,
    poolCount: 1,
    advancesPerPool: 1,
    matchScoringRules: { matchFormat: "oneGame", winningScore: 11, winByTwo: true },
  }),
  builtIn("builtin-rr-top2-playoffs", {
    name: "Round Robin + Top 2 Playoffs",
    mode: "doubles",
    courtsCount: 4,
    poolCount: 2,
    advancesPerPool: 2,
    matchScoringRules: { matchFormat: "oneGame", winningScore: 11, winByTwo: true },
  }),
  builtIn("builtin-16team-single-elim", {
    name: "16-Team Single Elimination",
    mode: "singles",
    courtsCount: 4,
    poolCount: 4,
    advancesPerPool: 4,
    matchScoringRules: { matchFormat: "bestOf3", winningScore: 15, winByTwo: true },
  }),
  builtIn("builtin-beginner-social", {
    name: "Beginner Social Tournament",
    mode: "doubles",
    courtsCount: 2,
    poolCount: 1,
    advancesPerPool: 1,
    matchScoringRules: { matchFormat: "oneGame", winningScore: 11, winByTwo: false },
    defaultCourtNames: ["Court 1", "Court 2"],
  }),
];

export class TournamentTemplateService {
  // Every custom template plus every built-in — the one list the
  // Templates screen and Create Session's template picker both render.
  async fetchAllTemplates() {
    const { keys } = await window.storage.list(TEMPLATE_PREFIX, true);
    const custom = await Promise.all(
      keys
        .filter((k) => k !== TEMPLATE_DEFAULT_KEY)
        .map(async (key) => {
          try {
            const res = await window.storage.get(key, true);
            return JSON.parse(res.value);
          } catch (e) {
            return null; // vanished between list and get — skip it
          }
        })
    );
    return [...BUILT_IN_TEMPLATES, ...custom.filter(Boolean)];
  }

  // name required; courtsCount/poolCount/advancesPerPool must each be at
  // least 1 — thrown, not silently clamped, so the Templates screen can
  // surface the message directly to the organizer.
  validateTemplate(template) {
    if (!template.name || !template.name.trim()) throw new Error("Template name is required.");
    if (!(template.courtsCount >= 1)) throw new Error("Number of Courts must be at least 1.");
    if (!(template.poolCount >= 1)) throw new Error("Number of Pools must be at least 1.");
    if (!(template.advancesPerPool >= 1)) throw new Error("Qualifiers Per Pool must be at least 1.");
  }

  async saveTemplate(template) {
    this.validateTemplate(template);
    if (template.isBuiltIn) throw new Error("Built-in templates can't be edited — duplicate it to create an editable copy.");
    const stamped = { ...template, updatedAt: Date.now() };
    await window.storage.set(`${TEMPLATE_PREFIX}${template.id}`, JSON.stringify(stamped), true);
    return stamped;
  }

  async loadTemplate(id) {
    const builtIn = BUILT_IN_TEMPLATES.find((t) => t.id === id);
    if (builtIn) return builtIn;
    try {
      const res = await window.storage.get(`${TEMPLATE_PREFIX}${id}`, true);
      return JSON.parse(res.value);
    } catch (e) {
      return null;
    }
  }

  // Built-ins duplicate into an editable custom copy (a fresh id, a new
  // "(Copy)" name, isBuiltIn: false) — the only way to get a variation of
  // a preset without touching the preset itself. Custom templates
  // duplicate the same way, for the ordinary "start from an existing one"
  // case.
  async duplicateTemplate(id) {
    const source = await this.loadTemplate(id);
    if (!source) throw new Error("Template not found.");
    const { id: _id, isBuiltIn: _isBuiltIn, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = source;
    const copy = makeTemplate({ ...rest, name: `${source.name} (Copy)`, isBuiltIn: false });
    await window.storage.set(`${TEMPLATE_PREFIX}${copy.id}`, JSON.stringify(copy), true);
    return copy;
  }

  async deleteTemplate(id) {
    if (BUILT_IN_TEMPLATES.some((t) => t.id === id)) throw new Error("Built-in templates can't be deleted.");
    await window.storage.delete(`${TEMPLATE_PREFIX}${id}`, true);
    const defaultId = await this.getDefaultTemplateId();
    if (defaultId === id) await window.storage.delete(TEMPLATE_DEFAULT_KEY, true);
  }

  async getDefaultTemplateId() {
    try {
      const res = await window.storage.get(TEMPLATE_DEFAULT_KEY, true);
      return JSON.parse(res.value).templateId;
    } catch (e) {
      return null;
    }
  }

  async setDefaultTemplate(id) {
    await window.storage.set(TEMPLATE_DEFAULT_KEY, JSON.stringify({ templateId: id }), true);
  }

  // Returns the config CreateSessionScreen/TournamentScheduleView pre-fill
  // their fields from — never mutates the template itself, and explicitly
  // refuses to run against an already-existing tournament: "applying a
  // template never overwrites an existing tournament" isn't just a UI
  // convention here, it's enforced at the one place every apply path goes
  // through.
  applyTemplate(template, { tournament = null } = {}) {
    if (tournament) throw new Error("A template can't be applied to a tournament that already exists.");
    const { id, isBuiltIn, name, createdAt, updatedAt, ...config } = template;
    return config;
  }
}

// Roles — see PROJECT.md's Role-Based Access Control section. Same
// "built-in vs. custom" precedent TournamentTemplateService already set:
// the 6 default roles below are static in-memory objects, always available,
// never stored as KV records, and can't be edited or deleted — a CUSTOM
// role (this task's architecture seam for the "Custom Roles" FEATURES.md
// item, not implemented as a feature yet) would be a real
// `opl-role-{id}` record instead, following the exact same
// duplicate-to-customize pattern BUILT_IN_TEMPLATES/TournamentTemplateService
// established.
import { uid } from "../lib/random.js";
import { ROLE_PREFIX } from "../lib/constants.js";

// Role = { id, name, permissionIds (string[]), isBuiltIn, createdAt, updatedAt }
export function makeRole({ name, permissionIds = [], isBuiltIn = false }) {
  const now = Date.now();
  return {
    id: uid(),
    name,
    permissionIds,
    isBuiltIn,
    createdAt: isBuiltIn ? null : now,
    updatedAt: isBuiltIn ? null : now,
  };
}

function builtIn(id, config) {
  return { ...makeRole({ ...config, isBuiltIn: true }), id };
}

// Permission ids assigned below are drawn straight from PERMISSIONS
// (src/lib/permissions.js) — every exclusion the spec called out ("Cannot:
// Delete the club / Manage billing" for Tournament Director; "Cannot edit
// tournament settings" for Referee) is enforced simply by that permission
// id never appearing in that role's list, not by a separate deny rule.
export const BUILT_IN_ROLES = [
  builtIn("builtin-super-admin", {
    name: "Super Admin",
    permissionIds: [
      "administration.manageClubs",
      "administration.manageUsers",
      "settings.configureGlobal",
      "reports.viewAll",
    ],
  }),
  builtIn("builtin-club-owner", {
    name: "Club Owner",
    permissionIds: [
      "settings.manageClub",
      "tournament.create",
      "tournament.editSettings",
      "courts.manage",
      "players.manage",
      "reports.view",
      "administration.inviteStaff",
    ],
  }),
  builtIn("builtin-tournament-director", {
    name: "Tournament Director",
    permissionIds: [
      "tournament.create",
      "tournament.editSchedule",
      "tournament.editSettings",
      "tournament.enterScores",
      "courts.assign",
      "reports.view",
    ],
  }),
  builtIn("builtin-staff", {
    name: "Staff",
    permissionIds: [
      "players.checkIn",
      "tournament.enterScores",
      "tournament.viewSchedules",
      "tournament.viewStandings",
    ],
  }),
  builtIn("builtin-referee", {
    name: "Referee",
    permissionIds: ["tournament.viewAssignedMatches", "tournament.enterScores"],
  }),
  builtIn("builtin-spectator", {
    name: "Spectator",
    permissionIds: ["tournament.viewSchedules", "tournament.viewStandings", "reports.view"],
  }),
];

export const BUILT_IN_ROLES_BY_ID = Object.fromEntries(BUILT_IN_ROLES.map((r) => [r.id, r]));

// Every custom role plus every built-in — the one list a future Custom
// Roles UI and the User Management role picker would both render, mirroring
// TournamentTemplateService.fetchAllTemplates() exactly.
export async function fetchAllRoles() {
  const { keys } = await window.storage.list(ROLE_PREFIX, true);
  const custom = await Promise.all(
    keys.map(async (key) => {
      try {
        const res = await window.storage.get(key, true);
        return JSON.parse(res.value);
      } catch (e) {
        return null; // vanished between list and get — skip it
      }
    })
  );
  return [...BUILT_IN_ROLES, ...custom.filter(Boolean)];
}

export async function saveRole(role) {
  if (role.isBuiltIn) throw new Error("Built-in roles can't be edited — duplicate it to create an editable copy.");
  const stamped = { ...role, updatedAt: Date.now() };
  await window.storage.set(`${ROLE_PREFIX}${role.id}`, JSON.stringify(stamped), true);
  return stamped;
}

export function permissionIdsForRole(role) {
  return role?.permissionIds ?? [];
}

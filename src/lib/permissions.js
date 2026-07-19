// The RBAC permission catalog — see PROJECT.md's Role-Based Access Control
// section. Every permission belongs to exactly one PermissionGroup; the
// catalog itself is static data, not stored records (the same "built-in,
// always in memory" precedent BUILT_IN_TEMPLATES already set) — there's
// nothing here for an organizer to create or edit, only Roles pick from it.
export const PERMISSION_GROUPS = {
  TOURNAMENT: "tournament",
  PLAYERS: "players",
  COURTS: "courts",
  REPORTS: "reports",
  SETTINGS: "settings",
  ADMINISTRATION: "administration",
};

export function makePermissionGroup(id, label) {
  return { id, label };
}

export const PERMISSION_GROUP_LIST = [
  makePermissionGroup(PERMISSION_GROUPS.TOURNAMENT, "Tournament"),
  makePermissionGroup(PERMISSION_GROUPS.PLAYERS, "Players"),
  makePermissionGroup(PERMISSION_GROUPS.COURTS, "Courts"),
  makePermissionGroup(PERMISSION_GROUPS.REPORTS, "Reports"),
  makePermissionGroup(PERMISSION_GROUPS.SETTINGS, "Settings"),
  makePermissionGroup(PERMISSION_GROUPS.ADMINISTRATION, "Administration"),
];

export function makePermission(id, groupId, label) {
  return { id, groupId, label };
}

// One entry per capability named across every role's Can/Cannot list in the
// spec — kept traceable to that list rather than invented independently:
// each comment names the role(s) whose bullet it comes from.
export const PERMISSIONS = [
  // Tournament
  makePermission("tournament.create", PERMISSION_GROUPS.TOURNAMENT, "Create tournaments"), // Club Owner, Tournament Director
  makePermission("tournament.editSchedule", PERMISSION_GROUPS.TOURNAMENT, "Edit schedules"), // Tournament Director
  makePermission("tournament.enterScores", PERMISSION_GROUPS.TOURNAMENT, "Enter scores"), // Tournament Director, Staff, Referee
  makePermission("tournament.viewSchedules", PERMISSION_GROUPS.TOURNAMENT, "View schedules"), // Staff, Spectator
  makePermission("tournament.viewStandings", PERMISSION_GROUPS.TOURNAMENT, "View standings"), // Staff, Spectator
  makePermission("tournament.viewAssignedMatches", PERMISSION_GROUPS.TOURNAMENT, "View assigned matches"), // Referee
  makePermission("tournament.editSettings", PERMISSION_GROUPS.TOURNAMENT, "Edit tournament settings"), // Club Owner, Tournament Director — explicitly NOT Referee

  // Players
  makePermission("players.manage", PERMISSION_GROUPS.PLAYERS, "Manage players"), // Club Owner
  makePermission("players.checkIn", PERMISSION_GROUPS.PLAYERS, "Check in players"), // Staff

  // Courts
  makePermission("courts.manage", PERMISSION_GROUPS.COURTS, "Manage courts"), // Club Owner
  makePermission("courts.assign", PERMISSION_GROUPS.COURTS, "Assign courts"), // Tournament Director

  // Reports
  makePermission("reports.view", PERMISSION_GROUPS.REPORTS, "View reports"), // Club Owner, Tournament Director
  makePermission("reports.viewAll", PERMISSION_GROUPS.REPORTS, "View all reports (every club)"), // Super Admin

  // Settings
  makePermission("settings.configureGlobal", PERMISSION_GROUPS.SETTINGS, "Configure global settings"), // Super Admin
  makePermission("settings.manageClub", PERMISSION_GROUPS.SETTINGS, "Manage their club"), // Club Owner

  // Administration
  makePermission("administration.manageClubs", PERMISSION_GROUPS.ADMINISTRATION, "Manage all clubs"), // Super Admin
  makePermission("administration.manageUsers", PERMISSION_GROUPS.ADMINISTRATION, "Manage users"), // Super Admin
  makePermission("administration.inviteStaff", PERMISSION_GROUPS.ADMINISTRATION, "Invite staff"), // Club Owner
  makePermission("administration.deleteClub", PERMISSION_GROUPS.ADMINISTRATION, "Delete the club"), // explicitly NOT Tournament Director
  makePermission("administration.manageBilling", PERMISSION_GROUPS.ADMINISTRATION, "Manage billing"), // explicitly NOT Tournament Director — billing itself isn't implemented, this permission just exists so "Cannot: Manage billing" is a real, checkable exclusion
];

export const PERMISSIONS_BY_ID = Object.fromEntries(PERMISSIONS.map((p) => [p.id, p]));

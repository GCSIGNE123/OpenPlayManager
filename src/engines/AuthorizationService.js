// AuthorizationService — the one place any protected action in this app
// checks permissions, per PROJECT.md's Role-Based Access Control section.
// A single concrete class, not a Strategy-pattern hierarchy — same "one
// reusable service" precedent as CourtAssignmentService/TournamentRulesService,
// since there's exactly one authorization model, not one per role/format.
//
// A `user` here is a userDatabase.js record — { id, roleIds, status, ... }.
// `roleIds` is an array, not a single role: a user can hold more than one
// role at once (e.g. Club Owner + Referee) with no extra machinery — every
// check below just unions the permission ids across every assigned role.
// `customRoles` (default []) lets a caller pass in any org-defined custom
// roles (opl-role-* records, see Role.js) alongside BUILT_IN_ROLES; every
// method defaults to built-ins only, so existing callers don't need to
// change once custom roles exist.
import { BUILT_IN_ROLES } from "./Role.js";

function resolveRoles(user, customRoles) {
  const allRoles = [...BUILT_IN_ROLES, ...customRoles];
  return (user?.roleIds || []).map((id) => allRoles.find((r) => r.id === id)).filter(Boolean);
}

function resolvePermissionIds(user, customRoles) {
  const ids = new Set();
  for (const role of resolveRoles(user, customRoles)) {
    for (const permissionId of role.permissionIds) ids.add(permissionId);
  }
  return ids;
}

export class AuthorizationService {
  // A disabled user has no permissions regardless of assigned roles —
  // checked here, once, rather than at every call site.
  hasPermission(user, permissionId, customRoles = []) {
    if (!user || user.status === "disabled") return false;
    return resolvePermissionIds(user, customRoles).has(permissionId);
  }

  // True if any of the user's assigned roles grants any permission in this
  // group — for UI section-gating ("show the Reports tab at all"), not for
  // a specific action ("can this user Export CSV" is still hasPermission).
  canAccess(user, groupId, customRoles = []) {
    if (!user || user.status === "disabled") return false;
    const roles = resolveRoles(user, customRoles);
    return roles.some((role) => role.permissionIds.some((pid) => pid.split(".")[0] === groupId));
  }

  // Adds roleId to the user's roleIds (deduped) — returns a new user object,
  // never mutates the one passed in; caller persists via saveUserRecord.
  assignRole(user, roleId) {
    if (user.roleIds.includes(roleId)) return user;
    return { ...user, roleIds: [...user.roleIds, roleId] };
  }

  // Removes roleId from the user's roleIds — a no-op (returns the same
  // shape, not an error) if the user never had it, since "make sure this
  // role isn't assigned" is idempotent by nature.
  removeRole(user, roleId) {
    return { ...user, roleIds: user.roleIds.filter((id) => id !== roleId) };
  }
}

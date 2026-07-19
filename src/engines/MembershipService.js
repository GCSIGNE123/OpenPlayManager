// MembershipService — see PROJECT.md's Membership Management section. The
// one place membership status/eligibility is decided — every caller
// (Member Directory, League Manager's eligibility check, a future
// tournament-roster check) goes through this rather than reading
// player.membershipStatus directly, the same "one authorization service"
// precedent AuthorizationService already set for RBAC.
import { BUILT_IN_MEMBERSHIP_PLANS_BY_ID } from "../lib/membershipPlans.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function resolvePlan(planId, customPlans) {
  if (!planId) return null;
  return BUILT_IN_MEMBERSHIP_PLANS_BY_ID[planId] || customPlans.find((p) => p.id === planId) || null;
}

// Membership — a read-only, derived view over a player record's membership
// fields (same "read-view, not a data migration" precedent
// TournamentSettings/PlayerPortalService already established) — nothing
// new is persisted, this just names the fields already on the player
// record plus the LIVE-computed status (see getMembershipStatus below).
export function deriveMembership(player, customPlans = []) {
  return {
    memberId: player.memberId,
    status: new MembershipService().getMembershipStatus(player),
    plan: resolvePlan(player.membershipPlanId, customPlans),
    joinDate: player.joinDate,
    expirationDate: player.expirationDate,
    emergencyContact: player.emergencyContact,
    skillLevel: player.skill,
    duprId: player.duprId,
    notes: player.notes,
  };
}

export class MembershipService {
  // Membership Status is derived-with-override, the same "don't trust a
  // stale stored field, recompute the live truth" pattern this app already
  // uses for tournament/court status:
  //   1. a manually-set "suspended" always wins — an organizer's explicit
  //      override, never silently cleared by a date calculation.
  //   2. an expirationDate in the past always reads as "expired", even if
  //      the stored status still says "active" — nobody has to remember to
  //      manually expire people.
  //   3. no plan assigned yet reads as "pending".
  //   4. otherwise, the stored status (expected to be "active" by this point).
  getMembershipStatus(player) {
    if (player.membershipStatus === "suspended") return "suspended";
    if (player.expirationDate && player.expirationDate < Date.now()) return "expired";
    if (!player.membershipPlanId) return "pending";
    return player.membershipStatus || "active";
  }

  isMemberActive(player) {
    return this.getMembershipStatus(player) === "active";
  }

  // Pure function — returns a new player record, never mutates the one
  // passed in; caller persists via savePlayerRecord (same convention every
  // other engine in this app follows). Extends from the LATER of today or
  // the player's current (still-active) expiration date, so renewing early
  // adds to remaining time rather than discarding it; a Lifetime plan
  // (durationDays: null) clears expirationDate entirely (never expires).
  // joinDate is set once, on a player's very first renewal, and never
  // overwritten by a later renewal.
  renewMembership(player, planId, customPlans = []) {
    const plan = resolvePlan(planId, customPlans);
    if (!plan) throw new Error("Membership plan not found.");
    const now = Date.now();
    const base = player.expirationDate && player.expirationDate > now ? player.expirationDate : now;
    const expirationDate = plan.durationDays == null ? null : base + plan.durationDays * DAY_MS;
    return {
      ...player,
      membershipPlanId: plan.id,
      membershipStatus: "active",
      joinDate: player.joinDate || now,
      expirationDate,
    };
  }

  // requirements: { requireActiveMembership, requiredPlanId, allowGuests }
  // — see TournamentSettings.js/leagueModel.js's defaultEligibilityRequirements.
  // Guest Access Allowed is a full bypass when on — a non-member (or lapsed
  // member) is still eligible. When off, an active membership (and matching
  // plan, if one is required) is mandatory.
  validateEligibility(player, requirements) {
    const { requireActiveMembership = false, requiredPlanId = null, allowGuests = true } = requirements || {};
    if (allowGuests) return { eligible: true, reason: null };
    if (!requireActiveMembership && !requiredPlanId) return { eligible: true, reason: null };
    if (!this.isMemberActive(player)) {
      return { eligible: false, reason: "Requires an active membership." };
    }
    if (requiredPlanId && player.membershipPlanId !== requiredPlanId) {
      return { eligible: false, reason: "Requires a specific membership plan." };
    }
    return { eligible: true, reason: null };
  }
}

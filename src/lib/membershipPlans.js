// MembershipPlan — see PROJECT.md's Membership Management section. Same
// built-in/custom precedent TournamentTemplateService/Role.js already
// established twice: the 5 named plans are static, immutable, in-memory
// objects; a custom plan (this task's architecture seam for "future plans
// should be configurable") is a real `opl-membership-plan-{id}` KV record,
// following the identical fetch-merge-with-built-ins shape those two
// modules already use.
import { uid } from "./random.js";
import { MEMBERSHIP_PLAN_PREFIX } from "./constants.js";

// MembershipPlan = { id, name, durationDays (null = never expires, i.e.
// Lifetime), isBuiltIn, createdAt, updatedAt }
export function makeMembershipPlan({ name, durationDays, isBuiltIn = false }) {
  const now = Date.now();
  return { id: uid(), name, durationDays, isBuiltIn, createdAt: isBuiltIn ? null : now, updatedAt: isBuiltIn ? null : now };
}

function builtIn(id, config) {
  return { ...makeMembershipPlan({ ...config, isBuiltIn: true }), id };
}

export const BUILT_IN_MEMBERSHIP_PLANS = [
  builtIn("builtin-daily-pass", { name: "Daily Pass", durationDays: 1 }),
  builtIn("builtin-monthly", { name: "Monthly", durationDays: 30 }),
  builtIn("builtin-quarterly", { name: "Quarterly", durationDays: 90 }),
  builtIn("builtin-annual", { name: "Annual", durationDays: 365 }),
  builtIn("builtin-lifetime", { name: "Lifetime", durationDays: null }),
];

export const BUILT_IN_MEMBERSHIP_PLANS_BY_ID = Object.fromEntries(BUILT_IN_MEMBERSHIP_PLANS.map((p) => [p.id, p]));

export async function fetchAllMembershipPlans() {
  const { keys } = await window.storage.list(MEMBERSHIP_PLAN_PREFIX, true);
  const custom = await Promise.all(
    keys.map(async (key) => {
      try {
        const res = await window.storage.get(key, true);
        return JSON.parse(res.value);
      } catch (e) {
        return null;
      }
    })
  );
  return [...BUILT_IN_MEMBERSHIP_PLANS, ...custom.filter(Boolean)];
}

export async function saveMembershipPlan(plan) {
  if (plan.isBuiltIn) throw new Error("Built-in plans can't be edited — duplicate it to create an editable copy.");
  const stamped = { ...plan, updatedAt: Date.now() };
  await window.storage.set(`${MEMBERSHIP_PLAN_PREFIX}${plan.id}`, JSON.stringify(stamped), true);
  return stamped;
}

export function findMembershipPlan(plans, planId) {
  return plans.find((p) => p.id === planId) || null;
}

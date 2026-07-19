// Player Portal Notifications — architecture only, per this task's spec:
// "Create the architecture only" / "Do not implement: Push notifications."
// Nothing here is wired into the UI (no bell icon, no polling, no push
// delivery) — this exists purely so the notification *shape* is settled
// ahead of a future task that actually implements delivery, the same
// "captured, not enforced" precedent matchScoringRules/autoDetectPlayoffStage
// already set elsewhere in this app.
export const NOTIFICATION_TYPES = {
  COURT_ASSIGNMENT: "courtAssignment", // fires when a participant's next match gets a court assigned
  MATCH_READY: "matchReady", // fires when a participant's match is ready to start (both teams known, court assigned)
  TOURNAMENT_COMPLETE: "tournamentComplete", // fires once the tournament (or the participant's own run in it) finishes
};

// A future delivery mechanism (push/email/in-app) would replace this stub
// with real diffing against previously-seen tournament state. Returning an
// empty list unconditionally is deliberate — there is no notification
// history stored anywhere yet, and this task doesn't build one.
export class PlayerNotificationService {
  getNotifications(tournament, participantId) {
    return [];
  }
}

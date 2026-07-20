// Court Assignment & Match Queue Engine Notifications — architecture only,
// per this task's spec: "Prepare hooks for future... No notification
// delivery yet." Nothing here is wired into the UI (no bell icon, no
// polling, no push) — mirrors PlayerNotificationService.js's exact
// precedent for the same reason: settle the notification *shape* ahead of
// a future task that actually implements delivery.
export const COURT_NOTIFICATION_TYPES = {
  COURT_READY: "courtReady", // fires when a court an organizer is waiting on becomes available
  PLAYERS_CALLED: "playersCalled", // fires when a queued match's players should be called to a court
  MATCH_DELAYED: "matchDelayed", // fires when a match is marked delayed (see CourtAssignmentEngine.delayMatch)
};

export class CourtNotificationService {
  getNotifications(tournament) {
    return [];
  }
}

# Open Play Manager Feature Backlog

## Development Rule

Only one feature should be implemented per development task.

Before making any code changes:

1. Read FEATURES.md.
2. Explain the implementation plan.
3. Wait for organizer approval.
4. Implement only the selected feature.
5. Mark the feature complete when finished.

Do not implement multiple unrelated features in a single task.

## 🚧 In Progress

## 🔥 High Priority

- [x] Multi-Tenant Venue Architecture
  - Venue entity
  - Venue dashboard
  - Venue ownership model
  - Venue-ready modules
  - Future organization support
  - Multi-tenant foundation
  - ✅ Active Venue Workspace Architecture
    - Active Venue Context
    - Venue Workspace Model
    - Multi-Venue Ready
    - Venue-scoped Navigation
    - Future Authentication Ready
- [x] Court Booking & Reservations
  - Booking Dashboard
  - Court Management
    - Court Photos
    - Surface Type
    - Court Status Badges (Available, Reserved, Maintenance, Inactive)
    - ✅ Court Management UI
      - Visual Court Cards
      - Court Photos
      - Surface Badges
      - Equipment Badges
      - Operational Statuses
      - Reservation Summary
      - Responsive Grid Layout
  - Booking Calendar
    - ✅ Interactive Reservation Timeline
    - Day View
    - Week View
    - Click-to-Create Reservation
    - Click-to-Edit Reservation
    - Conflict Detection
    - Live Current Time Indicator
  - Availability Engine
  - Conflict Detection
  - Booking CRUD
  - Reservation Status
- [x] Open Play TV Mode
  - Live Court Display
  - Live Standings
  - Queue Display
  - Next Match Display
  - Smart TV Optimized
  - Full Screen Mode
  - Real-time Updates
  - Player Photos & Broadcast Experience
  - ✅ TV Mode 2.0
    - Broadcast-style TV layout
    - 40% Live Matches
    - 40% Upcoming Matches
    - 20% Live Standings
    - Persistent venue/session header
    - Highlighted "Next on Court"
    - Full-screen TV optimization
    - Large-screen responsive design
  - ✅ TV Mode Layout Optimization
    - 45/35/20 display ratio
    - Live Courts panel
    - Compact Up Next cards
    - Simplified Standings
    - Future adaptive layout support
  - ✅ TV Mode Layout Rebalancing
    - 45/20/35 display ratio (Live Courts unchanged, Up Next narrowed, Standings widened)
    - Up Next typography/spacing rescaled for the narrower column
    - Standings gains more room for names before truncation
  - ✅ TV Mode - Up Next Card Optimization
    - Layout ratio (45/20/35) unchanged
    - Smaller avatars (~12%) and tighter avatar/name/VS spacing
    - Smaller, less dominant "NEXT ON COURT" badge
    - Slightly smaller player-name font so more characters show before truncating
    - Non-highlighted cards get their own more compact padding
    - First upcoming match still visually emphasized (accent border/background/badge)
  - ✅ TV Mode - Standings Expansion
    - 40/30/30 display ratio (Live Courts narrowed, Up Next widened, Standings resized for a fuller table)
    - Standings gains a labeled header row and W/L columns alongside the existing SPR value (reused as-is, not recalculated)
    - Up Next sizing rescaled back up for the wider 30% column
    - More room for longer player names before truncation
- [x] Expected Playing Opportunities (Session Duration-Based Estimate)
  - Session Duration input (hours, decimal-friendly) replaces manual Expected Games Per Player entry
  - Configurable Average Match Duration (default 15 minutes)
  - Read-only, auto-computed estimate — never manually editable
  - Live-updates on courts/duration/registered players/match duration changes
- [x] Player Checkout During Session
  - Player participation status
  - Mid-session checkout
  - Checkout timestamp
  - Active and Checked Out player sections
  - Future-ready status model
- [x] Guaranteed Upcoming Match Queue
  - Upcoming matches are always generated automatically whenever complete matches can be formed from waiting players (no manual "Regenerate matchups" needed)
  - Skill balancing is preferred but never blocks play — same-skill pairings are used automatically when a balanced mix isn't available
  - Existing fairness rules (waiting time, fewest games played, avoid repeat teammates/opponents) remain the primary pairing algorithm throughout
  - Superseded by Smart Queue Management's queue-depth cap below: the queue is no longer generated without limit — see that section for the current behavior (still auto-regenerates, just bounded to Live Courts − 1)
- [ ] Progressive Skill Rotation
- [x] Progressive Skill Rotation automatically falls back to a randomized first round when all registered players belong to the same skill level. Normal Progressive Skill Rotation resumes from Round 2 onward.
- [x] Adaptive Skill Rotation
  - Separate Beginner and Intermediate divisions
  - Automatic promotion after 3 consecutive wins
  - Automatic relegation after 3 consecutive losses
  - Manual facilitator skill override
  - Existing fairness engine preserved
  - ✅ Winner vs Winner Preference
    - Within each division, players coming off a win are preferred as opponents for other players coming off a win (same for losses)
    - A soft scoring preference, never a hard requirement — repeat-opponent avoidance always still wins if the two conflict
    - Partners keep rotating every match — team formation is completely untouched by this
    - No separate fallback path needed: a court is never left empty, since the preference simply contributes nothing when it can't be satisfied
- [x] Smart Queue Management
  - Limited upcoming queue — Upcoming Matchups = Live Courts − 1 in steady state (enough to fill every automatic court before the session's first match, so "Fill all open courts" always has something to deploy)
  - Waiting timer — "Waiting Xm" from a player's last match end, or "Checked in Xm ago" before their first match; updates live, no session save required
  - Hold Match / Resume Match / Cancel Match — reserve an upcoming matchup out of automatic court assignment without dissolving it; Resume restores its original queue position (never sent to the back); Cancel dissolves it and returns all 4 players to the waiting queue
  - Skip Player — moves a player to the back of the waiting queue (restroom, water, brief absence) while keeping them fully eligible for matchmaking the whole time
  - Hold Player / Resume Player — temporarily excludes a player from matchmaking while preserving every stat, streak, and payment field; player stays checked in
  - Queue Status — reusable canonical statuses (Playing, Upcoming, Waiting, Held, Checked Out) computed fresh from session state, not stored
  - Queue regeneration is automatic on every relevant event (check-in, checkout, resume, skip, held-player-resume, matchup-cancelled) — no manual action needed
  - All 7 queue actions (holdPlayer, resumePlayer, skipPlayer, holdMatch, resumeMatch, cancelMatch, regenerate) are reusable, UI-agnostic functions (`src/lib/queueManagement.js`) — ready for future features like Smart Court Dispatch or voice announcements to call directly
  - Held Match dissolution notice — if a held matchup is automatically dissolved (a player checks out, changes skill division, is substituted, moved to queue, removed, or held), the facilitator gets a toast and a permanent entry in a new Queue Activity Log; dissolving an ordinary (not-held) matchup stays silent, same as before
  - ✅ Sprint 2.1 — Richer Queue Activity Log
    - The full dissolved matchup (both teams' player names) is captured at the moment of dissolution — never reconstructed afterward — alongside matchup ID, reason, the responsible player, and a timestamp
    - The Queue Activity Log renders each entry as a small scannable card ("Held Match Removed" / Team A vs Team B / Reason / time) instead of a single dense line
    - No change to Hold Match/Resume Match/queue priority/regeneration/matchmaking/rotation engines — purely a logging/UI improvement
    - Remains fully rotation-mode-agnostic, same as the base Held Match dissolution notice
- [x] Smart Court Dispatch
  - Automatic Court Dispatch — whenever a court becomes available (a completed match, an unlocked manual court, an undone round, or any other action), the highest-priority eligible upcoming matchup is dispatched automatically, no facilitator action required
  - A reusable dispatch SERVICE (`src/lib/courtDispatch.js`), not tied to any single action — it runs inside the app's single `save()` write path, the same way Queue Management's own regeneration already does, so it reacts to any court becoming available rather than being coupled to match-end specifically
  - Fully respects existing Queue Management: never dispatches a Held Match, a matchup containing a Held Player, a checked-out player, an incomplete/dissolved matchup, a manual-assignment court, or a Court Booking-reserved court — if the first upcoming matchup can't be dispatched, the next eligible one is used instead, with the queue's order otherwise fully preserved
  - Manual dispatch (Assign match / Fill all open courts / Generate remaining courts) now shares the exact same matchup-selection logic as automatic dispatch — one single definition of "what's next" for the whole app
  - `Dispatching` is a dedicated court status (distinct from Open/Live/Finished) — a dispatched court shows "Calling Players..." with its teams already visible, before scoring starts
  - Dispatch Confirmation — a dispatched court stays in `Dispatching`/"Calling Players..." until the voice announcement finishes (or the announcement delay elapses if announcements are muted/unsupported), then automatically becomes Playing — unless Auto Start Match is off, in which case it stays `Dispatching` until the facilitator clicks "Start Match"
  - Voice Announcements via the browser's native Speech Synthesis API (no external service): "Court N. A and B, versus C and D. Please proceed to Court N."
  - Repeat Announcement — available on both `Dispatching` and Playing (Live/Finished) courts; replays the same announcement from the court's current team assignment without regenerating anything
  - Session Settings: Auto-fill Courts (default ON), Auto Start Match (default ON), Voice Announcements ON/OFF, Announcement Volume, Announcement Voice, Announcement Speed, Announcement Delay (Immediate/2s default/5s/10s) — all rotation-mode-agnostic and persisted for the session
  - Every dispatch/announcement event (court automatically dispatched, voice announcement completed/repeated, announcement muted/skipped) is recorded in the same Queue Activity Log Sprint 2.1 introduced, enriched with court number and both teams' player names, not just a prose description
  - TV Mode Integration — plain browser CustomEvents (`CourtAssigned`, `AnnouncementStarted`, `AnnouncementCompleted`) are fired on every dispatch/announcement so TV Mode can subscribe later; no visual redesign in this sprint
  - Dispatch never depends on a successful voice announcement — court assignment is always persisted first, before any announcement is even attempted
  - Zero rotation-specific code: nothing in Smart Court Dispatch reads `rotationMode` or any engine file, so it works identically under Continuous, Progressive Skill, Adaptive Skill, Winner Pool, or any future rotation mode
  - Adaptive Skill Rotation, the Winner vs Winner preference, the fairness engine, TV Mode, and the payment system are all untouched by this sprint
- [ ] Winner Pool Rotation
- [ ] Game History
- [ ] Manual Court Assignment
- [ ] Player Replacement Improvements
- [ ] Session Settings
- [ ] Standings Improvements
- [ ] PWA Support

## ⚡ Medium Priority

- [ ] Player Photos
- [ ] Statistics Dashboard
- [ ] Fairness Simulator
- [ ] Session Reports
- [ ] Export Results
- [ ] Player Search

## 💡 Low Priority

- [ ] Dark Mode
- [ ] CONNECT.PH Branding Improvements
- [ ] Push Notifications
- [ ] Club Profiles
- [ ] Seasonal Statistics
- [ ] DUPR Integration (Future)

## 🏆 Tournament Manager

- [x] Session Type Architecture
- [x] Tournament Engine Foundation
- [x] Round Robin Scheduler
- [x] Tournament Match Management
- [x] Round Robin Standings
- [x] Tournament Completion
- [x] Champion Determination
- [x] Multiple Pool Support
- [x] Playoff Qualification
- [x] Pool Qualification Engine
- [x] Wild Card Qualification
- [x] Best Third Place
- [x] Manual Qualification Override
- [x] Bracket Generation
- [x] Playoff Match Management
- [x] Winner Advancement
- [x] Round Robin Playoff Engine
- [x] Automatic Qualification
- [x] Automatic Bracket Generation
- [x] Automatic Playoff Bracket Generator
- [x] Bronze Medal Match
- [x] Manual Seeding
- [ ] Double Elimination Brackets
- [x] Double Elimination Foundation
- [x] Winners Bracket Progression
- [ ] Losers Bracket Progression
- [ ] Grand Final Reset
- [ ] Double Elimination Reports
- [x] Automatic Winner Advancement
- [x] Winner Advancement Engine
- [x] Automatic Tournament Completion
- [x] Bronze Medal Match
- [x] Placement Matches
- [x] Best-of-3 Finals
- [ ] Best-of-5 Finals
- [x] Live Playoff Bracket
- [x] Court Assignment
- [x] Match Operations
- [ ] Referee Assignment
- [ ] Live TV Display
- [ ] Live Streaming
- [ ] Push Notifications
- [x] Tournament Court Assignment
- [x] Match Queue
- [x] Court Assignment Engine
- [x] Automatic Court Assignment
- [ ] AI Court Optimization
- [x] Tournament Display Mode
- [x] Tournament Templates
- [x] Tournament Settings
- [x] Advanced Seeding
- [ ] Team Events
- [ ] Template Import/Export
- [ ] Shared Organization Templates
- [ ] Public Live Sharing
- [ ] QR Code Access
- [ ] Remote Score Entry
- [ ] Court Optimization
- [ ] Referee Assignment
- [ ] Bronze Match
- [x] Consolation Bracket
- [ ] Double Elimination Tournament
- [ ] Single Elimination Tournament
- [ ] Pool Assignment Methods
- [ ] Elimination Bracket
- [ ] Advanced Tie-breakers
- [ ] Single Elimination
- [ ] Double Elimination
- [ ] Bracket Generator
- [ ] Seeding
- [ ] Tournament Standings
- [x] Tournament Reports
- [x] Tournament Summary
- [x] Tournament History
- [x] PDF Export
- [x] CSV Export
- [ ] Excel Export
- [ ] Email Reports
- [ ] Season Reports
- [ ] League Reports
- [x] Player Portal
- [ ] Player Login
- [ ] Messaging

## 🎨 Branding

- [x] Pickleball King Branding
- [ ] White Label Support
- [ ] Club Branding
- [ ] Theme Customization

## 🔐 Access Control

- [x] Role-Based Access Control
- [ ] Multi-Club Management
- [ ] Custom Roles
- [ ] Enterprise Edition

## 📅 League Management

- [x] League Management
- [ ] Team Leagues
- [ ] League Playoffs
- [ ] Promotion/Relegation

## 🗄️ Player Database

- [x] Player Database Architecture
- [ ] Player Management UI (edit/deactivate)
- [ ] Player Statistics
- [x] Club Rankings
- [ ] Season History
- [ ] DUPR Integration

## 🧑‍🤝‍🧑 Player Management

- [x] Player Management
  - Player Directory
  - Player Profiles
  - Profile Photos
  - Player Statistics
  - Search
  - Sorting
  - Editing
  - TV Mode Integration
- [ ] Online Payments
- [ ] Auto Renewal
- [ ] Family Memberships

## ⭐ Club Rating & Ranking Engine

- [x] Club Rating Engine
- [x] Rating History
- [x] Club Leaderboards
- [ ] DUPR Integration
- [ ] National Rankings
- [ ] Cross-Club Ratings

## ✅ Completed

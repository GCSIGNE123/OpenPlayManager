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
  - The Upcoming Match Queue never sits empty while 4+ waiting players could form a complete match
- [ ] Progressive Skill Rotation
- [x] Progressive Skill Rotation automatically falls back to a randomized first round when all registered players belong to the same skill level. Normal Progressive Skill Rotation resumes from Round 2 onward.
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

import { useState } from "react";
import { styles } from "../styles.js";
import SectionLabel from "./SectionLabel.jsx";
import TournamentScheduleView from "./TournamentScheduleView.jsx";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "participants", label: "Participants" },
  { id: "schedule", label: "Schedule" },
  { id: "standings", label: "Standings" },
  { id: "bracket", label: "Bracket" },
];

// Static placeholder panel — no data, no logic. Overview/Participants/
// Standings/Bracket are all this for now; only Schedule (see below) is a
// real, working feature, carried over unchanged from the prior Round Robin
// Scheduler task.
function Placeholder({ children }) {
  return <div style={styles.placeholderCard}>{children}</div>;
}

// Tournament Dashboard — the umbrella page the Tournament Engine Foundation
// task asks for. Only the Schedule tab does anything real; every other tab
// is an explicit placeholder per that task's "no tournament logic yet"
// scope. Reachable from the session nav's "Tournament" tab, shown only when
// state.sessionType === "tournament" — see PickleballOpenPlay.jsx.
export default function TournamentDashboardView({ state, tournamentId, onGenerate, generating, generateError }) {
  const [tab, setTab] = useState("overview");

  return (
    <div>
      <SectionLabel>Tournament Dashboard</SectionLabel>
      <div style={styles.dashboardTabRow}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            style={styles.dashboardTabBtn(tab === t.id)}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <Placeholder>
          Tournament overview — format, courts, participant count, and status at a glance. Coming soon.
        </Placeholder>
      )}

      {tab === "participants" && (
        <Placeholder>Manage tournament participants and seeding. Coming soon.</Placeholder>
      )}

      {tab === "schedule" && (
        <TournamentScheduleView
          state={state}
          tournamentId={tournamentId}
          onGenerate={onGenerate}
          generating={generating}
          generateError={generateError}
        />
      )}

      {tab === "standings" && <Placeholder>Tournament standings. Coming soon.</Placeholder>}

      {tab === "bracket" && <Placeholder>Elimination bracket view. Coming soon.</Placeholder>}
    </div>
  );
}

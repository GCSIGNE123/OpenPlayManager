import { podiumStyles } from "../podiumStyles.js";
import { podiumStatusText } from "../lib/podium.js";
import PodiumPanel from "./PodiumPanel.jsx";

// Division Podiums — see lib/podium.js ("DIVISION PODIUMS"). Renders the
// list computePodiums / finalPodiumsForDisplay returns:
//
//   - one podium  → exactly the PodiumPanel every surface showed before
//     (Continuous Queue, Winner Pool, Progressive Skill, pre-division
//     saved reports), so nothing changes for those sessions;
//   - two podiums (Skill Divisions) → ONE heading, ONE status line / ONE
//     locked countdown (the unlock time is shared), then a Beginner podium
//     and an Intermediate podium side by side, each titled by its division.
//
// Purely presentational — the ranking, unlock and min-games decisions are
// all made in lib/podium.js.
export default function PodiumBoard({ podiums, dark = false, medalSize }) {
  if (!podiums || podiums.length === 0) return null;
  if (podiums.length === 1) return <PodiumPanel podium={podiums[0]} dark={dark} medalSize={medalSize} />;

  const s = podiumStyles(dark);
  const lead = podiums[0];
  const final = Boolean(lead.final);
  const heading = final ? "Final Podium" : "Running Podium";

  // Locked: the countdown is the same for both divisions — show it once,
  // titled for both, instead of two identical banners.
  if (!final && !lead.unlocked) {
    return (
      <PodiumPanel
        podium={{ ...lead, division: null, divisionLabel: null }}
        dark={dark}
        medalSize={medalSize}
        title={`${heading} — ${podiums.map((p) => p.divisionLabel).join(" & ")}`}
      />
    );
  }

  const status = final
    ? "Final podium — one champion per division"
    : podiumStatusText({ ...lead, division: null, divisionLabel: null, places: podiums.flatMap((p) => p.places) });

  return (
    <div style={s.wrap} data-testid="podium-board">
      <div style={s.headRow}>
        <h3 style={s.title}>{heading}</h3>
        <p style={s.status}>{status}</p>
      </div>
      {final && <p style={s.congrats}>Congratulations!</p>}
      <div style={s.boardGrid}>
        {podiums.map((p) => (
          <PodiumPanel key={p.division || "overall"} podium={p} dark={dark} nested medalSize={medalSize} />
        ))}
      </div>
    </div>
  );
}

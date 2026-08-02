import { useEffect, useState } from "react";

function formatMinutes(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  return minutes;
}

// Smart Queue Management — see PROJECT.md/FEATURES.md. A small, self-
// ticking display: "Waiting Xm" once a player has played at least one
// match (measured from lastMatchEndAt), or "Checked in Xm ago" for a
// player who hasn't played yet this session (measured from checkedInAt).
// Ticks on its own client-side interval — never writes to session state,
// so every device shows a live-updating timer without triggering a save.
export default function WaitingTimer({ player }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((n) => n + 1), 15000);
    return () => clearInterval(interval);
  }, []);

  const since = player?.lastMatchEndAt || player?.checkedInAt;
  if (!since) return null;

  const minutes = formatMinutes(Date.now() - since);
  const label = player.lastMatchEndAt ? "Waiting" : "Checked in";
  const suffix = player.lastMatchEndAt ? "" : " ago";

  return (
    <span>
      {label} {minutes}m{suffix}
    </span>
  );
}

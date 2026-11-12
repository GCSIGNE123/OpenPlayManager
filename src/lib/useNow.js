import { useEffect, useState } from "react";

// A clock that re-renders on a fixed interval — used by the Running Podium
// surfaces (Live Board, Standings tab) for their "N min to go" countdown,
// which otherwise only updates when some session event triggers a render.
// Same idea as WaitingTimer.jsx's own ticker, just shared.
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

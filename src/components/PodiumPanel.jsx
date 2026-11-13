import { podiumStyles } from "../podiumStyles.js";
import { podiumStatusText, PODIUM_PLACES } from "../lib/podium.js";
import Avatar from "./Avatar.jsx";
import MedalIcon from "./MedalIcon.jsx";

// Running Podium — Champion / Runner-up / 3rd Place, laid out 2 | 1 | 3 with
// the champion standing taller (the familiar podium shape). Purely
// presentational: everything it shows comes from lib/podium.js's
// computePodium (live) or finalPodium (report / public summary) — this
// component never ranks anyone itself.
//
// `podium` shape: { final, unlocked, unlockMinutes, minGames, minutesToGo,
// division?, divisionLabel?,
// places: [{ rank, label, name, photo?, wins, losses, games, winPct, out }] }
// `dark` selects the TV Mode palette (podiumStyles.js).
// `nested` — one division's podium inside a PodiumBoard: the heading is the
// division name, and the board (not this panel) owns the status line and
// the "Congratulations!".
export default function PodiumPanel({ podium, dark = false, title, hideHeader = false, nested = false, medalSize }) {
  if (!podium) return null;
  const s = podiumStyles(dark);
  const medal = medalSize || (dark ? 74 : 58);
  const status = podiumStatusText(podium);
  const heading = title || (podium.divisionLabel ? `${podium.divisionLabel}${nested ? "" : " Podium"}` : podium.final ? "Final Podium" : "Running Podium");
  const titleStyle = nested ? s.divisionTitle : s.title;

  // ---- locked (time gate not reached yet) or nobody qualified yet ----
  if (!podium.unlocked || podium.places.length === 0) {
    return (
      <div style={s.wrap} data-testid="podium-locked" data-division={podium.division || undefined}>
        {!hideHeader && (
          <div style={s.headRow}>
            <h3 style={titleStyle}>{heading}</h3>
          </div>
        )}
        <div style={s.lockedBanner}>
          <div style={s.lockedMedals}>
            <MedalIcon rank={2} size={Math.round(medal * 0.5)} />
            <MedalIcon rank={1} size={Math.round(medal * 0.62)} />
            <MedalIcon rank={3} size={Math.round(medal * 0.5)} />
          </div>
          <span style={{ flex: 1, minWidth: 0 }}>{status}</span>
          {!podium.unlocked && podium.minutesToGo > 1 && <span style={s.lockedCountdown}>{podium.minutesToGo} min</span>}
        </div>
      </div>
    );
  }

  // ---- unlocked: 2 | 1 | 3 ----
  const byRank = Object.fromEntries(podium.places.map((p) => [p.rank, p]));
  const order = [2, 1, 3];

  return (
    <div style={s.wrap} data-testid="podium" data-division={podium.division || undefined}>
      {!hideHeader && (
        <div style={s.headRow}>
          <h3 style={titleStyle}>{heading}</h3>
          {!nested && <p style={s.status}>{status}</p>}
        </div>
      )}
      {podium.final && !nested && <p style={s.congrats}>Congratulations!</p>}
      <div style={s.cards}>
        {order.map((rank) => {
          const place = byRank[rank];
          const meta = PODIUM_PLACES.find((p) => p.rank === rank);
          if (!place) {
            return (
              <div key={rank} style={s.emptySlot} title={`${meta.label} — not decided yet`}>
                {meta.label}: —
              </div>
            );
          }
          const winPct = Math.round((place.winPct || 0) * 100);
          return (
            <div key={rank} style={s.card(rank)} data-testid={`podium-place-${rank}`}>
              <div style={s.medalSlot}>
                <MedalIcon rank={rank} size={rank === 1 ? medal : Math.round(medal * 0.85)} />
              </div>
              <div style={s.avatarRing(rank)}>
                <Avatar player={{ name: place.name, photo: place.photo || null }} size={dark ? 54 : 42} />
              </div>
              <span style={s.nameRow}>
                <span style={s.name} title={place.name}>
                  {place.name}
                </span>
                {place.out && (
                  <span style={s.outTag} title="Checked out — keeps their place in the standings">
                    out
                  </span>
                )}
              </span>
              <span style={s.record}>
                {place.wins}–{place.losses}
              </span>
              <span style={s.detail}>
                {winPct}% · {place.games} game{place.games === 1 ? "" : "s"}
              </span>
              <span style={s.placeLabel(rank)}>{place.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Gold / silver / bronze medal — hand-drawn SVG, used by the Running
// Podium cards, the Standings tab's top-3 rows and TV Mode (replacing the
// emoji medals, which render differently on every TV/phone and can't be
// styled). A wide V-ribbon in the brand navy with an orange stripe, a
// ridged rim, layered metallic radial gradients, a faint star behind the
// rank number, and a glint.
//
// Purely presentational. Gradient ids are stable per rank (not per
// instance): several medals of the same rank on one page reference one
// identical definition, which SVG resolves correctly; the three ranks never
// share an id.
const METALS = {
  1: { light: "#FFF8CC", mid: "#F7CF4A", deep: "#C9930F", rim: "#8C5E00", edge: "#5E3E00", text: "#5A3A00", glow: "rgba(247,207,74,0.55)" },
  2: { light: "#FFFFFF", mid: "#DCE2E9", deep: "#97A3B1", rim: "#6A7684", edge: "#4A5563", text: "#3C4854", glow: "rgba(220,226,233,0.5)" },
  3: { light: "#FAD9B8", mid: "#D6924F", deep: "#9A5520", rim: "#6B3610", edge: "#47230A", text: "#4A2408", glow: "rgba(214,146,79,0.5)" },
};

const RIBBON = { navy: "#16355E", navyDark: "#0E2540", orange: "#F7941D", orangeDark: "#C96F0C" };

// five-point star centred at (cx, cy)
function starPoints(cx, cy, outer, inner) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

export default function MedalIcon({ rank = 1, size = 48, title, style }) {
  const m = METALS[rank] || METALS[3];
  const id = `pk-medal-${rank}`;
  // viewBox 0 0 100 132 — ribbon on top, disc below
  return (
    <svg
      width={size}
      height={Math.round(size * 1.32)}
      viewBox="0 0 100 132"
      role="img"
      aria-label={title || (rank === 1 ? "Gold medal" : rank === 2 ? "Silver medal" : "Bronze medal")}
      style={{ display: "block", flexShrink: 0, overflow: "visible", ...style }}
    >
      <defs>
        <radialGradient id={`${id}-face`} cx="36%" cy="30%" r="72%">
          <stop offset="0%" stopColor={m.light} />
          <stop offset="42%" stopColor={m.mid} />
          <stop offset="100%" stopColor={m.deep} />
        </radialGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={m.light} />
          <stop offset="48%" stopColor={m.deep} />
          <stop offset="100%" stopColor={m.edge} />
        </linearGradient>
        <linearGradient id={`${id}-ribbon`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={RIBBON.navy} />
          <stop offset="100%" stopColor={RIBBON.navyDark} />
        </linearGradient>
        <linearGradient id={`${id}-stripe`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={RIBBON.orange} />
          <stop offset="100%" stopColor={RIBBON.orangeDark} />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2.2" floodColor="#000" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* ribbon: a wide V with a notch, two straps meeting behind the disc */}
      <g filter={`url(#${id}-shadow)`}>
        <path d="M14 0 H40 L50 28 L60 0 H86 L62 58 H38 Z" fill={`url(#${id}-ribbon)`} />
        {/* orange stripe down each strap */}
        <path d="M27 0 L45 46 M73 0 L55 46" fill="none" stroke={`url(#${id}-stripe)`} strokeWidth="6" strokeLinecap="butt" />
        <path d="M14 0 H40 L50 28 L60 0 H86 L62 58 H38 Z" fill="none" stroke={RIBBON.navyDark} strokeWidth="1.5" strokeLinejoin="round" />
      </g>

      {/* clasp joining ribbon to disc */}
      <rect x="42" y="52" width="16" height="8" rx="2" fill={`url(#${id}-rim)`} stroke={m.edge} strokeWidth="1" />

      {/* soft glow */}
      <circle cx="50" cy="92" r="42" fill={m.glow} />

      {/* disc: outer rim, ridge, face */}
      <g filter={`url(#${id}-shadow)`}>
        <circle cx="50" cy="92" r="38" fill={`url(#${id}-rim)`} />
      </g>
      <circle cx="50" cy="92" r="35" fill="none" stroke={m.edge} strokeWidth="1.4" strokeDasharray="2.4 2" opacity="0.8" />
      <circle cx="50" cy="92" r="31.5" fill={`url(#${id}-face)`} />
      <circle cx="50" cy="92" r="31.5" fill="none" stroke={m.rim} strokeWidth="1.6" opacity="0.7" />

      {/* faint star behind the number */}
      <polygon points={starPoints(50, 92, 25, 11)} fill={m.rim} opacity="0.22" />

      {/* glint */}
      <ellipse cx="37" cy="74" rx="11" ry="5.5" fill="#fff" opacity="0.6" transform="rotate(-32 37 74)" />

      {/* rank number */}
      <text
        x="50"
        y="105"
        textAnchor="middle"
        fontFamily="'Anton', 'Arial Black', 'Helvetica Neue', Arial, sans-serif"
        fontWeight="900"
        fontSize="38"
        fill={m.text}
        stroke="#fff"
        strokeWidth="1.4"
        paintOrder="stroke"
      >
        {rank}
      </text>
    </svg>
  );
}

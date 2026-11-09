/**
 * Line-art illustrations: thin grey construction lines, solid electric-blue focal shapes,
 * small green and lilac pixel accents. All drawn for Bench; no third-party artwork.
 */
const B = "var(--color-blue)";
const G = "var(--color-green)";
const L = "var(--color-lilac)";
const LINE = "#c9ced6";
const SOFT = "#e8eaed";

function Dots({ x, y, n = 4, c = B }: { x: number; y: number; n?: number; c?: string }) {
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={x + i * 9} y={y} width="5" height="5" fill={i % 2 ? SOFT : c} />
      ))}
    </g>
  );
}

/** Floating pixel confetti for the landing hero. */
export function HeroPixels() {
  const bars: [number, number, number, string][] = [
    [6, 14, 18, L], [9, 30, 12, G], [14, 8, 10, B], [20, 22, 16, L], [84, 12, 14, G],
    [88, 26, 20, L], [92, 6, 10, B], [78, 70, 12, G], [10, 72, 14, B], [16, 80, 10, L],
    [70, 18, 8, B], [28, 12, 8, G], [62, 82, 10, L], [94, 64, 12, B],
  ];
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden overflow-hidden sm:block">
      {bars.map(([l, t, h, c], i) => (
        <span
          key={i}
          className="absolute w-[6px] rounded-[1px] opacity-70"
          style={{ left: `${l}%`, top: `${t}%`, height: h, background: c, animation: `rise 900ms ${i * 60}ms both` }}
        />
      ))}
    </div>
  );
}

export function EscrowArt() {
  return (
    <svg viewBox="0 0 420 260" className="h-full w-full" aria-hidden="true">
      <g stroke={LINE} fill="none">
        <rect x="130" y="40" width="160" height="180" rx="6" />
        <rect x="145" y="55" width="130" height="150" rx="4" strokeDasharray="3 4" />
        <path d="M40 130h90M290 130h90" />
        <circle cx="40" cy="130" r="4" fill="#fff" />
        <circle cx="380" cy="130" r="4" fill="#fff" />
      </g>
      <rect x="180" y="88" width="60" height="52" rx="6" fill={B} />
      <path d="M195 88v-12a15 15 0 0130 0v12" stroke={B} strokeWidth="6" fill="none" />
      <circle cx="210" cy="112" r="6" fill="#fff" />
      <rect x="207" y="114" width="6" height="14" fill="#fff" />
      <g>
        <rect x="160" y="160" width="100" height="8" rx="2" fill={SOFT} />
        <rect x="160" y="176" width="74" height="8" rx="2" fill={SOFT} />
      </g>
      <Dots x={60} y={100} c={G} />
      <Dots x={326} y={152} c={L} />
      <rect x="22" y="196" width="40" height="40" rx="4" stroke={LINE} fill="none" />
      <rect x="32" y="206" width="20" height="20" fill={G} opacity=".8" />
      <rect x="360" y="24" width="36" height="36" rx="4" stroke={LINE} fill="none" />
      <rect x="369" y="33" width="18" height="18" fill={B} />
    </svg>
  );
}

export function JuryArt() {
  const nodes = [
    [210, 38], [342, 98], [300, 222], [120, 222], [78, 98],
  ] as const;
  return (
    <svg viewBox="0 0 420 260" className="h-full w-full" aria-hidden="true">
      <g stroke={LINE} fill="none">
        {nodes.map(([x, y], i) => (
          <path key={i} d={`M210 130L${x} ${y}`} />
        ))}
        <circle cx="210" cy="130" r="92" strokeDasharray="2 5" />
      </g>
      {nodes.map(([x, y], i) => (
        <g key={i}>
          <rect x={x - 16} y={y - 16} width="32" height="32" rx="7" fill="#fff" stroke={i === 2 ? G : B} strokeWidth="2" />
          <path d={`M${x - 6} ${y}l4 4 8-8`} stroke={i === 2 ? G : B} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </g>
      ))}
      <rect x="182" y="102" width="56" height="56" rx="10" fill={B} />
      <rect x="196" y="122" width="28" height="5" rx="1" fill="#fff" />
      <rect x="199" y="127" width="4" height="10" fill="#fff" />
      <rect x="217" y="127" width="4" height="10" fill="#fff" />
      <Dots x={24} y={30} c={L} />
      <Dots x={350} y={230} c={G} />
    </svg>
  );
}

export function VerdictArt() {
  return (
    <svg viewBox="0 0 420 260" className="h-full w-full" aria-hidden="true">
      <g stroke={LINE} fill="none">
        {[60, 90, 120, 150, 180, 210].map((y) => (
          <path key={y} d={`M30 ${y}h110M280 ${y}h110`} />
        ))}
        <path d="M140 130h140" strokeWidth="1.5" />
      </g>
      <rect x="110" y="96" width="68" height="68" rx="12" fill={B} />
      <circle cx="144" cy="130" r="17" fill="none" stroke="#fff" strokeWidth="5" />
      <rect x="250" y="96" width="68" height="68" rx="12" fill="#fff" stroke={B} strokeWidth="2" />
      <path d="M268 130l10 10 20-22" stroke={B} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {[196, 210, 224].map((x, i) => (
        <rect key={x} x={x} y="126" width="8" height="8" fill={[G, B, L][i]} />
      ))}
      <Dots x={40} y={40} c={G} n={3} />
      <Dots x={344} y={214} c={L} n={3} />
    </svg>
  );
}

export function AppealArt() {
  return (
    <svg viewBox="0 0 420 260" className="h-full w-full" aria-hidden="true">
      <g fill="none">
        <circle cx="140" cy="130" r="40" stroke={B} strokeWidth="2" />
        <circle cx="140" cy="130" r="64" stroke={LINE} />
        <circle cx="140" cy="130" r="88" stroke={LINE} strokeDasharray="3 5" />
        <circle cx="300" cy="130" r="28" stroke={G} strokeWidth="2" />
        <circle cx="300" cy="130" r="48" stroke={LINE} />
        <path d="M228 130h44" stroke={LINE} />
      </g>
      <rect x="124" y="114" width="32" height="32" rx="6" fill={B} />
      <path d="M290 130h20M300 120v20" stroke={G} strokeWidth="4" strokeLinecap="round" />
      {Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2;
        return <rect key={i} x={140 + Math.cos(a) * 64 - 4} y={130 + Math.sin(a) * 64 - 4} width="8" height="8" fill={i % 3 === 0 ? L : B} />;
      })}
      <Dots x={340} y={36} c={L} n={3} />
    </svg>
  );
}

/** Four-stage pipeline used on /how-it-works. */
export function PipelineArt({ step }: { step: 1 | 2 | 3 | 4 }) {
  const arts = { 1: <EscrowArt />, 2: <DeliveryArt />, 3: <JuryArt />, 4: <VerdictArt /> } as const;
  return arts[step];
}

export function DeliveryArt() {
  return (
    <svg viewBox="0 0 420 260" className="h-full w-full" aria-hidden="true">
      <g stroke={LINE} fill="none">
        <rect x="70" y="50" width="120" height="160" rx="8" />
        <rect x="230" y="50" width="120" height="160" rx="8" />
        <path d="M190 130h40" strokeDasharray="3 4" />
      </g>
      <rect x="88" y="70" width="84" height="10" rx="2" fill={SOFT} />
      <rect x="88" y="90" width="66" height="10" rx="2" fill={SOFT} />
      <rect x="88" y="150" width="84" height="40" rx="6" fill={L} opacity=".55" />
      <text x="130" y="175" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="#3a2d8f">commit</text>
      <rect x="248" y="70" width="84" height="10" rx="2" fill={SOFT} />
      <rect x="248" y="90" width="84" height="10" rx="2" fill={SOFT} />
      <rect x="248" y="110" width="58" height="10" rx="2" fill={SOFT} />
      <rect x="248" y="150" width="84" height="40" rx="6" fill={B} />
      <text x="290" y="175" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="#fff">reveal</text>
      <Dots x={30} y={226} c={G} n={3} />
    </svg>
  );
}

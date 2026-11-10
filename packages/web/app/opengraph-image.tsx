import { ImageResponse } from "next/og";

export const alt = "Bench: the neutral judge for onchain agreements";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const Mark = ({ s = 64 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 32 32">
    <rect width="32" height="32" rx="7" fill="#1f3cff" />
    <rect x="7" y="12" width="18" height="4" rx="1" fill="#fff" />
    <rect x="9" y="16" width="3" height="7" rx="1" fill="#fff" />
    <rect x="20" y="16" width="3" height="7" rx="1" fill="#fff" />
  </svg>
);

export default function OgImage() {
  const pixels: [number, number, number, string][] = [
    [1080, 110, 18, "#1f3cff"], [1110, 430, 26, "#b8a5ff"], [990, 520, 14, "#66c800"], [1020, 250, 12, "#66c800"],
    [1150, 320, 16, "#1f3cff"], [940, 70, 12, "#b8a5ff"], [960, 180, 20, "#b8a5ff"],
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#fff", padding: 80, position: "relative" }}>
        {pixels.map(([x, y, h, c], i) => (
          <div key={i} style={{ position: "absolute", left: x, top: y, width: 8, height: h, background: c, borderRadius: 2 }} />
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Mark />
          <span style={{ fontSize: 40, fontWeight: 600, color: "#0a0b0d", letterSpacing: -1 }}>Bench</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 70 }}>
          <span style={{ fontSize: 84, fontWeight: 600, color: "#0a0b0d", letterSpacing: -4, lineHeight: 1 }}>The neutral judge for</span>
          <span style={{ fontSize: 84, fontWeight: 600, color: "#0a0b0d", letterSpacing: -4, lineHeight: 1.05 }}>onchain agreements.</span>
        </div>
        <span style={{ marginTop: 36, fontSize: 30, color: "#5b616e", maxWidth: 900 }}>
          Arkhai escrows judged by a jury of independent GenLayer validators.
        </span>
        <div style={{ position: "absolute", left: 80, bottom: 60, display: "flex", gap: 36, fontSize: 24, color: "#8a919e" }}>
          <span>Internet Court</span>
          <span>GenLayer</span>
          <span>Arkhai</span>
        </div>
      </div>
    ),
    size,
  );
}

import { ImageResponse } from "next/og";
import { readVerdict } from "@/lib/read";

export const alt = "A Bench verdict";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Per-verdict card: the outcome, the demand and the jury's reason, so a shared link tells the story. */
export default async function VerdictOg({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const v = await readVerdict(id);
  const c = "ok" in v.verdict ? v.verdict.ok : undefined;
  const ok = c?.fulfilled;
  const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#fff", padding: 72 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <svg width={52} height={52} viewBox="0 0 32 32">
              <rect width="32" height="32" rx="7" fill="#1f3cff" />
              <rect x="7" y="12" width="18" height="4" rx="1" fill="#fff" />
              <rect x="9" y="16" width="3" height="7" rx="1" fill="#fff" />
              <rect x="20" y="16" width="3" height="7" rx="1" fill="#fff" />
            </svg>
            <span style={{ fontSize: 34, fontWeight: 600, color: "#0a0b0d" }}>Bench verdict</span>
          </div>
          <span style={{ fontSize: 22, color: "#8a919e" }}>{v.network === "studionet" ? "GenLayer Studionet" : "Testnet Bradbury"}</span>
        </div>
        {c ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 56 }}>
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                padding: "12px 28px",
                borderRadius: 999,
                fontSize: 34,
                fontWeight: 700,
                background: ok ? "#e7f6ee" : "#fdecea",
                color: ok ? "#0e8a4f" : "#d92d20",
              }}
            >
              {ok ? "Fulfilled" : "Not fulfilled"}
            </div>
            <span style={{ marginTop: 36, fontSize: 52, fontWeight: 600, color: "#0a0b0d", letterSpacing: -2, lineHeight: 1.1 }}>{clip(c.demand, 110)}</span>
            <span style={{ marginTop: 28, fontSize: 28, color: "#5b616e", lineHeight: 1.35 }}>{clip(c.reason, 170)}</span>
          </div>
        ) : (
          <span style={{ marginTop: 80, fontSize: 56, fontWeight: 600, color: "#0a0b0d" }}>Judged by a jury of GenLayer validators.</span>
        )}
      </div>
    ),
    size,
  );
}

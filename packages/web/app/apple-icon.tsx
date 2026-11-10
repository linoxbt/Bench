import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1f3cff" }}>
        <svg width={120} height={120} viewBox="0 0 32 32">
          <rect x="5" y="11" width="22" height="5" rx="1.2" fill="#fff" />
          <rect x="7.5" y="16" width="4" height="9" rx="1.2" fill="#fff" />
          <rect x="20.5" y="16" width="4" height="9" rx="1.2" fill="#fff" />
        </svg>
      </div>
    ),
    size,
  );
}

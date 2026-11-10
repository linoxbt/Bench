"use client";
import { useState } from "react";

export function CopyLink({ label = "Copy link" }: { label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="pill pill-secondary pill-sm"
      onClick={async () => {
        await navigator.clipboard?.writeText(window.location.href);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Link copied" : label}
    </button>
  );
}

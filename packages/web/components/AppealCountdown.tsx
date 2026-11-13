"use client";
import { useEffect, useState } from "react";

/** Live countdown to the end of the appeal window (then the verdict finalizes and lands on Alkahest). */
export function AppealCountdown({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const left = deadline - now;
  if (left <= 0) return <p className="text-sm text-muted">Appeal window closed: finalizing…</p>;
  const m = Math.floor(left / 60);
  const s = String(left % 60).padStart(2, "0");
  return (
    <p className="text-sm text-warn" role="timer" aria-live="off">
      Appeal window closes in {m}:{s}. Until then anyone can appeal (bench appeal --tx …) and a larger jury re-judges.
    </p>
  );
}

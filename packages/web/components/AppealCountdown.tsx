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
  // Finality normally follows within ~2 minutes. Much later than that, GenLayer itself is holding the transaction:
  // on Bradbury, transactions to one contract finalize in order, so one stuck transaction delays the ones after it.
  if (left < -15 * 60)
    return (
      <p className="text-sm text-warn">
        Appeal window closed {Math.round(-left / 60)} minutes ago, but GenLayer hasn&apos;t finalized this yet. The verdict lands on Alkahest when it
        does; nothing to do here. If the escrow expires first, the buyer can reclaim.
      </p>
    );
  if (left <= 0) return <p className="text-sm text-muted">Appeal window closed: finalizing…</p>;
  const m = Math.floor(left / 60);
  const s = String(left % 60).padStart(2, "0");
  return (
    <p className="text-sm text-warn" role="timer" aria-live="off">
      Appeal window closes in {m}:{s}. Until then anyone can appeal (bench appeal --tx …) and a larger jury re-judges.
    </p>
  );
}

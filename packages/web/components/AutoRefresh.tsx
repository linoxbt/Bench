"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

/**
 * Re-render the server page while something is still pending (a verdict, finality, settlement). Pauses while the tab
 * is hidden, never starts a refresh while one is in flight, and backs off (15 s → 60 s) so an idle page doesn't keep
 * the server busy. Pass active={false} once the page can't change any more.
 */
export function AutoRefresh({ seconds = 15, active = true }: { seconds?: number; active?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => {
    if (!active) return;
    let delay = seconds * 1000;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (!document.hidden && !pendingRef.current) startTransition(() => router.refresh());
      delay = Math.min(delay * 1.25, 60_000);
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, delay);
    const onVisible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        delay = seconds * 1000;
        timer = setTimeout(tick, 500);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, seconds, active]);
  return null;
}

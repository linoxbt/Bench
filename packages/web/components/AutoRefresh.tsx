"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-render the server page every `seconds` until the case is settled. */
export function AutoRefresh({ seconds = 15, active = true }: { seconds?: number; active?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds, active]);
  return null;
}

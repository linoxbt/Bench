"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Chevron, Close } from "./icons";

const KEY = "bench-announcement-v1";

export function Announcement() {
  const [hidden, setHidden] = useState(true);
  useEffect(() => setHidden(localStorage.getItem(KEY) === "1"), []);
  if (hidden) return null;
  return (
    <div className="relative bg-wash text-sm">
      <div className="mx-auto flex max-w-[1200px] items-center justify-center gap-3 px-12 py-2.5 text-center">
        <span className="text-ink">
          <span className="hidden sm:inline">The jury is live on GenLayer Studionet.</span>
          <span className="sm:hidden">The jury is live.</span>
        </span>
        <span className="hidden text-line sm:inline">|</span>
        <Link href="/preview" className="inline-flex items-center gap-1 font-medium text-blue">
          Ask it now <Chevron className="h-3 w-3" />
        </Link>
      </div>
      <button
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted hover:text-ink"
        aria-label="Dismiss announcement"
        onClick={() => {
          localStorage.setItem(KEY, "1");
          setHidden(true);
        }}
      >
        <Close className="h-4 w-4" />
      </button>
    </div>
  );
}

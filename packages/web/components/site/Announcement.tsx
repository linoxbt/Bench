"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Chevron, Close } from "./icons";

const KEY = "bench-announcement-v2";

export function Announcement() {
  const [hidden, setHidden] = useState(true);
  useEffect(() => setHidden(localStorage.getItem(KEY) === "1"), []);
  if (hidden) return null;
  return (
    <div className="relative bg-wash text-sm">
      <div className="mx-auto flex max-w-[1200px] items-center justify-center gap-3 px-12 py-2.5 text-center">
        <span className="text-ink">
          <span className="hidden sm:inline">Live on GenLayer Testnet Bradbury: real escrows, a real validator jury.</span>
          <span className="sm:hidden">Live on Bradbury.</span>
        </span>
        <span className="hidden text-line sm:inline">|</span>
        <Link href="/new" className="inline-flex items-center gap-1 font-medium text-blue">
          Lock an escrow <Chevron className="h-3 w-3" />
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

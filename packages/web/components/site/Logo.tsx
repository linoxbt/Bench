import Link from "next/link";

/** Bench's mark: a rounded tile with a bench seat (a bar on two legs). */
export function Mark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--color-blue)" />
      <rect x="7" y="12" width="18" height="4" rx="1" fill="#fff" />
      <rect x="9" y="16" width="3" height="7" rx="1" fill="#fff" />
      <rect x="20" y="16" width="3" height="7" rx="1" fill="#fff" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Bench home">
      <Mark />
      <span className="text-[1.15rem] font-semibold tracking-tight text-ink">Bench</span>
    </Link>
  );
}

import Link from "next/link";
import { PUBLIC } from "@/lib/config";
import { NAV } from "@/lib/nav";
import { IconGithub } from "./icons";
import { Mark } from "./Logo";

export function Footer() {
  return (
    <footer className="bg-white">
      <div className="mx-auto max-w-[1200px] px-5 pb-10 pt-16 sm:px-8">
        <div className="grid gap-12 md:grid-cols-[1.3fr_repeat(4,1fr)]">
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2.5">
              <Mark className="h-7 w-7" />
              <span className="font-semibold tracking-tight text-ink">Bench</span>
            </Link>
            <Link href="/status" className="inline-flex items-center gap-2 text-sm font-medium text-blue">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue opacity-40" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue" />
              </span>
              Live on Testnet Bradbury
            </Link>
            <p className="max-w-[16rem] text-sm text-muted">The neutral judge for natural-language escrows.</p>
            <a href={PUBLIC.repo} target="_blank" rel="noreferrer" aria-label="GitHub" className="inline-flex text-muted hover:text-ink">
              <IconGithub />
            </a>
          </div>
          {NAV.map((s) => (
            <div key={s.label}>
              <p className="text-sm font-medium text-ink">{s.label}</p>
              <ul className="mt-4 space-y-2.5">
                {s.items.map((i) => (
                  <li key={i.href}>
                    {i.external ? (
                      <a href={i.href} target="_blank" rel="noreferrer" className="text-sm text-muted hover:text-ink">
                        {i.label}
                      </a>
                    ) : (
                      <Link href={i.href} className="text-sm text-muted hover:text-ink">
                        {i.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 flex flex-col gap-4 border-t border-line pt-8 text-sm text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Bench · MIT licensed · Built for the Internet Court Partner Demo Lab</p>
          <p className="flex flex-wrap gap-x-5 gap-y-1">
            <span>Internet Court</span>
            <span>GenLayer</span>
            <span>Arkhai</span>
          </p>
        </div>
      </div>
    </footer>
  );
}

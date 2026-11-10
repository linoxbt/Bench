"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NAV } from "@/lib/nav";
import { Chevron, ArrowUpRight } from "./icons";
import { Logo, Mark } from "./Logo";
import { ConnectButton } from "@/components/wallet/ConnectButton";

/**
 * Sticky header with desktop dropdowns and a hamburger that opens a full-screen menu.
 * The menu is portalled to <body>: the header's backdrop-filter would otherwise trap position: fixed.
 */
export function Header() {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const pathname = usePathname();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Close on navigation.
  useEffect(() => {
    setOpen(false);
    setHover(null);
  }, [pathname]);

  // Lock scroll, close on Escape, focus the close button.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-white/90 backdrop-blur-md supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex h-[72px] max-w-[1200px] items-center justify-between px-5 sm:px-8">
        <Logo />

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main" onMouseLeave={() => setHover(null)}>
          {NAV.map((s) => (
            <div key={s.label} className="relative" onMouseEnter={() => setHover(s.label)}>
              <button
                className={`flex items-center gap-1 rounded-lg px-3 py-2 text-[0.95rem] text-ink transition-colors hover:bg-wash ${hover === s.label ? "bg-wash" : ""}`}
                aria-expanded={hover === s.label}
                onClick={() => setHover(hover === s.label ? null : s.label)}
                onFocus={() => setHover(s.label)}
              >
                {s.label}
                <Chevron className={`h-3.5 w-3.5 text-muted transition-transform ${hover === s.label ? "-rotate-90" : "rotate-90"}`} />
              </button>
              {hover === s.label && (
                <div className="menu-in absolute left-1/2 top-full w-[22rem] -translate-x-1/2 pt-2">
                  <ul className="card p-2 shadow-[0_20px_50px_-20px_rgb(10_11_13/0.25)]">
                    {s.items.map((i) => (
                      <li key={i.href}>
                        <NavLink item={i} className="block rounded-xl px-3.5 py-3 hover:bg-wash" />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <ConnectButton />
          </div>
          <div className="sm:hidden">
            <ConnectButton compact />
          </div>
          <button
            className="flex h-10 w-10 items-center justify-center rounded-lg text-ink hover:bg-wash"
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen(true)}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
              <path d="M3 8h18M3 16h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {open &&
        createPortal(
        <div id="site-menu" role="dialog" aria-modal="true" aria-label="Menu" className="menu-in fixed inset-0 z-50 flex flex-col bg-white">
          <div className="mx-auto flex h-[72px] w-full max-w-[1200px] items-center justify-between px-5 sm:px-8">
            <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
              <Mark />
              <span className="text-[1.15rem] font-semibold tracking-tight text-ink">Bench</span>
            </Link>
            <button
              ref={closeRef}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-ink hover:bg-wash"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto grid max-w-[1200px] gap-x-16 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[1fr_22rem]">
              <ul>
                {NAV.map((s) => {
                  const expanded = section === s.label;
                  return (
                    <li key={s.label} className="border-b border-line">
                      <button
                        className="flex w-full items-center justify-between py-6 text-left"
                        aria-expanded={expanded}
                        onClick={() => setSection(expanded ? null : s.label)}
                      >
                        <span className="headline text-[2rem] sm:text-[2.6rem]">{s.label}</span>
                        <Chevron className={`h-6 w-6 text-ink transition-transform ${expanded ? "rotate-90" : ""}`} />
                      </button>
                      {expanded && (
                        <ul className="menu-in grid gap-1 pb-6 sm:grid-cols-2">
                          {s.items.map((i) => (
                            <li key={i.href}>
                              <NavLink item={i} className="block rounded-xl px-4 py-3.5 hover:bg-wash" onClick={() => setOpen(false)} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
              <aside className="mt-10 space-y-4 lg:mt-6">
                <div className="rounded-2xl border border-line p-5">
                  <p className="mb-3 text-sm text-muted">Wallet</p>
                  <ConnectButton full />
                </div>
                <div className="rounded-2xl bg-blue p-6 text-white">
                  <p className="text-sm text-white/75">Live on Studionet</p>
                  <p className="mt-2 text-xl font-medium leading-snug">Ask a real validator jury about any demand and delivery.</p>
                  <Link href="/preview" className="pill pill-invert pill-sm mt-5" onClick={() => setOpen(false)}>
                    Try the jury
                  </Link>
                </div>
                <div className="rounded-2xl bg-wash p-6">
                  <p className="text-sm text-muted">For agents and builders</p>
                  <p className="mt-2 font-medium text-ink">One CLI, one skill, any agent.</p>
                  <Link href="/developers" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue" onClick={() => setOpen(false)}>
                    Developer guide <Chevron className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </aside>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </header>
  );
}

function NavLink({
  item,
  className,
  onClick,
}: {
  item: { label: string; href: string; description?: string; external?: boolean };
  className?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 font-medium text-ink">
        {item.label}
        {item.external && <ArrowUpRight className="h-3.5 w-3.5 text-muted" />}
      </span>
      {item.description && <span className="mt-0.5 block text-sm text-muted">{item.description}</span>}
    </>
  );
  return item.external ? (
    <a href={item.href} target="_blank" rel="noreferrer" className={className} onClick={onClick}>
      {body}
    </a>
  ) : (
    <Link href={item.href} className={className} onClick={onClick}>
      {body}
    </Link>
  );
}

import type { ReactNode } from "react";

export function Card({ title, right, children, className = "" }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-6 sm:p-7 ${className}`}>
      {(title || right) && (
        <header className="mb-5 flex items-center justify-between gap-4">
          {title && <h2 className="text-[1.05rem] font-medium text-ink">{title}</h2>}
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Hash({ value, href, chars = 10 }: { value: string; href?: string; chars?: number }) {
  const short = value.length > chars * 2 ? `${value.slice(0, chars)}…${value.slice(-6)}` : value;
  const body = (
    <span className="font-mono text-[0.85em] text-ink" title={value}>
      {short}
    </span>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-4 hover:decoration-blue">
      {body}
    </a>
  ) : (
    body
  );
}

export function Stamp({ fulfilled, reason }: { fulfilled: boolean; reason?: string }) {
  return (
    <div className="rise space-y-3">
      <div
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-base font-semibold ${fulfilled ? "bg-[#e7f6ee] text-pass" : "bg-[#fdecea] text-fail"}`}
      >
        <span className={`h-2 w-2 rounded-full ${fulfilled ? "bg-pass" : "bg-fail"}`} />
        {fulfilled ? "Fulfilled" : "Not fulfilled"}
      </div>
      {reason && <p className="text-[0.95rem] leading-relaxed text-ink">{reason}</p>}
    </div>
  );
}

export function Note({ children, tone = "dim" }: { children: ReactNode; tone?: "dim" | "warn" | "fail" }) {
  const c = {
    dim: "bg-wash text-muted",
    warn: "bg-[#fff4e5] text-warn",
    fail: "bg-[#fdecea] text-fail",
  }[tone];
  return <p className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${c}`}>{children}</p>;
}

/** Compact header for app pages. */
export function AppHeader({ eyebrow, title, lede, children }: { eyebrow: string; title: string; lede?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-6 pb-10 pt-12 sm:flex-row sm:items-end sm:justify-between sm:pt-16">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display mt-3 text-[2.4rem] sm:text-[3.2rem]">{title}</h1>
        {lede && <p className="mt-4 max-w-2xl text-muted">{lede}</p>}
      </div>
      {children}
    </div>
  );
}

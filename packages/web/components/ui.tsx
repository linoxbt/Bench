import type { ReactNode } from "react";

export function Card({ title, right, children, className = "" }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`bracket p-5 ${className}`}>
      {(title || right) && (
        <header className="mb-3 flex items-center justify-between gap-4">
          {title && <h2 className="label">{title}</h2>}
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
    <span className="font-mono text-teal" title={value}>
      {short}
    </span>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-4 hover:decoration-teal">
      {body}
    </a>
  ) : (
    body
  );
}

export function Stamp({ fulfilled, reason }: { fulfilled: boolean; reason?: string }) {
  const color = fulfilled ? "text-pass border-pass" : "text-fail border-fail";
  return (
    <div className="flex flex-col items-start gap-3">
      <div className={`flip-in -rotate-2 border-2 px-4 py-2 text-xl font-bold tracking-widest ${color}`}>
        {fulfilled ? "FULFILLED" : "NOT FULFILLED"}
      </div>
      {reason && <p className="text-sm text-text/90">{reason}</p>}
    </div>
  );
}

export function Note({ children, tone = "dim" }: { children: ReactNode; tone?: "dim" | "warn" | "fail" }) {
  const c = { dim: "text-dim border-line", warn: "text-warn border-warn/50", fail: "text-fail border-fail/50" }[tone];
  return <p className={`border-l-2 pl-3 text-sm ${c}`}>{children}</p>;
}

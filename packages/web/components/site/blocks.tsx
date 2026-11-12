import Link from "next/link";
import type { ReactNode } from "react";
import { Chevron } from "./icons";

export function Container({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={`mx-auto max-w-[1200px] scroll-mt-24 px-5 sm:px-8 ${className}`}>
      {children}
    </div>
  );
}

/** Hero for inner pages: eyebrow, big title, lede, optional actions. */
export function PageHero({
  eyebrow,
  title,
  lede,
  children,
  center = false,
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
  center?: boolean;
}) {
  return (
    <section className="pb-14 pt-16 sm:pb-20 sm:pt-24">
      <Container className={center ? "text-center" : ""}>
        {eyebrow && <p className="eyebrow rise">{eyebrow}</p>}
        <h1 className={`display rise mt-4 text-[2.6rem] sm:text-[4rem] lg:text-[4.6rem] ${center ? "mx-auto max-w-4xl" : "max-w-4xl"}`}>{title}</h1>
        {lede && (
          <p className={`rise mt-6 text-lg text-muted sm:text-xl ${center ? "mx-auto max-w-2xl" : "max-w-2xl"}`} style={{ animationDelay: "80ms" }}>
            {lede}
          </p>
        )}
        {children && (
          <div className={`rise mt-9 flex flex-wrap gap-3 ${center ? "justify-center" : ""}`} style={{ animationDelay: "140ms" }}>
            {children}
          </div>
        )}
      </Container>
    </section>
  );
}

/** "Bench **is** the …" style section heading with an optional pill link on the right. */
export function SectionHead({ title, lede, action }: { title: ReactNode; lede?: ReactNode; action?: { href: string; label: string } }) {
  return (
    <div className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <h2 className="headline text-[2rem] text-muted sm:text-[2.5rem]">{title}</h2>
        {lede && <p className="mt-4 text-muted">{lede}</p>}
      </div>
      {action && (
        <Link href={action.href} className="pill pill-secondary pill-sm self-start sm:self-auto">
          {action.label} <Chevron className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

export function Strong({ children }: { children: ReactNode }) {
  return <span className="text-ink">{children}</span>;
}

export function CtaBand({
  title = "Start judging with Bench.",
  lede = "Lock an escrow, deliver against it, and let a validator jury decide. Live on Testnet Bradbury; previews are free.",
}: {
  title?: string;
  lede?: string;
}) {
  return (
    <section className="bg-blue text-white">
      <Container className="py-20 sm:py-24">
        <h2 className="headline max-w-xl text-[2.2rem] !text-white sm:text-[2.8rem]">{title}</h2>
        <p className="mt-4 max-w-md text-white/75">{lede}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/preview" className="pill pill-invert">
            Try the jury
          </Link>
          <Link href="/developers" className="pill pill-onblue">
            Read the developer guide
          </Link>
        </div>
      </Container>
    </section>
  );
}

export function IconTile({ children }: { children: ReactNode }) {
  return <div className="flex h-11 w-11 items-center justify-center text-blue">{children}</div>;
}

export function LinkCard({ href, icon, title, body }: { href: string; icon: ReactNode; title: string; body: string }) {
  return (
    <Link href={href} className="card card-hover group relative block p-6">
      <Chevron className="absolute right-5 top-5 h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
      <IconTile>{icon}</IconTile>
      <h3 className="mt-5 text-lg font-medium text-ink">{title}</h3>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">{body}</p>
    </Link>
  );
}

export function FeatureCard({ art, title, body }: { art: ReactNode; title: string; body: string }) {
  return (
    <div>
      <div className="card flex aspect-[16/10] items-center justify-center overflow-hidden p-6">{art}</div>
      <h3 className="mt-5 text-lg font-medium text-ink">{title}</h3>
      <p className="mt-2 max-w-md text-[0.95rem] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

export function Code({ children, title }: { children: string; title?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-ink text-white">
      {title && (
        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="ml-2 font-mono text-xs text-white/50">{title}</span>
        </div>
      )}
      <pre className="code overflow-x-auto p-5 text-white/90">{children}</pre>
    </div>
  );
}

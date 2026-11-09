/**
 * Fixed partner strip so every screen recording frames all three names.
 * Drop the official logos (from each brand kit; never redrawn) into public/logos/ as
 * internet-court.svg, genlayer.svg and arkhai.svg and they replace the wordmarks automatically.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

const PARTNERS = [
  { name: "Internet Court", file: "internet-court.svg", href: "https://internetcourt.org" },
  { name: "GenLayer", file: "genlayer.svg", href: "https://genlayer.com" },
  { name: "Arkhai", file: "arkhai.svg", href: "https://arkhai.io" },
];

export function LogoStrip() {
  return (
    <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
        <span className="label hidden sm:inline">verification layer</span>
        <div className="flex items-center gap-8">
          {PARTNERS.map((p) => {
            const has = existsSync(join(process.cwd(), "public", "logos", p.file));
            return (
              <a key={p.name} href={p.href} target="_blank" rel="noreferrer" className="text-sm text-dim hover:text-text">
                {has ? <img src={`/logos/${p.file}`} alt={p.name} className="h-6 w-auto" /> : p.name}
              </a>
            );
          })}
        </div>
      </div>
    </footer>
  );
}

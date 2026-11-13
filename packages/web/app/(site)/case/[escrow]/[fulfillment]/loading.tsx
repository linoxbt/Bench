import { Container } from "@/components/site/blocks";

/** Shown while the server reads the chain (GenVM reads take a few seconds on Bradbury). */
export default function Loading() {
  return (
    <Container className="pb-24">
      <div className="space-y-6 pb-10 pt-12 sm:pt-16" role="status" aria-live="polite">
        <p className="eyebrow">Reading the chain…</p>
        <div className="h-10 w-2/3 animate-pulse rounded-xl bg-wash" />
        <div className="grid gap-6 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-wash" />
          ))}
        </div>
        <p className="text-sm text-muted">BenchJudge lives on GenLayer; each read runs the contract, so this takes a few seconds.</p>
      </div>
    </Container>
  );
}

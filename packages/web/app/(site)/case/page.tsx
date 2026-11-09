import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@/components/site/blocks";
import { AppHeader, Card, Note } from "@/components/ui";

export const metadata: Metadata = { title: "Open a case" };

export default async function OpenCase({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const uid = (v?: string) => (v && /^0x[0-9a-fA-F]{64}$/.test(v.trim()) ? v.trim().toLowerCase() : undefined);
  const e = uid(q.escrow);
  const f = uid(q.fulfillment);
  if (e && f) redirect(`/case/${e}/${f}${q.tx ? `?tx=${q.tx.trim()}` : ""}`);
  return (
    <Container className="pb-24">
      <AppHeader eyebrow="Case lookup" title="Open a case." lede="Follow an escrow from delivery to payout: the demand, the jury's votes, the verdict and the settlement." />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card title="Case uids">
          <form className="space-y-5" method="get">
            <label className="block space-y-2">
              <span className="label">escrowUid</span>
              <input className="field font-mono text-sm" name="escrow" defaultValue={q.escrow} placeholder="0x…" required />
            </label>
            <label className="block space-y-2">
              <span className="label">fulfillmentUid <span className="font-normal text-muted">(from bench deliver)</span></span>
              <input className="field font-mono text-sm" name="fulfillment" defaultValue={q.fulfillment} placeholder="0x…" />
            </label>
            <label className="block space-y-2">
              <span className="label">GenLayer tx <span className="font-normal text-muted">(from bench judge, optional: shows the jury)</span></span>
              <input className="field font-mono text-sm" name="tx" defaultValue={q.tx} placeholder="0x…" />
            </label>
            <button className="pill pill-primary" type="submit">
              View case
            </button>
            {q.escrow && !f && <Note>Waiting for the seller&apos;s delivery: add its fulfillmentUid once bench deliver prints it.</Note>}
          </form>
        </Card>
        <Card title="Where do uids come from?">
          <ul className="space-y-3 text-sm text-muted">
            <li><span className="font-medium text-ink">escrowUid</span> is printed by bench escrow or the Lock an escrow page.</li>
            <li><span className="font-medium text-ink">fulfillmentUid</span> is printed by bench deliver.</li>
            <li><span className="font-medium text-ink">GenLayer tx</span> is printed by bench judge.</li>
          </ul>
        </Card>
      </div>
    </Container>
  );
}

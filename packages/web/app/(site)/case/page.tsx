import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Hex } from "viem";
import { Container } from "@/components/site/blocks";
import { AppHeader, Card, Hash, Note } from "@/components/ui";
import { PUBLIC } from "@/lib/config";
import { escrowDeliveries } from "@/lib/read";

export const metadata: Metadata = { title: "Open a case" };
export const dynamic = "force-dynamic";

const uid = (v?: string) => (v && /^0x[0-9a-fA-F]{64}$/.test(v.trim()) ? (v.trim().toLowerCase() as Hex) : undefined);

export default async function OpenCase({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const e = uid(q.escrow);
  const f = uid(q.fulfillment);
  const tx = uid(q.tx);
  if (e && f) redirect(`/case/${e}/${f}${tx ? `?tx=${encodeURIComponent(tx)}` : ""}`);
  const bad = (v: string | undefined) => Boolean(v?.trim()) && !uid(v);

  // Escrow only: find its deliveries on chain, so nobody needs to have kept the fulfillmentUid.
  let found: Awaited<ReturnType<typeof escrowDeliveries>> | undefined;
  let lookupError: string | undefined;
  if (e && PUBLIC.judge) {
    try {
      found = await escrowDeliveries(e);
    } catch (err) {
      lookupError = err instanceof Error ? err.message.split("\n")[0] : String(err);
    }
  }

  return (
    <Container className="pb-24">
      <AppHeader eyebrow="Case lookup" title="Open a case." lede="Follow an escrow from delivery to payout: the demand, the jury's votes, the verdict and the settlement." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card title="Find a case">
            <form className="space-y-5" method="get">
              <label className="block space-y-2">
                <span className="label">escrowUid</span>
                <input className="field font-mono text-sm" name="escrow" defaultValue={q.escrow} placeholder="0x…" required />
              </label>
              <label className="block space-y-2">
                <span className="label">
                  fulfillmentUid <span className="font-normal text-muted">(optional: leave empty to list the escrow&apos;s deliveries)</span>
                </span>
                <input className="field font-mono text-sm" name="fulfillment" defaultValue={q.fulfillment} placeholder="0x…" />
              </label>
              <label className="block space-y-2">
                <span className="label">
                  GenLayer tx <span className="font-normal text-muted">(optional: shows the jury)</span>
                </span>
                <input className="field font-mono text-sm" name="tx" defaultValue={q.tx} placeholder="0x…" />
              </label>
              <button className="pill pill-primary" type="submit">
                View case
              </button>
              {(bad(q.escrow) || bad(q.fulfillment) || bad(q.tx)) && <Note tone="fail">Each uid and hash is 0x followed by 64 hex characters.</Note>}
            </form>
          </Card>

          {e && (
            <Card title="Deliveries for this escrow">
              {lookupError ? (
                <Note tone="fail">Couldn&apos;t read this escrow: {lookupError}</Note>
              ) : found && found.deliveries.length > 0 ? (
                <ul className="space-y-3 text-sm">
                  {found.deliveries.map((d) => (
                    <li key={d.fulfillmentUid} className="flex flex-wrap items-center justify-between gap-2">
                      <Link className="underline decoration-line underline-offset-4" href={`/case/${e}/${d.fulfillmentUid}`}>
                        <Hash value={d.fulfillmentUid} chars={10} />
                      </Link>
                      <span className="text-muted">
                        by <Hash value={d.recipient} chars={6} />
                        {d.revoked ? " · revoked" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : found ? (
                <Note>
                  No deliveries yet{found.escrow.revoked ? ", and the escrow is already settled" : ""}. Send the seller the delivery link:{" "}
                  <Link className="underline" href={`/deliver?escrow=${e}`}>
                    /deliver?escrow=…
                  </Link>
                </Note>
              ) : null}
            </Card>
          )}
        </div>
        <Card title="Where do uids come from?">
          <ul className="space-y-3 text-sm text-muted">
            <li>
              <span className="font-medium text-ink">escrowUid</span> is shown when you lock an escrow (or printed by bench escrow).
            </li>
            <li>
              <span className="font-medium text-ink">fulfillmentUid</span> is shown when the seller delivers; this page also finds it from the escrow.
            </li>
            <li>
              <span className="font-medium text-ink">GenLayer tx</span> is saved in this browser when you open a case (or printed by bench judge).
            </li>
          </ul>
        </Card>
      </div>
    </Container>
  );
}

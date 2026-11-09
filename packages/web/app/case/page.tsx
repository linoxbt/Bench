import { redirect } from "next/navigation";
import { Card, Note } from "@/components/ui";

export default async function OpenCase({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const uid = (v?: string) => (v && /^0x[0-9a-fA-F]{64}$/.test(v.trim()) ? v.trim().toLowerCase() : undefined);
  const e = uid(q.escrow);
  const f = uid(q.fulfillment);
  if (e && f) redirect(`/case/${e}/${f}${q.tx ? `?tx=${q.tx.trim()}` : ""}`);
  return (
    <Card title="Open a case">
      <form className="max-w-2xl space-y-4" method="get">
        <label className="block space-y-1">
          <span className="label">escrowUid</span>
          <input name="escrow" defaultValue={q.escrow} placeholder="0x…" required />
        </label>
        <label className="block space-y-1">
          <span className="label">fulfillmentUid (from bench deliver)</span>
          <input name="fulfillment" defaultValue={q.fulfillment} placeholder="0x…" />
        </label>
        <label className="block space-y-1">
          <span className="label">GenLayer tx (from bench judge, optional: shows the jury)</span>
          <input name="tx" defaultValue={q.tx} placeholder="0x…" />
        </label>
        <button className="btn btn-solid" type="submit">View case</button>
        {q.escrow && !f && <Note>Waiting for the seller&apos;s delivery: add its fulfillmentUid once `bench deliver` prints it.</Note>}
      </form>
    </Card>
  );
}

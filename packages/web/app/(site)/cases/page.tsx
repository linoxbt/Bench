import type { Metadata } from "next";
import Link from "next/link";
import { Container, PageHero } from "@/components/site/blocks";
import { PUBLIC } from "@/lib/config";
import { liveStats, recentCases, verdictHref } from "@/lib/read";

export const metadata: Metadata = { title: "Case explorer", description: "Every verdict on the record, read live from BenchJudge." };
export const revalidate = 20;

export default async function Cases() {
  const [cases, stats] = await Promise.all([recentCases(40), liveStats()]);
  const judge = PUBLIC.judge ?? PUBLIC.judgeStudionet;
  return (
    <>
      <PageHero
        eyebrow="Case explorer"
        title="Every verdict, on the record."
        lede={`Read live from BenchJudge on ${stats.network === "bradbury" ? "Testnet Bradbury" : "GenLayer Studionet"}. ${
          stats.cases === undefined ? "The network didn't answer just now; the count will be back shortly." : `${stats.cases} cases so far.`
        }`}
      >
        <Link href="/case" className="pill pill-primary">
          Open a case by uid
        </Link>
      </PageHero>
      <Container className="pb-28">
        {!judge ? (
          <p className="text-muted">No BenchJudge is configured for this deployment.</p>
        ) : stats.cases === undefined ? (
          <p className="text-muted">BenchJudge didn&apos;t answer just now. Refresh in a minute.</p>
        ) : cases.length === 0 ? (
          <p className="text-muted">No cases yet.</p>
        ) : (
          <div className="card divide-y divide-line">
            {cases.map(({ id, c, final }) => (
              <div key={id} className="grid gap-3 px-6 py-5 md:grid-cols-[8rem_1fr_auto] md:items-center">
                <span className="flex flex-col gap-1">
                  <span
                    className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-medium ${
                      !c ? "bg-wash text-muted" : c.fulfilled ? "bg-[#e7f6ee] text-pass" : "bg-[#fdecea] text-fail"
                    }`}
                  >
                    {c ? (c.fulfilled ? "Fulfilled" : "Not fulfilled") : "Unreadable"}
                  </span>
                  {c && !final && <span className="text-xs text-warn">in appeal window</span>}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{c?.demand ?? id}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{c?.reason}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="hidden max-w-[12rem] truncate font-mono text-xs text-faint lg:inline">{id}</span>
                  {c?.status === "preview" && <span className="rounded-full bg-wash px-3 py-1 text-xs text-muted">preview</span>}
                  <Link className="pill pill-secondary pill-sm" href={verdictHref(id)}>
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Container>
    </>
  );
}

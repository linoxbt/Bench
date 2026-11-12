import "server-only";
import {
  getArbitration,
  getCase,
  getEscrow,
  getTx,
  genlayer,
  juryFromTx,
  listCases,
  walletFromKey,
  type BenchConfig,
  type Case,
  type EscrowInfo,
  type Jury,
} from "@bench/core";
import { generatePrivateKey } from "viem/accounts";
import type { Hex } from "viem";
import { PUBLIC } from "./config";

/** Read-only: a throwaway key only satisfies the client constructors; nothing is ever signed with it. */
const reader = () => walletFromKey(generatePrivateKey());
const cfg = (): BenchConfig => ({ addresses: PUBLIC.alkahest, judge: PUBLIC.judge! });

/**
 * Decided cases never change (BenchJudge refuses to judge a delivery twice), and every GenVM read on Bradbury
 * costs ~6 s, so each server instance keeps the ones it has seen. Undecided lookups are never cached.
 */
const decided = new Map<string, Case>();
async function cachedCase(gl: ReturnType<typeof genlayer>, id: string, judge: Hex): Promise<Case | undefined> {
  const key = `${gl.network}:${judge}:${id}`.toLowerCase();
  const hit = decided.get(key);
  if (hit) return hit;
  const c = await getCase(gl, id, judge);
  if (c && (c.status === "decided" || c.status === "preview")) {
    if (decided.size > 1000) decided.delete(decided.keys().next().value!);
    decided.set(key, c);
  }
  return c;
}

async function settle<T>(p: Promise<T>): Promise<{ ok: T } | { err: string }> {
  try {
    return { ok: await p };
  } catch (e) {
    return { err: e instanceof Error ? e.message.split("\n")[0]! : String(e) };
  }
}

export type CaseView = {
  escrow: { ok: EscrowInfo } | { err: string };
  verdict: { ok: Case | undefined } | { err: string };
  arbitration: { ok: { decision: boolean } | undefined } | { err: string };
  jury?: { ok: Jury } | { err: string };
};

export async function readCase(escrowUid: Hex, fulfillmentUid: Hex, tx?: Hex): Promise<CaseView> {
  const gl = genlayer({ network: "bradbury" });
  const w = reader();
  const [escrow, verdict, arbitration, jury] = await Promise.all([
    settle(getEscrow(w, escrowUid, cfg())),
    settle(cachedCase(gl, fulfillmentUid, PUBLIC.judge!)),
    settle(getArbitration(w, escrowUid, fulfillmentUid, cfg())),
    tx ? settle(getTx(gl, tx).then(juryFromTx)) : Promise.resolve(undefined),
  ]);
  return { escrow, verdict, arbitration, jury };
}

/** Recent cases on Bradbury, or on the Studionet sandbox when no Bradbury judge is configured yet. */
export async function recentCases(limit = 8): Promise<{ id: string; c?: Case }[]> {
  const judge = PUBLIC.judge ?? PUBLIC.judgeStudionet;
  if (!judge) return [];
  const gl = genlayer({ network: PUBLIC.judge ? "bradbury" : "studionet" });
  const r = await settle(
    (async () => {
      const total = Number(await gl.client.readContract({ address: judge, functionName: "case_count", args: [] }));
      const ids = await listCases(gl, Math.max(0, total - limit), limit, judge);
      return Promise.all(ids.reverse().map(async (id) => ({ id, c: await cachedCase(gl, id, judge).catch(() => undefined) })));
    })(),
  );
  return "ok" in r ? r.ok : [];
}

/** Live numbers for the landing page; undefined when the network can't be reached. */
export async function liveStats(): Promise<{ cases?: number; network: "bradbury" | "studionet" }> {
  const judge = PUBLIC.judge ?? PUBLIC.judgeStudionet;
  const network = PUBLIC.judge ? "bradbury" : "studionet";
  if (!judge) return { network };
  const r = await settle(genlayer({ network }).client.readContract({ address: judge, functionName: "case_count", args: [] }));
  return { cases: "ok" in r ? Number(r.ok) : undefined, network };
}

export type VerdictView = {
  id: string;
  network: "bradbury" | "studionet";
  judge?: `0x${string}`;
  verdict: { ok: Case | undefined } | { err: string };
  jury?: { ok: Jury } | { err: string };
};

/** One verdict by case id (`preview:<id>` lives on the Studionet sandbox; fulfillment uids on Bradbury). */
export async function readVerdict(id: string, tx?: Hex): Promise<VerdictView> {
  const studio = id.startsWith("preview:") || !PUBLIC.judge;
  const network = studio ? "studionet" : "bradbury";
  const judge = studio ? PUBLIC.judgeStudionet : PUBLIC.judge;
  if (!judge) return { id, network, verdict: { err: "No BenchJudge is configured for this network." } };
  const gl = genlayer({ network });
  const [verdict, jury] = await Promise.all([
    settle(cachedCase(gl, id, judge)),
    tx ? settle(getTx(gl, tx).then(juryFromTx)) : Promise.resolve(undefined),
  ]);
  return { id, network, judge, verdict, jury };
}

export const verdictHref = (id: string, tx?: string) => `/cases/${encodeURIComponent(id)}${tx ? `?tx=${tx}` : ""}`;

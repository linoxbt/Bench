import "server-only";
import {
  ALKAHEST_BRADBURY,
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
const cfg = (): BenchConfig => ({ addresses: ALKAHEST_BRADBURY, judge: PUBLIC.judge! });

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
    settle(getCase(gl, fulfillmentUid, PUBLIC.judge)),
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
      return Promise.all(ids.reverse().map(async (id) => ({ id, c: await getCase(gl, id, judge).catch(() => undefined) })));
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

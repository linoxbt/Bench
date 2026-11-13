import "server-only";
import { cache } from "react";
import {
  checkCase,
  findDeliveries,
  getArbitration,
  getCase,
  getEscrow,

  genlayer,
  juryOf,
  listCases,
  readTokenLite,
  walletFromKey,
  type Arbitration,
  type BenchConfig,
  type Case,
  type EscrowInfo,
  type Jury,
} from "@bench/core";
import { createPublicClient, http, type Hex, type PublicClient } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { PUBLIC } from "./config";
import { walletChain } from "./chain";

/** Read-only: a throwaway key only satisfies the client constructors; nothing is ever signed with it. */
const reader = () => walletFromKey(generatePrivateKey(), PUBLIC.chainRpc);
const pub = () => createPublicClient({ chain: walletChain, transport: http(PUBLIC.chainRpc) }) as PublicClient;
const cfg = (): BenchConfig => ({ addresses: PUBLIC.alkahest, judge: PUBLIC.judge! });

/** A case id the judge can answer: a 32-byte uid, or `preview:<1-80 chars>`. Anything else never reaches the RPC. */
export function validCaseId(id: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(id) || /^preview:[\w.-]{1,80}$/.test(id);
}

/**
 * Final verdicts never change (BenchJudge refuses to judge a delivery twice, and finality closes the appeal window),
 * and every GenVM read on Bradbury costs ~6 s, so each server instance keeps the final ones it has seen. Verdicts still
 * in their appeal window are read fresh every time: an appeal can overturn them.
 */
const finalCases = new Map<string, Case>();
async function readVerdictState(gl: ReturnType<typeof genlayer>, id: string, judge: Hex): Promise<{ case?: Case; final: boolean }> {
  const key = `${gl.network}:${judge}:${id}`.toLowerCase();
  const hit = finalCases.get(key);
  if (hit) return { case: hit, final: true };
  const [final, latest] = await Promise.all([getCase(gl, id, judge, { final: true }), getCase(gl, id, judge)]);
  if (final) {
    if (finalCases.size > 1000) finalCases.delete(finalCases.keys().next().value!);
    finalCases.set(key, final);
    return { case: final, final: true };
  }
  return { case: latest, final: false };
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
  token?: { symbol: string; decimals: number };
  verdict: { ok: Case | undefined } | { err: string };
  /** True once the verdict is FINALIZED (no more appeals). */
  final: boolean;
  arbitration: { ok: Arbitration } | { err: string };
  jury?: { ok: Jury } | { err: string };
  /** Why BenchJudge would refuse to judge this delivery now ("" = it would), when no verdict exists yet. */
  refusal?: string;
};

export async function readCase(escrowUid: Hex, fulfillmentUid: Hex, tx?: Hex): Promise<CaseView> {
  const gl = genlayer({ network: "bradbury" });
  const w = reader();
  const escrowP = settle(getEscrow(w, escrowUid, cfg()));
  const [escrow, verdictState, jury] = await Promise.all([
    escrowP,
    settle(readVerdictState(gl, fulfillmentUid, PUBLIC.judge!)),
    tx ? settle(juryOf(gl, tx)) : Promise.resolve(undefined),
  ]);
  const info = "ok" in escrow ? escrow.ok : undefined;
  const verdictCase = "ok" in verdictState ? verdictState.ok.case : undefined;
  const [arbitration, token, refusal] = await Promise.all([
    info ? settle(getArbitration(w, escrowUid, fulfillmentUid, cfg(), info)) : Promise.resolve({ err: "escrow unreadable" } as const),
    info ? readTokenLite(pub(), info.token).catch(() => undefined) : Promise.resolve(undefined),
    !verdictCase && info && !info.revoked ? checkCase(gl, escrowUid, fulfillmentUid, PUBLIC.judge!) : Promise.resolve(undefined),
  ]);
  return {
    escrow,
    token,
    verdict: "ok" in verdictState ? { ok: verdictState.ok.case } : verdictState,
    final: "ok" in verdictState ? verdictState.ok.final : false,
    arbitration,
    jury,
    refusal,
  };
}

/** Deliveries made against an escrow, so a buyer (or a seller who lost the tab) can find them from the escrow alone. */
export async function escrowDeliveries(escrowUid: Hex) {
  const escrow = await getEscrow(reader(), escrowUid, cfg());
  const deliveries = await findDeliveries(pub(), PUBLIC.alkahest, escrowUid, escrow.createdAt);
  return { escrow, deliveries };
}

/** Recent cases on Bradbury, or on the Studionet sandbox when no Bradbury judge is configured. */
export async function recentCases(limit = 8): Promise<{ id: string; c?: Case; final?: boolean }[]> {
  const judge = PUBLIC.judge ?? PUBLIC.judgeStudionet;
  if (!judge) return [];
  const network = PUBLIC.judge ? "bradbury" : "studionet";
  const gl = genlayer({ network });
  const countFn = network === "bradbury" ? "case_count" : "preview_count";
  const listFn = network === "bradbury" ? "list_cases" : "list_previews";
  const r = await settle(
    (async () => {
      const total = Number(await gl.client.readContract({ address: judge, functionName: countFn, args: [] }));
      const ids =
        network === "bradbury"
          ? await listCases(gl, Math.max(0, total - limit), limit, judge)
          : ((await gl.client.readContract({ address: judge, functionName: listFn, args: [Math.max(0, total - limit), limit] })) as unknown[]).map(String);
      return Promise.all(
        ids.reverse().map(async (id) => {
          const s = await readVerdictState(gl, id, judge).catch(() => undefined);
          return { id, c: s?.case, final: s?.final };
        }),
      );
    })(),
  );
  return "ok" in r ? r.ok : [];
}

/** Live numbers for the landing page; cases is undefined when the network can't be reached. */
export async function liveStats(): Promise<{ cases?: number; network: "bradbury" | "studionet" }> {
  const judge = PUBLIC.judge ?? PUBLIC.judgeStudionet;
  const network = PUBLIC.judge ? "bradbury" : "studionet";
  if (!judge) return { network };
  const fn = network === "bradbury" ? "case_count" : "preview_count";
  const r = await settle(genlayer({ network }).client.readContract({ address: judge, functionName: fn, args: [] }));
  return { cases: "ok" in r ? Number(r.ok) : undefined, network };
}

export type VerdictView = {
  id: string;
  network: "bradbury" | "studionet";
  judge?: `0x${string}`;
  verdict: { ok: Case | undefined } | { err: string };
  final: boolean;
  jury?: { ok: Jury } | { err: string };
};

/**
 * One verdict by case id (`preview:<id>` lives on the Studionet sandbox; fulfillment uids on Bradbury). Memoised per
 * request with React's cache(), so a page, its metadata and its social image share one read.
 */
export const readVerdict = cache(async (id: string, tx?: Hex): Promise<VerdictView> => {
  const studio = id.startsWith("preview:") || !PUBLIC.judge;
  const network = studio ? "studionet" : "bradbury";
  const judge = studio ? PUBLIC.judgeStudionet : PUBLIC.judge;
  if (!judge) return { id, network, verdict: { err: "No BenchJudge is configured for this network." }, final: false };
  if (!validCaseId(id)) return { id, network, judge, verdict: { ok: undefined }, final: false };
  const gl = genlayer({ network });
  const [state, jury] = await Promise.all([
    settle(readVerdictState(gl, id, judge)),
    tx ? settle(juryOf(gl, tx)) : Promise.resolve(undefined),
  ]);
  return {
    id,
    network,
    judge,
    verdict: "ok" in state ? { ok: state.ok.case } : state,
    final: "ok" in state ? state.ok.final : false,
    jury,
  };
});

export const verdictHref = (id: string, tx?: string) => `/cases/${encodeURIComponent(id)}${tx ? `?tx=${encodeURIComponent(tx)}` : ""}`;

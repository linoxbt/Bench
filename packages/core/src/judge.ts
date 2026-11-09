import { createAccount, createClient } from "genlayer-js";
import { studionet, testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus, type GenLayerTransaction } from "genlayer-js/types";
import type { Address, Hex } from "viem";
import { BENCH_JUDGE } from "./addresses.js";

export type Network = "bradbury" | "studionet";

const chainFor = (network: Network) => (network === "bradbury" ? testnetBradbury : studionet);

/** A GenLayer client. Pass a private key for writes (CLI), or nothing for read-only use (web). */
export function genlayer(opts: { privateKey?: Hex; network?: Network; endpoint?: string } = {}) {
  const network = opts.network ?? "bradbury";
  const account = opts.privateKey ? createAccount(opts.privateKey) : undefined;
  const client = createClient({ chain: chainFor(network), account, endpoint: opts.endpoint });
  return { client, account, network };
}

export type GenLayer = ReturnType<typeof genlayer>;

export type Case = {
  escrow_uid: string;
  fulfillment_uid: string;
  demand: string;
  rubric: string;
  delivery: string;
  fulfilled: boolean;
  reason: string;
  status: "decided" | "preview";
  opened_by: string;
};

function asCase(raw: unknown): Case | undefined {
  if (raw instanceof Map) raw = Object.fromEntries(raw);
  if (!raw || typeof raw !== "object" || Object.keys(raw).length === 0) return undefined;
  return raw as Case;
}

/** The contract's revert message, if the accepted transaction rolled back (e.g. "[EXPECTED] already decided"). */
export function executionError(tx: GenLayerTransaction): string | undefined {
  const lr = tx.consensus_data?.leader_receipt?.[0] as { result?: { status?: string; payload?: unknown } } | undefined;
  const r = lr?.result;
  if (r && r.status && r.status !== "return") return typeof r.payload === "string" ? r.payload : r.status;
  return undefined;
}

/** Open a case. Resolves when ACCEPTED; arbitrate() lands on Alkahest only after FINALIZED. */
export async function openCase(gl: GenLayer, escrowUid: Hex, fulfillmentUid: Hex, judge: Address = BENCH_JUDGE) {
  if (!gl.account) throw new Error("openCase needs a private key (GENLAYER_KEY)");
  const hash = (await gl.client.writeContract({
    account: gl.account,
    address: judge,
    functionName: "judge",
    args: [escrowUid, fulfillmentUid],
    value: 0n,
  })) as Hex;
  const accepted = await gl.client.waitForTransactionReceipt({
    hash: hash as never,
    status: TransactionStatus.ACCEPTED,
    retries: 200,
    interval: 5000,
  });
  const err = executionError(accepted);
  if (err) throw new Error(`BenchJudge refused the case: ${err} (tx ${hash})`);
  return { hash, accepted };
}

/** Run the jury with no money and no EVM calls (Studionet or Bradbury). Stored as `preview:<caseId>`. */
export async function preview(gl: GenLayer, caseId: string, demand: string, delivery: string, rubric = "", judge: Address = BENCH_JUDGE) {
  if (!gl.account) throw new Error("preview needs a private key (GENLAYER_KEY)");
  const hash = (await gl.client.writeContract({
    account: gl.account,
    address: judge,
    functionName: "preview",
    args: [caseId, demand, rubric, delivery],
    value: 0n,
  })) as Hex;
  const receipt = await gl.client.waitForTransactionReceipt({
    hash: hash as never,
    status: TransactionStatus.ACCEPTED,
    retries: 200,
    interval: 3000,
  });
  const err = executionError(receipt);
  if (err) throw new Error(`preview failed: ${err} (tx ${hash})`);
  return { hash, receipt, caseKey: `preview:${caseId}` };
}

export async function waitFinal(gl: GenLayer, hash: Hex, retries = 720, interval = 5000) {
  return gl.client.waitForTransactionReceipt({ hash: hash as never, status: TransactionStatus.FINALIZED, retries, interval });
}

export async function getTx(gl: GenLayer, hash: Hex): Promise<GenLayerTransaction> {
  return gl.client.getTransaction({ hash: hash as never });
}

/** Read a case by fulfillment uid (any spelling) or by `preview:<id>`. */
export async function getCase(gl: GenLayer, caseId: string, judge: Address = BENCH_JUDGE): Promise<Case | undefined> {
  const raw = await gl.client.readContract({ address: judge, functionName: "get_case", args: [caseId] });
  return asCase(raw);
}

export async function listCases(gl: GenLayer, start = 0, limit = 20, judge: Address = BENCH_JUDGE): Promise<string[]> {
  const raw = await gl.client.readContract({ address: judge, functionName: "list_cases", args: [start, limit] });
  return (raw as unknown[]).map(String);
}

export async function caseCount(gl: GenLayer, judge: Address = BENCH_JUDGE): Promise<number> {
  return Number(await gl.client.readContract({ address: judge, functionName: "case_count", args: [] }));
}

export async function appeal(gl: GenLayer, hash: Hex) {
  if (!gl.account) throw new Error("appeal needs a private key (GENLAYER_KEY)");
  return gl.client.appealTransaction({ account: gl.account, txId: hash });
}

export type JuryVote = { validator: string; vote: string };
export type Jury = {
  status: string;
  round: number;
  rounds: number;
  votes: JuryVote[];
  agree: number;
  total: number;
  leader?: string;
  executionResult?: string;
};

/**
 * Summarise the validator votes in a GenLayer receipt for the jury panel.
 * genlayer-js 1.1.8 exposes validator addresses and votes per round, not model names,
 * so the viewer never shows model badges.
 */
export function juryFromTx(tx: GenLayerTransaction): Jury {
  const r = tx.lastRound;
  const validators = r?.roundValidators ?? [];
  const names = r?.validatorVotesName ?? [];
  const votes = validators.map((validator, i) => ({ validator, vote: String(names[i] ?? "NOT_VOTED") }));
  return {
    status: String(tx.statusName ?? tx.status ?? "UNKNOWN"),
    round: Number(r?.round ?? 0),
    rounds: Number(tx.numOfRounds ?? (r ? 1 : 0)),
    votes,
    agree: votes.filter((v) => v.vote === "AGREE").length,
    total: votes.length,
    leader: tx.lastLeader,
    executionResult: tx.txExecutionResultName,
  };
}

export { TransactionStatus };

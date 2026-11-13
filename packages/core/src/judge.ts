import { createAccount, createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { createClient as createClientV02 } from "genlayer-js-v02";
import { studionet } from "genlayer-js-v02/chains";
import { TransactionStatus, type GenLayerTransaction } from "genlayer-js/types";
import { createPublicClient, http, parseAbi, type Address, type Hex } from "viem";
import { ARBITRATE_SELECTOR, feesFor } from "./fees.js";
import { ALKAHEST_BRADBURY, BENCH_JUDGE } from "./addresses.js";
import { BRADBURY_GENLAYER_RPC } from "./chains.js";

export type Network = "bradbury" | "studionet";

/**
 * A GenLayer client. Pass a private key for writes (CLI), or nothing for read-only use (web).
 *
 * The two networks run different GenVM versions with different calldata: Testnet Bradbury runs v0.3
 * (genlayer-js 2.x, fee deposits), Studionet still runs v0.2 (genlayer-js 1.1.8, installed as
 * genlayer-js-v02). Each network gets the SDK that speaks its calldata; the methods Bench uses
 * (writeContract, readContract, getTransaction, waitForTransactionReceipt) have the same shape in both.
 */
export function genlayer(opts: { privateKey?: Hex; network?: Network; endpoint?: string } = {}) {
  const network = opts.network ?? "bradbury";
  const account = opts.privateKey ? createAccount(opts.privateKey) : undefined;
  const client =
    network === "bradbury"
      ? createClient({ chain: testnetBradbury, account, endpoint: opts.endpoint ?? BRADBURY_GENLAYER_RPC })
      : (createClientV02({ chain: studionet, account: account as never, endpoint: opts.endpoint }) as unknown as ReturnType<typeof createClient>);
  return { client, account, network };
}

export type GenLayer = ReturnType<typeof genlayer>;

export { ARBITRATE_SELECTOR, feesFor, type EvmMessage } from "./fees.js";

export type Case = {
  escrow_uid: string;
  fulfillment_uid: string;
  demand: string;
  rubric: string;
  delivery: string;
  fulfilled: boolean;
  /** The leader's one-line explanation. Validators vote on `fulfilled` only, not on this text. */
  reason: string;
  status: "decided" | "preview";
  opened_by: string;
  /** Who made the delivery (collects on a true verdict). */
  delivered_by?: string;
  demand_data?: string;
};

function asCase(raw: unknown): Case | undefined {
  if (raw instanceof Map) raw = Object.fromEntries(raw);
  if (!raw || typeof raw !== "object" || Object.keys(raw).length === 0) return undefined;
  return raw as Case;
}

/** The contract's revert message, if the accepted transaction rolled back (Studionet receipts carry it). */
export function executionError(tx: GenLayerTransaction): string | undefined {
  const lr = tx.consensus_data?.leader_receipt?.[0] as { result?: { status?: string; payload?: unknown } } | undefined;
  const r = lr?.result;
  if (r && r.status && r.status !== "return") return typeof r.payload === "string" ? r.payload : r.status;
  if (tx.txExecutionResultName === "FINISHED_WITH_ERROR") return "the contract refused the call";
  return undefined;
}

/** A transaction that ended (e.g. every leader timed out, then finality) without any execution result to apply. */
export const endedWithoutResult = (tx: GenLayerTransaction) => statusOf(tx) === "FINALIZED" && tx.txExecutionResultName === "NOT_VOTED";

/** Consensus outcomes that end a transaction without a usable result. */
export const FAILED_STATUSES = ["UNDETERMINED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT", "CANCELED"] as const;
const statusOf = (tx: GenLayerTransaction) => String(tx.statusName ?? tx.status ?? "");

/**
 * Poll a GenLayer transaction until it is ACCEPTED (or FINALIZED), tolerating RPC errors along the way.
 * genlayer-js 2.x's own "wait for ACCEPTED" returns on UNDETERMINED, timeouts and CANCELED, which would read as success
 * and also gives up on states Bradbury recovers from; this returns only on ACCEPTED or FINALIZED and throws on CANCELED.
 */
export async function waitTx(
  gl: GenLayer,
  hash: Hex,
  target: "ACCEPTED" | "FINALIZED",
  timeoutMs = target === "ACCEPTED" ? 20 * 60_000 : 60 * 60_000,
  intervalMs = 5000,
): Promise<GenLayerTransaction> {
  const deadline = Date.now() + timeoutMs;
  let last = "unknown";
  for (;;) {
    try {
      const tx = await gl.client.getTransaction({ hash: hash as never });
      last = statusOf(tx);
      // Only CANCELED is terminal. On Bradbury a LEADER_TIMEOUT rotates to a new leader (round 2 PROPOSING), and an
      // appeal round that times out shows LEADER_TIMEOUT and then FINALIZES; so timeouts and UNDETERMINED are waited out.
      // A transaction that finalizes without a result is the caller's to detect (executionError, getCase).
      if (last === "CANCELED") throw Object.assign(new Error(`GenLayer consensus ended ${last} (tx ${hash}).`), { final: true });
      if (last === "FINALIZED" || (target === "ACCEPTED" && last === "ACCEPTED")) return tx;
    } catch (e) {
      if ((e as { final?: boolean }).final) throw e;
      /* not indexed yet, or a flaky RPC read: keep polling */
    }
    if (Date.now() + intervalMs > deadline) throw new Error(`Timed out waiting for ${target} (tx ${hash}); last status ${last}.`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/**
 * Refusals a lagging RPC node can cause right after a reveal (GenVM reads EVM state through Bradbury's
 * load-balanced RPC, whose nodes can trail the head by a few blocks). Any other refusal is final.
 */
export const LAG_PRONE_REFUSALS = [/does not reference this escrow/, /not a CommitRevealObligation attestation/];

/**
 * check_case, retried for up to `timeoutMs` while the refusal is one a lagging node can cause, so a delivery revealed
 * seconds ago isn't refused (and nobody pays a fee for a case that would revert). Returns "" when the case would be heard.
 */
export async function checkCaseSettled(gl: GenLayer, escrowUid: Hex, fulfillmentUid: Hex, judge: Address = BENCH_JUDGE, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const why = await checkCase(gl, escrowUid, fulfillmentUid, judge);
    if (!why || !LAG_PRONE_REFUSALS.some((r) => r.test(why)) || Date.now() > deadline) return why ?? "";
    await new Promise((r) => setTimeout(r, 5000));
  }
}

type OpenOpts = { judge?: Address; arbiter?: Address; onSubmitted?: (hash: Hex) => void };

/**
 * Why BenchJudge would refuse this case right now ("" if it would be heard). A free view: call it before paying fees.
 * Returns undefined when the judge has no such view (BenchJudgeB, older deployments).
 */
export async function checkCase(gl: GenLayer, escrowUid: Hex, fulfillmentUid: Hex, judge: Address = BENCH_JUDGE): Promise<string | undefined> {
  try {
    return String(await gl.client.readContract({ address: judge, functionName: "check_case", args: [escrowUid, fulfillmentUid] }));
  } catch {
    return undefined;
  }
}

/**
 * Open a case: preflight (free), then judge() with the fee deposit. Resolves when ACCEPTED; arbitrate() lands on
 * Alkahest only after FINALIZED. `onSubmitted` gets the tx hash as soon as it is sent, so it is never lost.
 */
export async function openCase(gl: GenLayer, escrowUid: Hex, fulfillmentUid: Hex, opts: OpenOpts | Address = {}) {
  const o: OpenOpts = typeof opts === "string" ? { judge: opts } : opts;
  const judge = o.judge ?? BENCH_JUDGE;
  if (!gl.account) throw new Error("openCase needs a private key (GENLAYER_KEY)");
  const why = await checkCaseSettled(gl, escrowUid, fulfillmentUid, judge);
  if (why) throw new Error(`BenchJudge would refuse this case: ${why}`);
  const hash = (await gl.client.writeContract({
    account: gl.account,
    address: judge,
    functionName: "judge",
    args: [escrowUid, fulfillmentUid],
    value: 0n,
    fees: await feesFor(gl, [{ to: o.arbiter ?? ALKAHEST_BRADBURY.trustedOracleArbiter, selector: ARBITRATE_SELECTOR }]),
  })) as Hex;
  o.onSubmitted?.(hash);
  const accepted = await waitTx(gl, hash, "ACCEPTED");
  if (endedWithoutResult(accepted)) throw new Error(`The jury reached no result (its leaders timed out), so nothing was recorded. Open the case again (tx ${hash}).`);
  const err = executionError(accepted);
  if (err) {
    const reason = (await checkCase(gl, escrowUid, fulfillmentUid, judge)) || err;
    throw new Error(`BenchJudge refused the case: ${reason} (tx ${hash})`);
  }
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
    fees: await feesFor(gl),
  })) as Hex;
  const receipt = await waitTx(gl, hash, "ACCEPTED", 20 * 60_000, 3000);
  if (endedWithoutResult(receipt)) throw new Error(`The jury reached no result (its leaders timed out); try again (tx ${hash}).`);
  const err = executionError(receipt);
  if (err) throw new Error(`preview failed: ${err} (tx ${hash})`);
  const caseKey = `preview:${caseId}`;
  const c = await getCaseSettled(gl, caseKey, judge);
  if (!c) throw new Error(`The jury produced no verdict (${receipt.txExecutionResultName ?? statusOf(receipt)}; tx ${hash}).`);
  return { hash, receipt, caseKey, case: c };
}

/**
 * Wait for FINALIZED (the appeal window has closed and arbitrate() executes). A finalized transaction can still carry
 * no verdict (e.g. the only round timed out): read the case with getCase(..., { final: true }) afterwards.
 */
export async function waitFinal(gl: GenLayer, hash: Hex, timeoutMs = 60 * 60_000, intervalMs = 5000) {
  return waitTx(gl, hash, "FINALIZED", timeoutMs, intervalMs);
}

/**
 * getCase, retried for up to `timeoutMs` while it reads nothing: Bradbury's load-balanced RPC can answer from a node that
 * hasn't applied a just-ACCEPTED transaction yet.
 */
export async function getCaseSettled(gl: GenLayer, caseId: string, judge: Address = BENCH_JUDGE, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const c = await getCase(gl, caseId, judge).catch(() => undefined);
    if (c || Date.now() > deadline) return c;
    await new Promise((r) => setTimeout(r, 3000));
  }
}

export async function getTx(gl: GenLayer, hash: Hex): Promise<GenLayerTransaction> {
  return gl.client.getTransaction({ hash: hash as never });
}

/**
 * Read a case by fulfillment uid (any spelling) or by `preview:<id>`. By default this is the latest state, which
 * includes verdicts still in their appeal window; pass `{ final: true }` for finalized state only.
 */
export async function getCase(gl: GenLayer, caseId: string, judge: Address = BENCH_JUDGE, opts: { final?: boolean } = {}): Promise<Case | undefined> {
  const raw = await gl.client.readContract({
    address: judge,
    functionName: "get_case",
    args: [caseId],
    ...(opts.final ? { transactionHashVariant: "latest-final" as never } : {}),
  });
  return asCase(raw);
}

export async function listCases(gl: GenLayer, start = 0, limit = 20, judge: Address = BENCH_JUDGE): Promise<string[]> {
  const raw = await gl.client.readContract({ address: judge, functionName: "list_cases", args: [start, limit] });
  return (raw as unknown[]).map(String);
}

export async function caseCount(gl: GenLayer, judge: Address = BENCH_JUDGE): Promise<number> {
  return Number(await gl.client.readContract({ address: judge, functionName: "case_count", args: [] }));
}

export async function previewCount(gl: GenLayer, judge: Address): Promise<number> {
  return Number(await gl.client.readContract({ address: judge, functionName: "preview_count", args: [] }));
}

export type EscrowState = { attempts: number; tries: number; seller: string; fulfilled_by: string };

/** How many deliveries BenchJudge has judged for an escrow, its cap, its named seller, and any fulfilled verdict. */
export async function escrowState(gl: GenLayer, escrowUid: Hex, judge: Address = BENCH_JUDGE): Promise<EscrowState> {
  let raw = await gl.client.readContract({ address: judge, functionName: "escrow_state", args: [escrowUid] });
  if (raw instanceof Map) raw = Object.fromEntries(raw);
  const r = raw as Record<string, unknown>;
  return { attempts: Number(r.attempts ?? 0), tries: Number(r.tries ?? 0), seller: String(r.seller ?? ""), fulfilled_by: String(r.fulfilled_by ?? "") };
}

/** Re-emit a recorded verdict to Alkahest (if the first message never landed). Same decision; anyone can call it. */
export async function resendVerdict(gl: GenLayer, fulfillmentUid: Hex, opts: OpenOpts = {}) {
  if (!gl.account) throw new Error("resend needs a private key (GENLAYER_KEY)");
  const judge = opts.judge ?? BENCH_JUDGE;
  const hash = (await gl.client.writeContract({
    account: gl.account,
    address: judge,
    functionName: "resend",
    args: [fulfillmentUid],
    value: 0n,
    fees: await feesFor(gl, [{ to: opts.arbiter ?? ALKAHEST_BRADBURY.trustedOracleArbiter, selector: ARBITRATE_SELECTOR }]),
  })) as Hex;
  opts.onSubmitted?.(hash);
  const accepted = await waitTx(gl, hash, "ACCEPTED");
  const err = executionError(accepted);
  if (err) throw new Error(`resend refused: ${err} (tx ${hash})`);
  return { hash, accepted };
}

/** What an appeal costs right now (bond plus appeal funding, in wei), or why it can't be appealed. */
export async function appealQuote(gl: GenLayer, hash: Hex): Promise<{ canAppeal: boolean; charge?: bigint }> {
  const c = gl.client as unknown as { canAppeal?: (a: { txId: Hex }) => Promise<boolean>; getAppealCharge?: (a: { txId: Hex }) => Promise<bigint> };
  const canAppeal = c.canAppeal ? await c.canAppeal({ txId: hash }) : true;
  if (!canAppeal) return { canAppeal };
  return { canAppeal, charge: c.getAppealCharge ? await c.getAppealCharge({ txId: hash }) : undefined };
}

/** Appeal a verdict before finality. Pays `value` (from appealQuote) as the bond; a larger jury re-judges. */
export async function appeal(gl: GenLayer, hash: Hex, value?: bigint) {
  if (!gl.account) throw new Error("appeal needs a private key (GENLAYER_KEY)");
  return gl.client.appealTransaction({ account: gl.account, txId: hash, ...(value !== undefined ? { value } : {}) } as never);
}

const LIFECYCLE_ABI = parseAbi([
  "function getTransactionLifecycle(bytes32 _txId, uint256 _timestamp) view returns ((uint8 storedStatus, (bytes32 txId, uint8 storedStatus, uint8 projectedStatus, uint8 action, uint8 result, bytes32 resultHash, uint8 source, uint256 sourceRound, uint256 sourceGeneration, bytes32 sourceRoundContextHash, bytes32 roundPlanHash, uint256 resultRound, uint256 resultGeneration, uint256 basisDecisionId, uint8 context, bytes32 attemptId, uint256 boundaryAt, uint256 evaluatedAt, uint256 snapshotBlock, uint256 decisionWindow, uint256 appealDeadline, bool materializesDecision, bool actionOutcomeDeterministic, bool nonCurrentEvaluation) resolution, (bool exists, uint256 decisionId, uint256 basisDecisionId, uint8 context, uint8 source, bytes32 sourceAttemptId, uint8 sourceStatus, uint8 status, uint256 sourceRound, uint256 sourceGeneration, bytes32 sourceRoundContextHash, bytes32 roundPlanHash, uint256 resultRound, uint256 resultGeneration, uint8 result, bytes32 resultHash, uint256 effectiveAt, uint256 materializedAt, uint256 appealDeadline) latestDecision, bool decisionActive, uint256 executionGeneration) lifecycle)",
]);

/**
 * When the appeal window of a Bradbury transaction's latest decision closes (unix seconds), from the consensus
 * contract's lifecycle view. Undefined on Studionet or if it can't be read.
 */
export async function appealDeadline(gl: GenLayer, hash: Hex): Promise<number | undefined> {
  if (gl.network !== "bradbury") return undefined;
  try {
    const pc = createPublicClient({ transport: http(BRADBURY_GENLAYER_RPC) });
    const address = (testnetBradbury as { consensusDataContract?: { address: Address } }).consensusDataContract?.address;
    if (!address) return undefined;
    // Typed loosely: the full lifecycle tuple is too deep for TypeScript to infer.
    const read = pc.readContract as unknown as (a: object) => Promise<{ latestDecision: { appealDeadline: bigint } }>;
    const lc = await read({ address, abi: LIFECYCLE_ABI, functionName: "getTransactionLifecycle", args: [hash, BigInt(Math.floor(Date.now() / 1000))] });
    const d = Number(lc.latestDecision.appealDeadline);
    return d > 0 ? d : undefined;
  } catch {
    return undefined;
  }
}

export type JuryVote = { validator: string; vote: string; model?: string; leader?: boolean };
export type Jury = {
  status: string;
  round: number;
  rounds: number;
  votes: JuryVote[];
  agree: number;
  total: number;
  leader?: string;
  executionResult?: string;
  /** Unix seconds when the appeal window closes (Bradbury, while ACCEPTED). */
  appealDeadline?: number;
};

/** The jury summary plus, while the verdict is in its appeal window, when that window closes. */
export async function juryOf(gl: GenLayer, hash: Hex): Promise<Jury> {
  const jury = juryFromTx(await getTx(gl, hash));
  if (jury.status === "ACCEPTED") jury.appealDeadline = await appealDeadline(gl, hash);
  return jury;
}

/** Readable model names: "policy:prd-gpt-5-4" → "GPT-5.4", "anthropic/claude-sonnet-4.6" → "Claude Sonnet 4.6", "glm" → "GLM". */
export function modelLabel(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  let name = raw.replace(/^policy:/, "").replace(/^prd-/, "");
  name = name.slice(name.lastIndexOf("/") + 1); // drop "provider/"
  const known: Record<string, string> = { "gpt-5-4": "GPT-5.4", minimax: "MiniMax", deepseek: "DeepSeek", glm: "GLM", gpt: "GPT", qwen: "Qwen", llm: "LLM" };
  if (known[name.toLowerCase()]) return known[name.toLowerCase()];
  const ACRONYMS = new Set(["gpt", "glm", "llm", "oss", "it"]);
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : /^\d/.test(w) ? w : (known[w.toLowerCase()] ?? w[0]!.toUpperCase() + w.slice(1))))
    .join(" ")
    .replace(/^GPT (\d)/, "GPT-$1");
}

type RawNode = { vote?: string; node_config?: { address?: string; model?: string; primary_model?: { model?: string } | string } };

/**
 * Summarise the validator votes in a GenLayer receipt for the jury panel.
 * Bradbury receipts carry votes per round (lastRound); Studionet receipts carry a votes map and each
 * validator's node config, including the model policy it ran, so model names are shown only when reported.
 */
export function juryFromTx(tx: GenLayerTransaction): Jury {
  const r = tx.lastRound;
  const cd = tx.consensus_data as { votes?: Record<string, string>; validators?: RawNode[]; leader_receipt?: RawNode[] } | undefined;
  let votes: JuryVote[];
  let leader = tx.lastLeader as string | undefined;
  if (r?.roundValidators?.length) {
    const names = (r.validatorVotesName ?? []).map(String);
    const hashes = (r.validatorResultHash ?? []).map((h) => String(h).toLowerCase());
    const leaderIndex = Number(r.leaderIndex ?? 0);
    const ZERO = "0x" + "0".repeat(64);
    // Bradbury Phase 2 reports each validator's execution result (FINISHED_WITH_RETURN, ...), not a vote.
    // A validator agrees when its result hash matches the leader's; a zero hash means it never revealed.
    const byHash = names.some((n) => n.startsWith("FINISHED_WITH")) && hashes.length === r.roundValidators.length;
    if (byHash) leader = r.roundValidators[leaderIndex] ?? leader;
    votes = r.roundValidators.map((validator, i) => {
      if (!byHash) return { validator, vote: String(names[i] ?? "NOT_VOTED") };
      if (i === leaderIndex) return { validator, vote: "LEADER", leader: true };
      const h = hashes[i];
      return { validator, vote: !h || h === ZERO ? "NOT_VOTED" : h === hashes[leaderIndex] ? "AGREE" : "DISAGREE" };
    });
    votes.sort((a, b) => Number(!!b.leader) - Number(!!a.leader));
  } else if (cd?.votes) {
    const models = new Map<string, string | undefined>();
    const modelOf = (n: RawNode) => {
      const pm = n.node_config?.primary_model;
      return modelLabel(typeof pm === "string" ? pm : (pm?.model ?? n.node_config?.model));
    };
    for (const n of cd.validators ?? []) if (n.node_config?.address) models.set(n.node_config.address.toLowerCase(), modelOf(n));
    const lead = cd.leader_receipt?.[0];
    if (lead?.node_config?.address) {
      leader = lead.node_config.address;
      models.set(leader.toLowerCase(), modelOf(lead));
    }
    const norm = (v: string) => ({ agree: "AGREE", disagree: "DISAGREE", timeout: "TIMEOUT", idle: "NOT_VOTED" })[v.toLowerCase()] ?? v.toUpperCase();
    votes = Object.entries(cd.votes).map(([validator, v]) => {
      const isLeader = leader?.toLowerCase() === validator.toLowerCase();
      return { validator, vote: isLeader ? "LEADER" : norm(v), model: models.get(validator.toLowerCase()), leader: isLeader };
    });
    votes.sort((a, b) => Number(b.leader) - Number(a.leader));
  } else votes = [];
  const counted = votes.filter((v) => v.vote !== "LEADER");
  return {
    status: String(tx.statusName ?? tx.status ?? "UNKNOWN"),
    round: Number(r?.round ?? 0),
    rounds: Number(tx.numOfRounds ?? (r ? 1 : 0)),
    votes,
    agree: counted.filter((v) => v.vote === "AGREE").length,
    total: counted.length,
    leader,
    executionResult: tx.txExecutionResultName,
  };
}

export { TransactionStatus };

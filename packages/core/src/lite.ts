/**
 * Wallet-side Alkahest calls with plain viem, for the browser: alkahest-ts bundles @viem/anvil (Node-only)
 * and ~15 MB of artifacts. ABIs match Alkahest's ERC20EscrowObligation and EAS (checked by tests/local/lite.test.ts).
 */
import { encodePacked, keccak256, parseAbi, parseAbiItem, parseEventLogs, toHex, type Account, type Address, type Chain, type Hex, type PublicClient, type Transport, type WalletClient } from "viem";
import { decodeNlaDemand, decodeOracleDemand, encodeBenchDemand, type BenchDemand } from "./demand.js";

export const ESCROW_ABI = parseAbi([
  "function doObligation((address arbiter, bytes demand, address token, uint256 amount) data, uint64 expirationTime) returns (bytes32)",
  "function collect(bytes32 _escrow, bytes32 _fulfillment) returns (bytes)",
  "function reclaim(bytes32 uid) returns (bool)",
]);
export const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
]);
export const ESCROW_VIEW_ABI = parseAbi([
  "function getObligationData(bytes32 uid) view returns ((address arbiter, bytes demand, address token, uint256 amount))",
]);
export const EAS_VIEW_ABI = parseAbi([
  "function getAttestation(bytes32 uid) view returns ((bytes32 uid, bytes32 schema, uint64 time, uint64 expirationTime, uint64 revocationTime, bytes32 refUID, address recipient, address attester, bool revocable, bytes data))",
]);
export const EAS_EVENTS = parseAbi(["event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)"]);

export const COMMIT_REVEAL_ABI = parseAbi([
  "function computeCommitment(address claimer, bytes32 refUID, (bytes payload, bytes32 salt, bytes32 schema) data) pure returns (bytes32)",
  "function commit(bytes32 commitment, uint256 commitDeadline) payable",
  "function doObligation((bytes payload, bytes32 salt, bytes32 schema) data, bytes32 refUID) returns (bytes32)",
  "function commitmentClaimed(bytes32) view returns (bool)",
  // CommitRevealObligation's errors, so a revert reads "CommitmentTooRecent" instead of "reverted".
  "error CommitmentMissing(bytes32 commitment, address claimer)",
  "error CommitmentTooRecent(bytes32 commitment, address claimer)",
  "error CommitmentAlreadyExists(bytes32 commitment)",
  "error BondAlreadyClaimed(bytes32 commitment)",
  "error EmptyCommitment()",
  "error ZeroBondAmount()",
  "error RevealTooLate(bytes32 commitment)",
  "error UnauthorizedReveal(address caller, address committer, address recipient)",
]);

export type LiteAddresses = {
  erc20EscrowObligation: Address;
  trustedOracleArbiter: Address;
  commitRevealObligation?: Address;
  eas?: Address;
};
type Wallet = WalletClient<Transport, Chain, Account>;

export async function createEscrowLite(
  wallet: Wallet,
  pub: PublicClient,
  a: LiteAddresses,
  judge: Address,
  token: Address,
  amount: bigint,
  d: BenchDemand,
  expiration: bigint,
): Promise<{ escrowUid: Hex; hash: Hex }> {
  const owner = wallet.account.address;
  const allowance = await pub.readContract({ address: token, abi: ERC20_ABI, functionName: "allowance", args: [owner, a.erc20EscrowObligation] });
  if (allowance < amount) {
    const approve = await wallet.writeContract({ address: token, abi: ERC20_ABI, functionName: "approve", args: [a.erc20EscrowObligation, amount] });
    await pub.waitForTransactionReceipt({ hash: approve });
  }
  const hash = await wallet.writeContract({
    address: a.erc20EscrowObligation,
    abi: ESCROW_ABI,
    functionName: "doObligation",
    args: [{ arbiter: a.trustedOracleArbiter, demand: encodeBenchDemand(judge, d), token, amount }, expiration],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  const [attested] = parseEventLogs({ abi: EAS_EVENTS, logs: receipt.logs, eventName: "Attested" });
  if (!attested) throw new Error(`Escrow tx ${hash} emitted no Attested event`);
  return { escrowUid: attested.args.uid, hash };
}

export async function collectLite(wallet: Wallet, a: LiteAddresses, escrowUid: Hex, fulfillmentUid: Hex): Promise<Hex> {
  return wallet.writeContract({ address: a.erc20EscrowObligation, abi: ESCROW_ABI, functionName: "collect", args: [escrowUid, fulfillmentUid] });
}

export async function reclaimLite(wallet: Wallet, a: LiteAddresses, escrowUid: Hex): Promise<Hex> {
  return wallet.writeContract({ address: a.erc20EscrowObligation, abi: ESCROW_ABI, functionName: "reclaim", args: [escrowUid] });
}

/** Seller: Arkhai commit-reveal delivery from a browser wallet (same flow as `bench deliver`). */
export async function deliverLite(
  wallet: Wallet,
  pub: PublicClient,
  a: LiteAddresses,
  escrowUid: Hex,
  delivery: string,
  onStep?: (step: "commit" | "wait" | "reveal") => void,
): Promise<{ fulfillmentUid: Hex; commitHash: Hex; revealHash: Hex }> {
  const cr = a.commitRevealObligation;
  if (!cr) throw new Error("commitRevealObligation address missing");
  const salt = keccak256(toHex(`${Date.now()}-${Math.random()}-${wallet.account.address}`));
  const data = { payload: toHex(delivery), salt, schema: keccak256(toHex("{item:string}")) };
  const commitment = await pub.readContract({
    address: cr,
    abi: COMMIT_REVEAL_ABI,
    functionName: "computeCommitment",
    args: [wallet.account.address, escrowUid, data],
  });
  onStep?.("commit");
  const commitHash = await wallet.writeContract({ address: cr, abi: COMMIT_REVEAL_ABI, functionName: "commit", args: [commitment, 3600n], value: 1n });
  const committed = await pub.waitForTransactionReceipt({ hash: commitHash });
  onStep?.("wait");
  const reveal = { address: cr, abi: COMMIT_REVEAL_ABI, functionName: "doObligation", args: [data, escrowUid] } as const;
  const revealHash = await revealWhenReady(pub, committed.blockNumber, async () => {
    // Simulate against the public RPC first: it returns the revert reason (wallets often drop it), and the
    // wallet is only asked to sign once the reveal would succeed.
    await pub.simulateContract({ ...reveal, account: wallet.account.address });
    onStep?.("reveal");
    return wallet.writeContract(reveal);
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: revealHash });
  const [attested] = parseEventLogs({ abi: EAS_EVENTS, logs: receipt.logs, eventName: "Attested" });
  if (!attested) throw new Error(`Reveal tx ${revealHash} emitted no Attested event`);
  return { fulfillmentUid: attested.args.uid, commitHash, revealHash };
}

/**
 * CommitRevealObligation rejects a reveal unless block.number > the commit's block (CommitmentTooRecent).
 * On Bradbury a reveal still failed that way after the head had moved on: the public RPC can serve the
 * reveal's simulation from a node that is behind. So wait for a margin block, then retry the reveal
 * while it is still reported too recent.
 */
export async function revealWhenReady<T>(
  pub: Pick<PublicClient, "getBlockNumber">,
  commitBlock: bigint,
  reveal: () => Promise<T>,
  timeoutMs = 120_000,
): Promise<T> {
  const start = Date.now();
  const late = () => Date.now() - start > timeoutMs;
  while ((await pub.getBlockNumber({ cacheTime: 0 })) <= commitBlock + 1n) {
    if (late()) throw new Error(`No new block after ${commitBlock} within ${timeoutMs / 1000}s; reveal again shortly.`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  for (;;) {
    try {
      return await reveal();
    } catch (e) {
      if (late() || !String((e as Error)?.message ?? e).includes("CommitmentTooRecent")) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

/**
 * The earliest block worth scanning for events after `timestamp`: a block at or before it. Bradbury makes
 * several blocks per second, so a full-range log scan takes seconds and grows with the chain; this estimates
 * the block from the recent block rate (about 3 getBlock calls) and steps back until it is early enough.
 */
export async function blockAtOrBefore(pub: Pick<PublicClient, "getBlock">, timestamp: bigint): Promise<bigint> {
  const head = await pub.getBlock({ blockTag: "latest" });
  if (head.timestamp <= timestamp) return head.number;
  const span = head.number < 10_000n ? head.number : 10_000n;
  if (span === 0n) return 0n;
  const ref = await pub.getBlock({ blockNumber: head.number - span });
  const perSecond = Number(span) / Math.max(1, Number(head.timestamp - ref.timestamp));
  let back = BigInt(Math.ceil(Number(head.timestamp - timestamp) * perSecond * 1.1)) + 100n;
  for (;;) {
    if (back >= head.number) return 0n;
    const b = await pub.getBlock({ blockNumber: head.number - back });
    if (b.timestamp <= timestamp) return b.number;
    back *= 2n;
  }
}

const ARBITRATION_MADE = parseAbiItem(
  "event ArbitrationMade(bytes32 indexed decisionKey, bytes32 indexed fulfillmentUid, address indexed oracle, bool decision)",
);

/**
 * The oracle's latest decision on a delivery, from TrustedOracleArbiter's ArbitrationMade events (its decision map
 * is private, and a stored `false` looks like "not decided"). `since` (unix seconds, e.g. the escrow's creation)
 * bounds the scan; without it the whole chain is scanned.
 */
export async function findArbitration(
  pub: Pick<PublicClient, "getBlock" | "getLogs">,
  arbiter: Address,
  fulfillmentUid: Hex,
  oracle: Address,
  demandData: Hex,
  since?: bigint,
): Promise<{ decision: boolean; oracle: Address } | undefined> {
  const decisionKey = keccak256(encodePacked(["bytes32", "bytes"], [fulfillmentUid, demandData]));
  const fromBlock = since === undefined ? 0n : await blockAtOrBefore(pub, since);
  const logs = await pub.getLogs({ address: arbiter, event: ARBITRATION_MADE, args: { decisionKey, fulfillmentUid, oracle }, fromBlock });
  const last = logs.at(-1);
  return last ? { decision: Boolean(last.args.decision), oracle } : undefined;
}

export type EscrowView = {
  uid: Hex;
  buyer: Address;
  token: Address;
  amount: bigint;
  arbiter: Address;
  oracle: Address;
  demand: string;
  rubric: string;
  provider: string;
  expirationTime: bigint;
  revoked: boolean;
};

/** Read an escrow and its plain-English terms with plain viem (browser-safe). */
export async function readEscrowLite(pub: PublicClient, a: LiteAddresses, escrowUid: Hex): Promise<EscrowView> {
  if (!a.eas) throw new Error("eas address missing");
  const [data, att] = await Promise.all([
    pub.readContract({ address: a.erc20EscrowObligation, abi: ESCROW_VIEW_ABI, functionName: "getObligationData", args: [escrowUid] }),
    pub.readContract({ address: a.eas, abi: EAS_VIEW_ABI, functionName: "getAttestation", args: [escrowUid] }),
  ]);
  const { oracle, data: inner } = decodeOracleDemand(data.demand);
  let nla = { arbitrationProvider: "", arbitrationModel: "", arbitrationPrompt: "", demand: "" };
  try {
    nla = decodeNlaDemand(inner);
  } catch {
    /* not an NLA demand: leave the text empty */
  }
  return {
    uid: escrowUid,
    buyer: att.recipient,
    token: data.token,
    amount: data.amount,
    arbiter: data.arbiter,
    oracle,
    demand: nla.demand,
    rubric: nla.arbitrationPrompt,
    provider: nla.arbitrationProvider,
    expirationTime: att.expirationTime,
    revoked: att.revocationTime !== 0n,
  };
}

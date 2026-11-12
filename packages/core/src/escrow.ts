import { makeClient, type AlkahestClient, type ChainAddresses } from "alkahest-ts";
import {
  createWalletClient,
  http,
  keccak256,
  toHex,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type Transport,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { BENCH_PLAN, escrowChain } from "./chains.js";
import { ALKAHEST_BASE_SEPOLIA, ALKAHEST_BRADBURY, BENCH_JUDGE } from "./addresses.js";
import { decodeOracleDemand, encodeBenchDemand, type BenchDemand } from "./demand.js";
import { revealWhenReady } from "./lite.js";

export type BenchWallet = WalletClient<Transport, Chain, Account>;

/** Where Alkahest and BenchJudge live. Defaults to Testnet Bradbury; tests point it at a local chain. */
export type BenchConfig = {
  addresses: Partial<ChainAddresses> & {
    eas: Address;
    erc20EscrowObligation: Address;
    commitRevealObligation: Address;
    trustedOracleArbiter: Address;
  };
  judge: Address;
};

/**
 * Defaults to Testnet Bradbury (Plan A) or Base Sepolia (BENCH_PLAN=b). In Plan B, BENCH_JUDGE is the oracle the
 * escrows name: the relayer key's address (B1) or the BenchBridgeReceiver (B2). BENCH_ALKAHEST_ADDRESSES (a JSON object of contract addresses) overrides
 * individual contracts, e.g. for a local Alkahest deployment or a redeploy after a failed Day 1 gate.
 */
export const defaultConfig = (): BenchConfig => {
  const override = typeof process !== "undefined" ? process.env?.BENCH_ALKAHEST_ADDRESSES : undefined;
  const base = BENCH_PLAN === "b" ? ALKAHEST_BASE_SEPOLIA : ALKAHEST_BRADBURY;
  const addresses = override ? { ...base, ...(JSON.parse(override) as Partial<ChainAddresses>) } : base;
  return { addresses, judge: BENCH_JUDGE };
};

/** Commit bond posted by the seller, in wei, and the reveal window in seconds. */
export const COMMIT_BOND_WEI = 1n;
export const COMMIT_WINDOW_SECONDS = 3600n;
/** Schema tag Arkhai's `nla escrow:fulfill` uses for plain-text deliveries. */
export const DELIVERY_SCHEMA = keccak256(toHex("{item:string}"));

/** A wallet on GenLayer Chain from a private key (CLI, scripts, tests). Never log the key. */
export function walletFromKey(privateKey: Hex, rpcUrl?: string): BenchWallet {
  return createWalletClient({ account: privateKeyToAccount(privateKey), chain: escrowChain, transport: http(rpcUrl) });
}

/**
 * Alkahest client bound to the full Bradbury address map.
 * Never rely on alkahest-ts's "GenLayer Bradbury" preset: it maps many contracts to 0x0 (Cantina ALKA-27/28).
 * Works with any viem WalletClient, so the web viewer can pass the user's injected wallet.
 */
export function alkahest(wallet: BenchWallet, cfg: BenchConfig = defaultConfig()): AlkahestClient {
  return makeClient(wallet, cfg.addresses);
}

export type CreatedEscrow = { escrowUid: Hex; hash: Hex };

/** Buyer: lock `amount` of `token` against a plain-English demand judged by BenchJudge. */
export async function createEscrow(
  wallet: BenchWallet,
  token: Address,
  amount: bigint,
  d: BenchDemand,
  expiration: bigint,
  cfg: BenchConfig = defaultConfig(),
): Promise<CreatedEscrow> {
  if (expiration === 0n) throw new Error("expiration 0 disables reclaim; set an expiry (see README, Expiry rule)");
  const client = alkahest(wallet, cfg);
  const { hash, attested } = await client.erc20.escrow.default.approveAndCreate(
    { address: token, value: amount },
    { arbiter: cfg.addresses.trustedOracleArbiter, demand: encodeBenchDemand(cfg.judge, d) },
    expiration,
  );
  return { escrowUid: attested.uid as Hex, hash };
}

export type Delivered = { fulfillmentUid: Hex; commitment: Hex; commitHash: Hex; revealHash: Hex };

/** Seller: Arkhai's commit-reveal fulfilment (same flow as `nla escrow:fulfill`). */
export async function fulfill(wallet: BenchWallet, escrowUid: Hex, delivery: string, cfg: BenchConfig = defaultConfig()): Promise<Delivered> {
  const client = alkahest(wallet, cfg);
  const data = {
    payload: toHex(delivery),
    salt: keccak256(toHex(crypto.randomUUID())),
    schema: DELIVERY_SCHEMA,
  };
  const commitment = (await client.commitReveal.computeCommitment(escrowUid, wallet.account.address, data)) as Hex;
  const { hash: commitHash } = await client.commitReveal.commit(commitment, COMMIT_BOND_WEI, COMMIT_WINDOW_SECONDS);
  // CommitRevealObligation rejects a reveal in the same block as its commit (CommitmentTooRecent),
  // and doObligation is simulated against the latest block, so wait for a newer one first.
  const committed = await client.viemClient.waitForTransactionReceipt({ hash: commitHash });
  const { hash: revealHash, attested } = await revealWhenReady(client.viemClient, committed.blockNumber, () =>
    client.commitReveal.doObligation(data, escrowUid),
  );
  return { fulfillmentUid: attested.uid as Hex, commitment, commitHash, revealHash };
}

/** Whether the seller's commit bond has been returned or slashed. */
export async function bondClaimed(wallet: BenchWallet, commitment: Hex, cfg: BenchConfig = defaultConfig()): Promise<boolean> {
  return (await alkahest(wallet, cfg).commitReveal.isCommitmentClaimed(commitment)) as boolean;
}

export async function collect(wallet: BenchWallet, escrowUid: Hex, fulfillmentUid: Hex, cfg: BenchConfig = defaultConfig()): Promise<Hex> {
  return alkahest(wallet, cfg).erc20.escrow.default.collect(escrowUid, fulfillmentUid);
}

export async function reclaim(wallet: BenchWallet, escrowUid: Hex, cfg: BenchConfig = defaultConfig()): Promise<Hex> {
  return alkahest(wallet, cfg).erc20.escrow.default.reclaim(escrowUid);
}

export type EscrowInfo = {
  uid: Hex;
  buyer: Address;
  token: Address;
  amount: bigint;
  arbiter: Address;
  oracle: Address;
  demandData: Hex;
  expirationTime: bigint;
  revoked: boolean;
};

/** Read an escrow and its TrustedOracle demand. */
export async function getEscrow(wallet: BenchWallet, escrowUid: Hex, cfg: BenchConfig = defaultConfig()): Promise<EscrowInfo> {
  const client = alkahest(wallet, cfg);
  const escrow = await client.erc20.escrow.default.getObligation(escrowUid);
  const { oracle, data } = decodeOracleDemand(escrow.data.demand);
  return {
    uid: escrowUid,
    buyer: escrow.recipient,
    token: escrow.data.token,
    amount: escrow.data.amount,
    arbiter: escrow.data.arbiter,
    oracle,
    demandData: data,
    expirationTime: escrow.expirationTime,
    revoked: escrow.revocationTime !== 0n,
  };
}

/**
 * Optional: emit Arkhai's ArbitrationRequested event so NLA tooling sees the case.
 * TrustedOracleArbiter may refuse requests from callers it doesn't accept (UnauthorizedArbitrationRequest);
 * that never blocks judging, so failures are returned rather than thrown.
 */
export async function requestArbitration(
  wallet: BenchWallet,
  escrowUid: Hex,
  fulfillmentUid: Hex,
  cfg: BenchConfig = defaultConfig(),
): Promise<{ hash?: Hex; skipped?: string }> {
  try {
    const { oracle, demandData } = await getEscrow(wallet, escrowUid, cfg);
    const hash = await alkahest(wallet, cfg).arbiters.general.trustedOracle.requestArbitration(fulfillmentUid, oracle, demandData);
    return { hash };
  } catch (e) {
    return { skipped: e instanceof Error ? e.message.split("\n")[0] : String(e) };
  }
}

export type Arbitration = { decision: boolean; oracle: Address } | undefined;

/** The verdict BenchJudge sent to Alkahest, if it has landed (after GenLayer finality). */
export async function getArbitration(wallet: BenchWallet, escrowUid: Hex, fulfillmentUid: Hex, cfg: BenchConfig = defaultConfig()): Promise<Arbitration> {
  const { oracle, demandData } = await getEscrow(wallet, escrowUid, cfg);
  const found = await alkahest(wallet, cfg).arbiters.general.trustedOracle.checkExistingArbitration(
    fulfillmentUid,
    oracle,
    demandData,
  );
  return found ? { decision: found.decision, oracle: found.oracle } : undefined;
}

/** Wait until BenchJudge's arbitrate() lands on Alkahest, or time out. */
export async function waitForVerdict(
  wallet: BenchWallet,
  escrowUid: Hex,
  fulfillmentUid: Hex,
  timeoutMs = 60 * 60 * 1000,
  cfg: BenchConfig = defaultConfig(),
): Promise<Arbitration> {
  const { oracle, demandData } = await getEscrow(wallet, escrowUid, cfg);
  const wait = alkahest(wallet, cfg)
    .arbiters.general.trustedOracle.waitForArbitration(fulfillmentUid, oracle, demandData, 10_000)
    .then((r) => (r.decision === undefined ? undefined : { decision: r.decision, oracle: (r.oracle ?? oracle) as Address }));
  const timeout = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs).unref?.());
  return Promise.race([wait, timeout]);
}

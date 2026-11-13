/**
 * Plan B1 relayer. Reads verdicts from BenchJudgeB's FINALIZED state on GenLayer and sends each one, once,
 * to TrustedOracleArbiter.arbitrate on the source chain (Base Sepolia) from the oracle key named in the escrows.
 *
 * Trust: this key can say anything to Alkahest, so it is trusted. It only ever relays what BenchJudgeB recorded,
 * never re-sends a decision that already exists (arbitrate overwrites), and logs every send.
 */
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { createClient as createClientV02 } from "genlayer-js-v02";
import { studionet } from "genlayer-js-v02/chains";
import { TransactionHashVariant } from "genlayer-js/types";
import { findArbitration, waitConfirmed } from "@bench/core/browser";
import {
  parseAbi,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";

export type FinalVerdict = { fulfillmentUid: Hex; escrowUid: Hex; demandData: Hex; fulfilled: boolean; reason: string };

/** Where finalized verdicts come from. The default reads BenchJudgeB; tests inject a fake. */
export interface VerdictSource {
  count(): Promise<number>;
  ids(start: number, limit: number): Promise<string[]>;
  get(id: string): Promise<FinalVerdict | undefined>;
}

export function benchJudgeBSource(address: Address, network: "studionet" | "bradbury", endpoint?: string): VerdictSource {
  // BenchJudgeB runs on Studionet (GenVM v0.2 calldata: genlayer-js 1.1.8); Bradbury speaks v0.3 (genlayer-js 2.x).
  const client =
    network === "bradbury"
      ? createClient({ chain: testnetBradbury, endpoint: endpoint ?? "https://rpc-bradbury.genlayer.com" })
      : (createClientV02({ chain: studionet, endpoint }) as unknown as ReturnType<typeof createClient>);
  const final = TransactionHashVariant.LATEST_FINAL; // only state from finalized transactions
  const read = (functionName: string, args: (string | number)[]) =>
    client.readContract({ address, functionName, args, transactionHashVariant: final });
  return {
    count: async () => Number(await read("case_count", [])),
    ids: async (start, limit) => ((await read("list_cases", [start, limit])) as unknown[]).map(String),
    get: async (id) => {
      let raw = (await read("get_case", [id])) as unknown;
      if (raw instanceof Map) raw = Object.fromEntries(raw);
      const c = raw as Record<string, unknown>;
      if (!c || c.status !== "decided" || !c.demand_data) return undefined;
      return {
        fulfillmentUid: c.fulfillment_uid as Hex,
        escrowUid: c.escrow_uid as Hex,
        demandData: c.demand_data as Hex,
        fulfilled: Boolean(c.fulfilled),
        reason: String(c.reason ?? ""),
      };
    },
  };
}

const ARBITER_ABI = parseAbi(["function arbitrate(bytes32 fulfillmentUid, bytes demand, bool decision)"]);
const EAS_ABI = parseAbi([
  "function getAttestation(bytes32 uid) view returns ((bytes32 uid, bytes32 schema, uint64 time, uint64 expirationTime, uint64 revocationTime, bytes32 refUID, address recipient, address attester, bool revocable, bytes data))",
]);

/** After this many failed sends a case is parked: skipped on later ticks until the relayer restarts. */
const MAX_FAILURES = 5;

export type RelayerConfig = {
  source: VerdictSource;
  wallet: WalletClient<Transport, Chain, Account>;
  publicClient: PublicClient;
  arbiter: Address;
  /** EAS on the source chain: each escrow's creation time bounds the search for existing decisions. */
  eas: Address;
  /** First case index to look at (persist `cursor` and `retry` between runs). */
  cursor?: number;
  /** Cases whose send failed earlier, retried every tick before new ones. */
  retry?: string[];
  log?: (msg: string) => void;
};

export type Relayed = { fulfillmentUid: Hex; decision: boolean; hash?: Hex; skipped?: string };

export class Relayer {
  cursor: number;
  /** Failed cases, retried every tick: one stuck case never blocks the ones after it. */
  retry: Set<string>;
  private readonly failures = new Map<string, number>();
  private readonly sent = new Set<string>();
  constructor(private readonly cfg: RelayerConfig) {
    this.cursor = cfg.cursor ?? 0;
    this.retry = new Set(cfg.retry ?? []);
  }

  private log(msg: string) {
    (this.cfg.log ?? console.log)(`[relayer] ${msg}`);
  }

  /** Whether this oracle already decided this (fulfillment, demand) on the source chain (latest ArbitrationMade). */
  async alreadyDecided(v: FinalVerdict): Promise<boolean> {
    const att = await this.cfg.publicClient.readContract({ address: this.cfg.eas, abi: EAS_ABI, functionName: "getAttestation", args: [v.escrowUid] });
    // A decision can only follow the escrow: scan (in chunks) from its creation, not from block 0.
    const found = await findArbitration(this.cfg.publicClient, this.cfg.arbiter, v.fulfillmentUid, this.cfg.wallet.account.address, v.demandData, att.time);
    return found !== undefined;
  }

  /** Relay one case by id; a failure parks it in `retry` (up to MAX_FAILURES attempts) instead of throwing. */
  private async attempt(id: string, out: Relayed[]) {
    try {
      const v = await this.cfg.source.get(id);
      if (v) out.push(await this.relayOne(v));
      this.retry.delete(id);
      this.failures.delete(id);
    } catch (e) {
      const n = (this.failures.get(id) ?? 0) + 1;
      this.failures.set(id, n);
      if (n >= MAX_FAILURES) {
        this.retry.delete(id);
        this.log(`${id}: giving up after ${n} failures (${e instanceof Error ? e.message.split("\n")[0] : e}); restart to retry`);
      } else {
        this.retry.add(id);
        this.log(`${id}: send failed (${n}/${MAX_FAILURES}), will retry: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
      }
    }
  }

  /** One pass: retry parked cases, then relay every finalized verdict from `cursor` on. */
  async tick(batch = 50): Promise<Relayed[]> {
    const out: Relayed[] = [];
    for (const id of [...this.retry]) await this.attempt(id, out);
    const total = await this.cfg.source.count();
    while (this.cursor < total) {
      const ids = await this.cfg.source.ids(this.cursor, batch);
      if (ids.length === 0) break;
      for (const id of ids) {
        if (!id.startsWith("preview:")) await this.attempt(id, out);
        this.cursor++;
      }
    }
    return out;
  }

  async relayOne(v: FinalVerdict): Promise<Relayed> {
    const key = v.fulfillmentUid.toLowerCase();
    if (this.sent.has(key) || (await this.alreadyDecided(v))) {
      this.sent.add(key);
      return { fulfillmentUid: v.fulfillmentUid, decision: v.fulfilled, skipped: "already decided on the source chain" };
    }
    const hash = await this.cfg.wallet.writeContract({
      address: this.cfg.arbiter,
      abi: ARBITER_ABI,
      functionName: "arbitrate",
      args: [v.fulfillmentUid, v.demandData, v.fulfilled],
    });
    await waitConfirmed(this.cfg.publicClient, hash, "arbitrate");
    this.sent.add(key);
    this.log(`${v.fulfillmentUid} -> ${v.fulfilled} (${v.reason}) tx ${hash}`);
    return { fulfillmentUid: v.fulfillmentUid, decision: v.fulfilled, hash };
  }
}

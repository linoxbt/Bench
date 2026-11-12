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
import {
  concat,
  keccak256,
  parseAbi,
  parseAbiItem,
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
const ARBITRATION_MADE = parseAbiItem(
  "event ArbitrationMade(bytes32 indexed decisionKey, bytes32 indexed fulfillmentUid, address indexed oracle, bool decision)",
);

export type RelayerConfig = {
  source: VerdictSource;
  wallet: WalletClient<Transport, Chain, Account>;
  publicClient: PublicClient;
  arbiter: Address;
  /** First case index to look at (persist `cursor` between runs). */
  cursor?: number;
  /** Earliest source-chain block to search for existing decisions. */
  fromBlock?: bigint;
  log?: (msg: string) => void;
};

export type Relayed = { fulfillmentUid: Hex; decision: boolean; hash?: Hex; skipped?: string };

export class Relayer {
  cursor: number;
  private readonly sent = new Set<string>();
  constructor(private readonly cfg: RelayerConfig) {
    this.cursor = cfg.cursor ?? 0;
  }

  private log(msg: string) {
    (this.cfg.log ?? console.log)(`[relayer] ${msg}`);
  }

  /** Whether this oracle already decided this (fulfillment, demand) on the source chain. */
  async alreadyDecided(v: FinalVerdict): Promise<boolean> {
    const decisionKey = keccak256(concat([v.fulfillmentUid, v.demandData]));
    const logs = await this.cfg.publicClient.getLogs({
      address: this.cfg.arbiter,
      event: ARBITRATION_MADE,
      args: { decisionKey, fulfillmentUid: v.fulfillmentUid, oracle: this.cfg.wallet.account.address },
      fromBlock: this.cfg.fromBlock ?? 0n,
      toBlock: "latest",
    });
    return logs.length > 0;
  }

  /** One pass: relay every finalized verdict from `cursor` on. Advances the cursor past settled cases. */
  async tick(batch = 50): Promise<Relayed[]> {
    const out: Relayed[] = [];
    const total = await this.cfg.source.count();
    while (this.cursor < total) {
      const ids = await this.cfg.source.ids(this.cursor, batch);
      if (ids.length === 0) break;
      for (const id of ids) {
        if (!id.startsWith("preview:")) {
          const v = await this.cfg.source.get(id);
          if (v) out.push(await this.relayOne(v));
        }
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
    await this.cfg.publicClient.waitForTransactionReceipt({ hash });
    this.sent.add(key);
    this.log(`${v.fulfillmentUid} -> ${v.fulfilled} (${v.reason}) tx ${hash}`);
    return { fulfillmentUid: v.fulfillmentUid, decision: v.fulfilled, hash };
  }
}

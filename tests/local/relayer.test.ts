/**
 * Plan B1: the relayer delivers finalized BenchJudgeB verdicts to Alkahest exactly once.
 * The local chain stands in for Base Sepolia (Alkahest's real bytecode); the verdict source is injected.
 */
import { parseUnits, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { beforeAll, describe, expect, it } from "vitest";
import { Relayer, type FinalVerdict, type VerdictSource } from "../../packages/relayer/src/relayer.js";
import { collect, createEscrow, encodeNlaDemand, fulfill, getArbitration, type BenchConfig } from "../../packages/core/src/index.js";
import { KEYS, deployLocal, now, testClient, wallet } from "./fixture.js";

let cfg: BenchConfig;
let token: Address;
const relayerKey = KEYS.stranger; // stands in for the oracle key escrows name in Plan B1
const relayerAddress = privateKeyToAccount(relayerKey).address;
const DEMAND = { demand: "A haiku about rain", rubric: "" };

class FakeSource implements VerdictSource {
  cases: { id: string; v?: FinalVerdict }[] = [];
  count = async () => this.cases.length;
  ids = async (start: number, limit: number) => this.cases.slice(start, start + limit).map((c) => c.id);
  get = async (id: string) => this.cases.find((c) => c.id === id)?.v;
}

beforeAll(async () => {
  ({ cfg, token } = await deployLocal());
  cfg = { ...cfg, judge: relayerAddress }; // escrows name the relayer as oracle
});

async function openCase(text: string) {
  const { escrowUid } = await createEscrow(wallet(KEYS.buyer), token, parseUnits("2", 18), DEMAND, (await now()) + 86_400n, cfg);
  const d = await fulfill(wallet(KEYS.seller), escrowUid, text, cfg);
  return { escrowUid, fulfillmentUid: d.fulfillmentUid };
}

describe("Plan B1 relayer", () => {
  it("relays each finalized verdict once, skips previews, and the seller can collect", async () => {
    const pass = await openCase("Rain on the tin roof");
    const fail = await openCase("not a haiku");
    const source = new FakeSource();
    const demandData = encodeNlaDemand(DEMAND);
    source.cases.push(
      { id: pass.fulfillmentUid, v: { ...pass, demandData, fulfilled: true, reason: "a haiku" } },
      { id: "preview:demo" },
      { id: fail.fulfillmentUid, v: { ...fail, demandData, fulfilled: false, reason: "not a haiku" } },
    );
    const relayer = new Relayer({
      source,
      wallet: wallet(relayerKey),
      publicClient: testClient as never,
      arbiter: cfg.addresses.trustedOracleArbiter,
      eas: cfg.addresses.eas,
      log: () => {},
    });

    const first = await relayer.tick();
    expect(first.map((r) => [r.decision, Boolean(r.hash)])).toEqual([
      [true, true],
      [false, true],
    ]);
    expect(relayer.cursor).toBe(3);
    expect((await getArbitration(wallet(KEYS.seller), pass.escrowUid, pass.fulfillmentUid, cfg))?.decision).toBe(true);
    expect((await getArbitration(wallet(KEYS.seller), fail.escrowUid, fail.fulfillmentUid, cfg))?.decision).toBe(false);
    await testClient.waitForTransactionReceipt({ hash: await collect(wallet(KEYS.seller), pass.escrowUid, pass.fulfillmentUid, cfg) });

    // Nothing new: no transactions.
    expect(await relayer.tick()).toEqual([]);

    // A fresh relayer (e.g. after a restart that lost its cursor) must not re-send: arbitrate overwrites.
    const restarted = new Relayer({ source, wallet: wallet(relayerKey), publicClient: testClient as never, arbiter: cfg.addresses.trustedOracleArbiter, eas: cfg.addresses.eas, log: () => {} });
    const again = await restarted.tick();
    expect(again.every((r) => r.skipped && !r.hash)).toBe(true);
  });

  it("a case that fails to relay is parked and retried; it never blocks the cases after it", async () => {
    const stuck = await openCase("Rain, take one");
    const next = await openCase("Rain, take two");
    const demandData = encodeNlaDemand(DEMAND);
    const source = new FakeSource();
    source.cases.push(
      { id: stuck.fulfillmentUid, v: { ...stuck, demandData, fulfilled: true, reason: "r" } },
      { id: next.fulfillmentUid, v: { ...next, demandData, fulfilled: false, reason: "r" } },
    );
    let broken = true;
    const flaky: VerdictSource = {
      count: () => source.count(),
      ids: (a, b) => source.ids(a, b),
      get: async (id) => {
        if (broken && id === stuck.fulfillmentUid) throw new Error("GenLayer RPC timeout");
        return source.get(id);
      },
    };
    const relayer = new Relayer({ source: flaky, wallet: wallet(relayerKey), publicClient: testClient as never, arbiter: cfg.addresses.trustedOracleArbiter, eas: cfg.addresses.eas, log: () => {} });
    const first = await relayer.tick();
    expect(first.map((r) => r.fulfillmentUid)).toEqual([next.fulfillmentUid]); // the next case still went through
    expect([...relayer.retry]).toEqual([stuck.fulfillmentUid]);
    broken = false;
    const second = await relayer.tick();
    expect(second.map((r) => [r.fulfillmentUid, r.decision])).toEqual([[stuck.fulfillmentUid, true]]);
    expect(relayer.retry.size).toBe(0);
  });
});

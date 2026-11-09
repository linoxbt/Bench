/** The `bench` CLI end to end on a local Alkahest (BenchJudge's arbitrate is impersonated, see fixture.ts). */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { beforeAll, describe, expect, it } from "vitest";
import type { BenchConfig } from "../../packages/core/src/index.js";
import { BENCH_JUDGE, ERC20, KEYS, benchJudgeArbitrates, deployLocal, testClient } from "./fixture.js";
import { LOCAL_RPC } from "./global-setup.js";

const run = promisify(execFile);
const CLI = new URL("../../packages/cli/dist/index.js", import.meta.url).pathname;

let cfg: BenchConfig;
let token: Address;
let env: NodeJS.ProcessEnv;

async function bench(...args: string[]): Promise<Record<string, any>> {
  try {
    const { stdout } = await run(process.execPath, [CLI, "--json", ...args], { env, timeout: 120_000 });
    return JSON.parse(stdout.trim().split("\n").pop()!);
  } catch (e: any) {
    if (e.stdout) return JSON.parse(String(e.stdout).trim().split("\n").pop()!);
    throw e;
  }
}

beforeAll(async () => {
  ({ cfg, token } = await deployLocal());
  env = {
    PATH: process.env.PATH,
    GENLAYER_CHAIN_RPC: LOCAL_RPC,
    BENCH_ALKAHEST_ADDRESSES: JSON.stringify(cfg.addresses),
    BENCH_JUDGE,
    BENCH_USD: token,
    BENCH_BUYER_KEY: KEYS.buyer,
    BENCH_SELLER_KEY: KEYS.seller,
  };
});

describe("bench CLI (local chain)", () => {
  it("escrow → deliver → verdict true → status → collect", async () => {
    const DEMAND = "Landing copy under 120 words that mentions the free tier";
    const created = await bench("escrow", "--demand", DEMAND, "--amount", "50", "--expires", "24h");
    expect(created.escrowUid).toMatch(/^0x[0-9a-f]{64}$/);

    const delivered = await bench("deliver", "--escrow", created.escrowUid, "--text", "Start free today. The free tier covers 3 projects.");
    expect(delivered.fulfillmentUid).toMatch(/^0x[0-9a-f]{64}$/);

    // Collect is refused before any verdict, with a clear message.
    const early = await bench("collect", "--escrow", created.escrowUid, "--fulfillment", delivered.fulfillmentUid);
    expect(early.error).toMatch(/No verdict on Alkahest yet/);

    await benchJudgeArbitrates(cfg, delivered.fulfillmentUid as Hex, { demand: DEMAND, rubric: "" }, true);

    const status = await bench("status", "--escrow", created.escrowUid, "--fulfillment", delivered.fulfillmentUid);
    expect(status.arbitration.decision).toBe(true);
    expect(status.escrow.revoked).toBe(false);

    const seller = privateKeyToAccount(KEYS.seller).address;
    const before = await testClient.readContract({ address: token, abi: ERC20, functionName: "balanceOf", args: [seller] });
    const collected = await bench("collect", "--escrow", created.escrowUid, "--fulfillment", delivered.fulfillmentUid);
    await testClient.waitForTransactionReceipt({ hash: collected.hash });
    const after = await testClient.readContract({ address: token, abi: ERC20, functionName: "balanceOf", args: [seller] });
    expect(after - before).toBe(parseUnits("50", 18));
  });

  it("verdict false: collect is refused; reclaim waits for expiry", async () => {
    const DEMAND = "Copy with no hype words";
    const created = await bench("escrow", "--demand", DEMAND, "--amount", "5", "--expires", "2h");
    const delivered = await bench("deliver", "--escrow", created.escrowUid, "--text", "Revolutionary synergy!");
    await benchJudgeArbitrates(cfg, delivered.fulfillmentUid as Hex, { demand: DEMAND, rubric: "" }, false);

    const refused = await bench("collect", "--escrow", created.escrowUid, "--fulfillment", delivered.fulfillmentUid);
    expect(refused.error).toMatch(/NOT FULFILLED/);
    const tooEarly = await bench("reclaim", "--escrow", created.escrowUid);
    expect(tooEarly.error).toMatch(/Not expired yet/);
  });

  it("rejects malformed uids and missing keys", async () => {
    expect((await bench("collect", "--escrow", "0x1234", "--fulfillment", "0x" + "ab".repeat(32))).error).toMatch(/32-byte uid/);
    const saved = env.BENCH_SELLER_KEY;
    delete env.BENCH_SELLER_KEY;
    expect((await bench("deliver", "--escrow", "0x" + "ab".repeat(32), "--text", "x")).error).toMatch(/Set BENCH_SELLER_KEY/);
    env.BENCH_SELLER_KEY = saved;
  });
});

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
    expect((await bench("collect", "--escrow", "0x1234", "--fulfillment", "0x" + "ab".repeat(32))).error).toMatch(/is not a 32-byte escrow uid/);
    const saved = env.BENCH_SELLER_KEY;
    delete env.BENCH_SELLER_KEY;
    expect((await bench("deliver", "--escrow", "0x" + "ab".repeat(32), "--text", "x")).error).toMatch(/Set BENCH_SELLER_KEY/);
    env.BENCH_SELLER_KEY = saved;
  });

  it("seller-bound escrows, amount validation and resuming an interrupted delivery", async () => {
    const stranger = privateKeyToAccount(KEYS.stranger).address;
    const bound = await bench("escrow", "--demand", "A haiku about rain", "--amount", "1", "--seller", stranger, "--tries", "2");
    expect(bound.seller).toBe(stranger);
    // The CLI refuses a delivery from anyone but the named seller, before any money moves.
    expect((await bench("deliver", "--escrow", bound.escrowUid, "--text", "x")).error).toMatch(/only accepts deliveries from/);

    expect((await bench("escrow", "--demand", "d", "--amount", "0")).error).toMatch(/greater than zero/);
    expect((await bench("escrow", "--demand", "d", "--amount", "1.0000000000000000001")).error).toMatch(/18 decimals/);
    expect((await bench("escrow", "--demand", "d", "--expires", "5m")).error).toMatch(/at least 30 minutes/);

    // An interrupted delivery: the record (with its salt) was saved, the commit landed, the reveal never ran.
    const open = await bench("escrow", "--demand", "A haiku about rain", "--amount", "1");
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const home = mkdtempSync(`${tmpdir()}/bench-home-`);
    const { prepareDelivery, waitConfirmed, COMMIT_REVEAL_ABI } = await import("../../packages/core/src/index.js");
    const sellerAddr = privateKeyToAccount(KEYS.seller).address;
    const pub = testClient as never;
    let saved = await prepareDelivery(pub, cfg.addresses, sellerAddr, open.escrowUid, "Rain on the tin roof");
    const { wallet } = await import("./fixture.js");
    const commitHash = await wallet(KEYS.seller).writeContract({ address: cfg.addresses.commitRevealObligation, abi: COMMIT_REVEAL_ABI, functionName: "commit", args: [saved.commitment, 3600n], value: 1n });
    await waitConfirmed(pub, commitHash, "Commit");
    saved = { ...saved, commitHash };
    mkdirSync(`${home}/pending`, { recursive: true });
    writeFileSync(`${home}/pending/${open.escrowUid}-${sellerAddr.toLowerCase()}.json`, JSON.stringify(saved));
    env.BENCH_HOME = home;
    const resumed = await bench("deliver", "--escrow", open.escrowUid);
    delete env.BENCH_HOME;
    expect(resumed.fulfillmentUid).toMatch(/^0x[0-9a-f]{64}$/);
    expect(resumed.commitHash).toBe(commitHash); // the original commit, not a new one
  });
});

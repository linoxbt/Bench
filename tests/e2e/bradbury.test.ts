/**
 * End to end on GenLayer Testnet Bradbury: real escrow, real BenchJudge, real validators, real payout.
 * Opt in: BENCH_E2E=1 plus BENCH_JUDGE, BENCH_USD, BENCH_BUYER_KEY, BENCH_SELLER_KEY (and optionally GENLAYER_KEY).
 * Each case waits for GenLayer finality (~30 min), so run it by hand before recording, not in CI.
 * The fail path uses a short expiry so the reclaim is real; it waits for that expiry too.
 */
import { readFileSync } from "node:fs";
import { parseUnits, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import {
  BENCH_USD,
  collect,
  createEscrow,
  fulfill,
  genlayer,
  getArbitration,
  getCase,
  getEscrow,
  juryFromTx,
  openCase,
  reclaim,
  waitFinal,
  waitForVerdict,
  walletFromKey,
} from "../../packages/core/src/index.js";

const enabled = process.env.BENCH_E2E === "1";
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../fixtures/cases/${name}.json`, import.meta.url), "utf8"));
const key = (n: string) => process.env[n] as Hex;
const nowS = () => BigInt(Math.floor(Date.now() / 1000));

describe.skipIf(!enabled)("Bradbury end to end", () => {
  const buyer = enabled ? walletFromKey(key("BENCH_BUYER_KEY")) : undefined!;
  const seller = enabled ? walletFromKey(key("BENCH_SELLER_KEY")) : undefined!;
  const gl = enabled ? genlayer({ privateKey: key("GENLAYER_KEY") ?? key("BENCH_SELLER_KEY") }) : undefined!;

  async function runCase(name: string, expiresIn: bigint) {
    const fx = fixture(name);
    const { escrowUid } = await createEscrow(buyer, BENCH_USD, parseUnits("5", 18), fx, nowS() + expiresIn);
    const { fulfillmentUid } = await fulfill(seller, escrowUid, fx.delivery);
    const { hash } = await openCase(gl, escrowUid, fulfillmentUid);
    const final = await waitFinal(gl, hash);
    const jury = juryFromTx(final);
    const c = await getCase(gl, fulfillmentUid);
    const landed = await waitForVerdict(seller, escrowUid, fulfillmentUid, 30 * 60 * 1000);
    console.log(JSON.stringify({ name, escrowUid, fulfillmentUid, tx: hash, jury, case: c, landed }, null, 2));
    return { fx, escrowUid, fulfillmentUid, c, landed, jury };
  }

  it("clear pass: verdict true lands from BenchJudge's address; seller collects", async () => {
    const r = await runCase("01-clear-pass", 24n * 3600n);
    expect(r.c?.fulfilled).toBe(true);
    expect(r.landed?.decision).toBe(true);
    expect(r.jury.agree).toBeGreaterThanOrEqual(Math.ceil(r.jury.total / 2));
    await collect(seller, r.escrowUid, r.fulfillmentUid);
    expect((await getEscrow(seller, r.escrowUid)).revoked).toBe(true);
  });

  it("clear fail: verdict false; collect reverts; buyer reclaims after a short expiry", async () => {
    const r = await runCase("02-clear-fail", 2n * 3600n);
    expect(r.c?.fulfilled).toBe(false);
    expect(r.landed?.decision).toBe(false);
    await expect(collect(seller, r.escrowUid, r.fulfillmentUid)).rejects.toThrow();
    const { expirationTime } = await getEscrow(buyer, r.escrowUid);
    const waitMs = Number(expirationTime - nowS() + 30n) * 1000;
    if (waitMs > 0) await new Promise((res) => setTimeout(res, waitMs));
    await reclaim(buyer, r.escrowUid);
    expect((await getEscrow(buyer, r.escrowUid)).revoked).toBe(true);
  });

  it("prompt injection: a delivery that orders the jury around still fails", async () => {
    const r = await runCase("04-prompt-injection", 24n * 3600n);
    expect(r.c?.fulfilled).toBe(false);
    expect((await getArbitration(seller, r.escrowUid, r.fulfillmentUid))?.decision).toBe(false);
  });
});

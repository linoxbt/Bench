/**
 * End to end on GenLayer Testnet Bradbury: real escrow, real BenchJudge, real validators, real payout.
 * Opt in: BENCH_E2E=1 plus BENCH_JUDGE, BENCH_USD, BENCH_BUYER_KEY, BENCH_SELLER_KEY (and optionally GENLAYER_KEY).
 * Each case waits for GenLayer finality (a few minutes on Bradbury today), so run it by hand, not in CI.
 * The fail path uses a 30-minute expiry (the shortest Bench allows) so the reclaim is real; it waits for that too.
 * Every run writes its transactions to deployments/e2e-bradbury.json, which the README links.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseUnits, type Hex } from "viem";
import { afterAll, describe, expect, it } from "vitest";
import {
  BENCH_JUDGE,
  BENCH_USD,
  checkCase,
  collect,
  createEscrow,
  escrowTxUrl,
  fulfill,
  genlayer,
  genvmTxUrl,
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
const results: Record<string, unknown>[] = [];

describe.skipIf(!enabled)("Bradbury end to end", () => {
  const buyer = enabled ? walletFromKey(key("BENCH_BUYER_KEY")) : undefined!;
  const seller = enabled ? walletFromKey(key("BENCH_SELLER_KEY")) : undefined!;
  const gl = enabled ? genlayer({ privateKey: key("GENLAYER_KEY") ?? key("BENCH_SELLER_KEY") }) : undefined!;

  async function runCase(name: string, expiresIn: bigint) {
    const fx = fixture(name);
    // Hired work: the escrow names the seller, so nobody can copy the delivery and race them.
    const terms = { demand: fx.demand, rubric: fx.rubric, seller: seller.account.address };
    const { escrowUid, hash: lockTx } = await createEscrow(buyer, BENCH_USD, parseUnits("5", 18), terms, nowS() + expiresIn);
    const { fulfillmentUid, revealHash } = await fulfill(seller, escrowUid, fx.delivery);
    const { hash } = await openCase(gl, escrowUid, fulfillmentUid);
    const final = await waitFinal(gl, hash);
    const jury = juryFromTx(final);
    const c = await getCase(gl, fulfillmentUid, BENCH_JUDGE, { final: true });
    const landed = await waitForVerdict(seller, escrowUid, fulfillmentUid, 30 * 60 * 1000);
    const row: Record<string, unknown> = {
      name,
      escrowUid,
      fulfillmentUid,
      lock: escrowTxUrl(lockTx),
      reveal: escrowTxUrl(revealHash),
      judge: genvmTxUrl(hash),
      arbitrationMade: landed ? escrowTxUrl(landed.txHash) : null,
      fulfilled: c?.fulfilled,
      reason: c?.reason,
      jury: `${jury.agree}/${jury.total} agreed`,
    };
    results.push(row);
    console.log(JSON.stringify(row, null, 2));
    return { fx, escrowUid, fulfillmentUid, c, landed, jury, row };
  }

  afterAll(() => {
    if (!results.length) return;
    const out = { network: "bradbury", judge: BENCH_JUDGE, ranAt: new Date().toISOString(), cases: results };
    writeFileSync(new URL("../../deployments/e2e-bradbury.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
  });

  it("clear pass: verdict true lands from BenchJudge's address; seller collects", async () => {
    const r = await runCase("01-clear-pass", 24n * 3600n);
    expect(r.c?.fulfilled).toBe(true);
    expect(r.landed?.decision).toBe(true);
    expect(r.jury.agree).toBeGreaterThanOrEqual(Math.ceil(r.jury.total / 2));
    const collectTx = await collect(seller, r.escrowUid, r.fulfillmentUid);
    r.row.collect = escrowTxUrl(collectTx);
    expect((await getEscrow(seller, r.escrowUid)).revoked).toBe(true);
  });

  it("URL delivery: validators render the linked page and the verdict lands", async () => {
    const r = await runCase("03-url-delivery", 24n * 3600n);
    expect(r.c?.fulfilled).toBe(r.fx.expected);
    expect(r.landed?.decision).toBe(r.fx.expected);
  });

  it("prompt injection: a delivery that orders the jury around still fails", async () => {
    const r = await runCase("04-prompt-injection", 24n * 3600n);
    expect(r.c?.fulfilled).toBe(false);
    expect(r.landed?.decision).toBe(false);
    // The same escrow refuses a copy of judged work, for free, before anyone pays a fee.
    expect(await checkCase(gl, r.escrowUid, r.fulfillmentUid)).toMatch(/already decided/);
  });

  it("clear fail: verdict false; collect reverts; buyer reclaims after expiry", async () => {
    const r = await runCase("02-clear-fail", 30n * 60n);
    expect(r.c?.fulfilled).toBe(false);
    expect(r.landed?.decision).toBe(false);
    await expect(collect(seller, r.escrowUid, r.fulfillmentUid)).rejects.toThrow();
    const { expirationTime } = await getEscrow(buyer, r.escrowUid);
    const waitMs = Number(expirationTime - nowS() + 30n) * 1000;
    if (waitMs > 0) await new Promise((res) => setTimeout(res, waitMs));
    const reclaimTx = await reclaim(buyer, r.escrowUid);
    r.row.reclaim = escrowTxUrl(reclaimTx);
    expect((await getEscrow(buyer, r.escrowUid)).revoked).toBe(true);
  });
});

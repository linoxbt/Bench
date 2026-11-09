/**
 * The Bench escrow lifecycle against Alkahest's real contract bytecode on a local EVM.
 *
 * BenchJudge itself runs in GenVM and can't execute here, so the test impersonates its address and sends
 * exactly the call BenchJudge emits on finality: TrustedOracleArbiter.arbitrate(fulfillmentUid, nlaDemandData, verdict).
 * Everything else (escrow, commit-reveal delivery, collect, reclaim, packages/core) is the real code path.
 */
import { parseUnits, publicActions, type Address, type Hex } from "viem";
import { beforeAll, describe, expect, it } from "vitest";
import {
  bondClaimed,
  collect,
  createEscrow,
  encodeNlaDemand,
  fulfill,
  getArbitration,
  getEscrow,
  reclaim,
  requestArbitration,
  type BenchConfig,
} from "../../packages/core/src/index.js";
import { ARBITER, BENCH_JUDGE, EAS_ABI, ERC20, KEYS, benchJudgeArbitrates as arbitrate, deployLocal, now, testClient, wallet } from "./fixture.js";

let cfg: BenchConfig;
let token: Address;
const buyer = wallet(KEYS.buyer);
const seller = wallet(KEYS.seller);
const DEMAND = { demand: "Landing copy under 120 words that mentions the free tier", rubric: "Fail on any hype word." };

const benchJudgeArbitrates = (fulfillmentUid: Hex, verdict: boolean) => arbitrate(cfg, fulfillmentUid, DEMAND, verdict);
const balance = (a: Address) => testClient.readContract({ address: token, abi: ERC20, functionName: "balanceOf", args: [a] });
const attestation = (uid: Hex) =>
  testClient.readContract({ address: cfg.addresses.eas, abi: EAS_ABI, functionName: "getAttestation", args: [uid] });

beforeAll(async () => {
  ({ cfg, token } = await deployLocal());
});

describe("Bench on Alkahest (local EVM)", () => {
  it("pass: escrow → delivery → BenchJudge says true → seller collects", async () => {
    const amount = parseUnits("50", 18);
    const { escrowUid } = await createEscrow(buyer, token, amount, DEMAND, (await now()) + 86_400n, cfg);

    const info = await getEscrow(buyer, escrowUid, cfg);
    expect(info.oracle.toLowerCase()).toBe(BENCH_JUDGE.toLowerCase());
    expect(info.arbiter.toLowerCase()).toBe(cfg.addresses.trustedOracleArbiter.toLowerCase());
    expect(info.amount).toBe(amount);

    const d = await fulfill(seller, escrowUid, "Start free today. The free tier covers 3 projects.", cfg);
    // What BenchJudge checks on the fulfillment attestation:
    const att = await attestation(d.fulfillmentUid);
    expect(att.refUID).toBe(escrowUid);
    expect(att.attester.toLowerCase()).toBe(cfg.addresses.commitRevealObligation.toLowerCase());
    expect(att.revocationTime).toBe(0n);
    // The 1-wei commit bond comes back on reveal.
    expect(await bondClaimed(seller, d.commitment, cfg)).toBe(true);

    expect(await getArbitration(seller, escrowUid, d.fulfillmentUid, cfg)).toBeUndefined();
    await benchJudgeArbitrates(d.fulfillmentUid, true);
    const arb = await getArbitration(seller, escrowUid, d.fulfillmentUid, cfg);
    expect(arb?.decision).toBe(true);
    expect(arb?.oracle.toLowerCase()).toBe(BENCH_JUDGE.toLowerCase());

    const before = await balance(seller.account.address);
    await testClient.waitForTransactionReceipt({ hash: await collect(seller, escrowUid, d.fulfillmentUid, cfg) });
    expect((await balance(seller.account.address)) - before).toBe(amount);
    // Collecting revokes the escrow attestation: BenchJudge's "escrow already collected or reclaimed" check relies on this.
    expect((await attestation(escrowUid)).revocationTime).not.toBe(0n);
    expect((await getEscrow(seller, escrowUid, cfg)).revoked).toBe(true);
  });

  it("fail: BenchJudge says false → collect reverts → buyer reclaims after expiry", async () => {
    const amount = parseUnits("20", 18);
    const { escrowUid } = await createEscrow(buyer, token, amount, DEMAND, (await now()) + 3_600n, cfg);
    const d = await fulfill(seller, escrowUid, "Revolutionary synergy! Best product ever!", cfg);
    await benchJudgeArbitrates(d.fulfillmentUid, false);

    await expect(collect(seller, escrowUid, d.fulfillmentUid, cfg)).rejects.toThrow();
    await expect(reclaim(buyer, escrowUid, cfg)).rejects.toThrow(); // not expired yet

    await testClient.increaseTime({ seconds: 3_700 });
    await testClient.mine({ blocks: 1 });
    const before = await balance(buyer.account.address);
    await testClient.waitForTransactionReceipt({ hash: await reclaim(buyer, escrowUid, cfg) });
    expect((await balance(buyer.account.address)) - before).toBe(amount);
    expect((await attestation(escrowUid)).revocationTime).not.toBe(0n);
  });

  it("no verdict: collect reverts until BenchJudge has decided", async () => {
    const { escrowUid } = await createEscrow(buyer, token, parseUnits("1", 18), DEMAND, (await now()) + 86_400n, cfg);
    const d = await fulfill(seller, escrowUid, "anything", cfg);
    await expect(collect(seller, escrowUid, d.fulfillmentUid, cfg)).rejects.toThrow();
  });

  it("only the oracle named in the demand counts: a stranger's arbitrate does nothing", async () => {
    const { escrowUid } = await createEscrow(buyer, token, parseUnits("1", 18), DEMAND, (await now()) + 86_400n, cfg);
    const d = await fulfill(seller, escrowUid, "anything", cfg);
    const stranger = wallet(KEYS.stranger).extend(publicActions);
    const hash = await stranger.writeContract({
      address: cfg.addresses.trustedOracleArbiter,
      abi: ARBITER,
      functionName: "arbitrate",
      args: [d.fulfillmentUid, encodeNlaDemand(DEMAND), true],
    });
    await stranger.waitForTransactionReceipt({ hash });
    await expect(collect(seller, escrowUid, d.fulfillmentUid, cfg)).rejects.toThrow();
  });

  it("arbitrate overwrites: a second verdict from the oracle replaces the first", async () => {
    // This is why BenchJudge must never send two verdicts for one fulfillment (normalized case keys, preview: prefix).
    const { escrowUid } = await createEscrow(buyer, token, parseUnits("1", 18), DEMAND, (await now()) + 86_400n, cfg);
    const d = await fulfill(seller, escrowUid, "borderline delivery", cfg);
    await benchJudgeArbitrates(d.fulfillmentUid, false);
    await expect(collect(seller, escrowUid, d.fulfillmentUid, cfg)).rejects.toThrow();
    await benchJudgeArbitrates(d.fulfillmentUid, true);
    await testClient.waitForTransactionReceipt({ hash: await collect(seller, escrowUid, d.fulfillmentUid, cfg) });
  });

  it("redelivery: a fresh fulfillment gets a fresh decision key (the jury-shopping risk)", async () => {
    const { escrowUid } = await createEscrow(buyer, token, parseUnits("1", 18), DEMAND, (await now()) + 86_400n, cfg);
    const first = await fulfill(seller, escrowUid, "attempt 1", cfg);
    await benchJudgeArbitrates(first.fulfillmentUid, false);
    const second = await fulfill(seller, escrowUid, "attempt 2", cfg);
    expect(await getArbitration(seller, escrowUid, second.fulfillmentUid, cfg)).toBeUndefined();
    // Any address can deliver against an open escrow.
    const third = await fulfill(wallet(KEYS.stranger), escrowUid, "attempt 3 from someone else", cfg);
    expect((await attestation(third.fulfillmentUid)).refUID).toBe(escrowUid);
  });

  it("requestArbitration: the seller may ask; a stranger is refused and Bench reports it instead of throwing", async () => {
    const { escrowUid } = await createEscrow(buyer, token, parseUnits("1", 18), DEMAND, (await now()) + 86_400n, cfg);
    const d = await fulfill(seller, escrowUid, "anything", cfg);
    const bySeller = await requestArbitration(seller, escrowUid, d.fulfillmentUid, cfg);
    const byStranger = await requestArbitration(wallet(KEYS.stranger), escrowUid, d.fulfillmentUid, cfg);
    expect(bySeller.hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(byStranger.hash).toBeUndefined();
    expect(byStranger.skipped).toMatch(/requestArbitration/);
  });
});

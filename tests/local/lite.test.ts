/** The browser-side escrow calls (packages/core/src/lite.ts) against Alkahest's real bytecode. */
import { parseUnits, type Address, type Hex } from "viem";
import { beforeAll, describe, expect, it } from "vitest";
import { collectLite, createEscrowLite, deliverLite, readEscrowLite, getArbitration, getEscrow, reclaimLite, type BenchConfig } from "../../packages/core/src/index.js";
import { BENCH_JUDGE, KEYS, benchJudgeArbitrates, deployLocal, now, testClient, wallet } from "./fixture.js";

let cfg: BenchConfig;
let token: Address;
const DEMAND = { demand: "A haiku about rain", rubric: "" };

beforeAll(async () => {
  ({ cfg, token } = await deployLocal());
});

describe("lite (browser) escrow calls", () => {
  it("create → (seller delivers via core) → collect, and reclaim after expiry", async () => {
    const buyer = wallet(KEYS.buyer);
    const pub = testClient as unknown as Parameters<typeof createEscrowLite>[1];
    const { escrowUid } = await createEscrowLite(buyer, pub, cfg.addresses, BENCH_JUDGE, token, parseUnits("3", 18), DEMAND, (await now()) + 3_600n);
    const info = await getEscrow(buyer, escrowUid, cfg);
    expect(info.amount).toBe(parseUnits("3", 18));
    expect(info.oracle.toLowerCase()).toBe(BENCH_JUDGE.toLowerCase());

    const { fulfill } = await import("../../packages/core/src/index.js");
    const seller = wallet(KEYS.seller);
    const d = await fulfill(seller, escrowUid, "Rain taps the window / ...", cfg);
    await benchJudgeArbitrates(cfg, d.fulfillmentUid, DEMAND, true);
    await testClient.waitForTransactionReceipt({ hash: await collectLite(seller, cfg.addresses, escrowUid, d.fulfillmentUid) });
    expect((await getEscrow(seller, escrowUid, cfg)).revoked).toBe(true);

    const second = await createEscrowLite(buyer, pub, cfg.addresses, BENCH_JUDGE, token, parseUnits("1", 18), DEMAND, (await now()) + 60n);
    await testClient.increaseTime({ seconds: 120 });
    await testClient.mine({ blocks: 1 });
    await testClient.waitForTransactionReceipt({ hash: (await reclaimLite(buyer, cfg.addresses, second.escrowUid)) as Hex });
    expect((await getEscrow(buyer, second.escrowUid, cfg)).revoked).toBe(true);
  });

  it("deliverLite: a browser wallet delivers by commit-reveal, the attestation is what BenchJudge checks", async () => {
    const buyer = wallet(KEYS.buyer);
    const seller = wallet(KEYS.seller);
    const pub = testClient as unknown as Parameters<typeof createEscrowLite>[1];
    const { escrowUid } = await createEscrowLite(buyer, pub, cfg.addresses, BENCH_JUDGE, token, parseUnits("1", 18), DEMAND, (await now()) + 3_600n);
    const view = await readEscrowLite(pub, cfg.addresses, escrowUid);
    expect(view).toMatchObject({ demand: DEMAND.demand, rubric: DEMAND.rubric, provider: "GenLayer", amount: parseUnits("1", 18), revoked: false });
    expect(view.oracle.toLowerCase()).toBe(BENCH_JUDGE.toLowerCase());
    const steps: string[] = [];
    const d = await deliverLite(seller, pub, cfg.addresses, escrowUid, "Rain on the tin roof", (s) => steps.push(s));
    expect(steps).toEqual(["commit", "wait", "reveal"]);
    const att = await testClient.readContract({
      address: cfg.addresses.eas,
      abi: (await import("./fixture.js")).EAS_ABI,
      functionName: "getAttestation",
      args: [d.fulfillmentUid],
    });
    expect(att.refUID).toBe(escrowUid);
    expect(att.attester.toLowerCase()).toBe(cfg.addresses.commitRevealObligation.toLowerCase());
    await benchJudgeArbitrates(cfg, d.fulfillmentUid, DEMAND, true);
    expect((await getArbitration(seller, escrowUid, d.fulfillmentUid, cfg))?.decision).toBe(true);
    await testClient.waitForTransactionReceipt({ hash: await collectLite(seller, cfg.addresses, escrowUid, d.fulfillmentUid) });
  });
});

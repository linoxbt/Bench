/** The browser-side escrow calls (packages/core/src/lite.ts) against Alkahest's real bytecode. */
import { parseUnits, type Address, type Hex } from "viem";
import { beforeAll, describe, expect, it } from "vitest";
import {
  collectLite,
  createEscrowLite,
  deliverLite,
  findDeliveries,
  prepareDelivery,
  readEscrowLite,
  readTokenLite,
  getArbitration,
  getEscrow,
  reclaimLite,
  waitConfirmed,
  COMMIT_REVEAL_ABI,
  type BenchConfig,
  type SavedCommit,
} from "../../packages/core/src/index.js";
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

  it("an interrupted delivery resumes from its saved record; deliveries can be found from the escrow alone", async () => {
    const buyer = wallet(KEYS.buyer);
    const seller = wallet(KEYS.seller);
    const pub = testClient as unknown as Parameters<typeof createEscrowLite>[1];
    const seller0 = seller.account.address;
    const { escrowUid } = await createEscrowLite(buyer, pub, cfg.addresses, BENCH_JUDGE, token, parseUnits("1", 18), { ...DEMAND, seller: seller0, tries: 2 }, (await now()) + 3_600n);
    const view = await readEscrowLite(pub, cfg.addresses, escrowUid);
    expect(view.seller).toBe(seller0);
    expect(view.tries).toBe(2);

    // The tab closes right after the commit: only the saved record survives.
    let saved: SavedCommit = await prepareDelivery(pub, cfg.addresses, seller0, escrowUid, "Rain on the tin roof");
    const commitHash = await seller.writeContract({ address: cfg.addresses.commitRevealObligation, abi: COMMIT_REVEAL_ABI, functionName: "commit", args: [saved.commitment, 3600n], value: 1n });
    saved = { ...saved, commitHash };
    await waitConfirmed(pub, commitHash, "Commit");

    const steps: string[] = [];
    const d = await deliverLite(seller, pub, cfg.addresses, escrowUid, "ignored: the saved payload is revealed", (s) => steps.push(s), { saved });
    expect(steps).toEqual(["wait", "reveal"]); // no second commit, no lost bond
    const found = await findDeliveries(pub, cfg.addresses, escrowUid, view.createdAt);
    expect(found.map((x) => x.fulfillmentUid)).toEqual([d.fulfillmentUid]);
    expect(found[0]!.recipient).toBe(seller0);
    expect(await readTokenLite(pub, token)).toEqual({ symbol: expect.any(String), decimals: 18 });
  });

  it("refuses to lock more than the balance, zero, or an empty demand", async () => {
    const buyer = wallet(KEYS.buyer);
    const pub = testClient as unknown as Parameters<typeof createEscrowLite>[1];
    const t = (await now()) + 3_600n;
    await expect(createEscrowLite(buyer, pub, cfg.addresses, BENCH_JUDGE, token, parseUnits("1000000000", 18), DEMAND, t)).rejects.toThrow(/balance is lower/);
    await expect(createEscrowLite(buyer, pub, cfg.addresses, BENCH_JUDGE, token, 0n, DEMAND, t)).rejects.toThrow(/greater than zero/);
    await expect(createEscrowLite(buyer, pub, cfg.addresses, BENCH_JUDGE, token, 1n, { demand: " " }, t)).rejects.toThrow(/demand is empty/);
  });
});

/** Plan B2: BenchBridgeReceiver as the oracle on Alkahest's real bytecode; the "bridge" is a test account. */
import { readFileSync } from "node:fs";
import { encodeAbiParameters, parseUnits, publicActions, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { beforeAll, describe, expect, it } from "vitest";
import { collect, createEscrow, encodeNlaDemand, fulfill, getArbitration, type BenchConfig } from "../../packages/core/src/index.js";
import { KEYS, deployLocal, now, testClient, wallet } from "./fixture.js";

const art = JSON.parse(readFileSync(new URL("../../contracts/evm/artifacts/BenchBridgeReceiver.json", import.meta.url), "utf8"));
const BENCH_JUDGE_B = "0x00000000000000000000000000000000000b3c4b" as Address; // the GenLayer contract, as the bridge reports it
const DEMAND = { demand: "A haiku about rain", rubric: "" };
let cfg: BenchConfig;
let token: Address;
let receiver: Address;
const bridge = wallet(KEYS.stranger).extend(publicActions);

const message = (from: Address, uid: Hex, decision: boolean) =>
  encodeAbiParameters(
    [{ type: "address" }, { type: "bytes32" }, { type: "bytes" }, { type: "bool" }],
    [from, uid, encodeNlaDemand(DEMAND), decision],
  );

beforeAll(async () => {
  ({ cfg, token } = await deployLocal());
  const hash = await bridge.deployContract({
    abi: art.abi,
    bytecode: art.bytecode,
    args: [cfg.addresses.trustedOracleArbiter, privateKeyToAccount(KEYS.stranger).address, BENCH_JUDGE_B],
  });
  receiver = (await bridge.waitForTransactionReceipt({ hash })).contractAddress!;
  cfg = { ...cfg, judge: receiver }; // escrows name the receiver as oracle
});

describe("Plan B2 bridge receiver", () => {
  it("a bridged verdict from BenchJudgeB releases the escrow; repeats and forgeries are refused", async () => {
    const { escrowUid } = await createEscrow(wallet(KEYS.buyer), token, parseUnits("2", 18), DEMAND, (await now()) + 86_400n, cfg);
    const d = await fulfill(wallet(KEYS.seller), escrowUid, "Rain on the tin roof", cfg);

    await expect(
      bridge.writeContract({ address: receiver, abi: art.abi, functionName: "deliver", args: [message("0x000000000000000000000000000000000000bad1", d.fulfillmentUid, true)] }),
    ).rejects.toThrow(/WrongSource/);

    const ok = await bridge.writeContract({ address: receiver, abi: art.abi, functionName: "deliver", args: [message(BENCH_JUDGE_B, d.fulfillmentUid, true)] });
    await bridge.waitForTransactionReceipt({ hash: ok });
    expect((await getArbitration(wallet(KEYS.seller), escrowUid, d.fulfillmentUid, cfg))?.decision).toBe(true);

    await expect(
      bridge.writeContract({ address: receiver, abi: art.abi, functionName: "deliver", args: [message(BENCH_JUDGE_B, d.fulfillmentUid, false)] }),
    ).rejects.toThrow(/AlreadyDelivered/);

    const seller = wallet(KEYS.seller).extend(publicActions);
    await expect(
      seller.writeContract({ address: receiver, abi: art.abi, functionName: "deliver", args: [message(BENCH_JUDGE_B, d.fulfillmentUid, true)] }),
    ).rejects.toThrow(/NotBridge/);

    await testClient.waitForTransactionReceipt({ hash: await collect(wallet(KEYS.seller), escrowUid, d.fulfillmentUid, cfg) });
  });
});

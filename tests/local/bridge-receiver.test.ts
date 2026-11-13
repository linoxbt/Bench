/** Plan B2: BenchBridgeReceiver as the oracle on Alkahest's real bytecode; the "bridge" is a test account. */
import { readFileSync } from "node:fs";
import { encodeAbiParameters, pad, parseUnits, publicActions, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { beforeAll, describe, expect, it } from "vitest";
import { collect, createEscrow, encodeNlaDemand, fulfill, getArbitration, type BenchConfig } from "../../packages/core/src/index.js";
import { KEYS, deployLocal, now, testClient, wallet } from "./fixture.js";

const art = JSON.parse(readFileSync(new URL("../../contracts/evm/artifacts/BenchBridgeReceiver.json", import.meta.url), "utf8"));
const SRC_EID = 40421; // the GenLayer side's LayerZero endpoint id
const PEER = pad("0x00000000000000000000000000000000000b3c4b"); // BenchJudgeB's bridge sender, as the endpoint reports it
const DEMAND = { demand: "A haiku about rain", rubric: "" };
let cfg: BenchConfig;
let token: Address;
let receiver: Address;
const bridge = wallet(KEYS.stranger).extend(publicActions);

const verdict = (uid: Hex, decision: boolean) =>
  encodeAbiParameters([{ type: "bytes32" }, { type: "bytes" }, { type: "bool" }], [uid, encodeNlaDemand(DEMAND), decision]);
const lzArgs = (sender: Hex, uid: Hex, decision: boolean, eid = SRC_EID) =>
  [{ srcEid: eid, sender, nonce: 1n }, pad("0x01"), verdict(uid, decision), "0x0000000000000000000000000000000000000000", "0x"] as const;

beforeAll(async () => {
  ({ cfg, token } = await deployLocal());
  const hash = await bridge.deployContract({
    abi: art.abi,
    bytecode: art.bytecode,
    args: [cfg.addresses.trustedOracleArbiter, privateKeyToAccount(KEYS.stranger).address, SRC_EID, PEER], // the test account plays the endpoint
  });
  receiver = (await bridge.waitForTransactionReceipt({ hash })).contractAddress!;
  cfg = { ...cfg, judge: receiver }; // escrows name the receiver as oracle
});

describe("Plan B2 bridge receiver", () => {
  it("a bridged verdict from BenchJudgeB releases the escrow; repeats, forged origins and strangers are refused", async () => {
    const { escrowUid } = await createEscrow(wallet(KEYS.buyer), token, parseUnits("2", 18), DEMAND, (await now()) + 86_400n, cfg);
    const d = await fulfill(wallet(KEYS.seller), escrowUid, "Rain on the tin roof", cfg);

    await expect(
      bridge.writeContract({ address: receiver, abi: art.abi, functionName: "lzReceive", args: lzArgs(pad("0xbad1"), d.fulfillmentUid, true) }),
    ).rejects.toThrow(/WrongSource/);
    await expect(
      bridge.writeContract({ address: receiver, abi: art.abi, functionName: "lzReceive", args: lzArgs(PEER, d.fulfillmentUid, true, SRC_EID + 1) }),
    ).rejects.toThrow(/WrongSource/);

    const ok = await bridge.writeContract({ address: receiver, abi: art.abi, functionName: "lzReceive", args: lzArgs(PEER, d.fulfillmentUid, true) });
    await bridge.waitForTransactionReceipt({ hash: ok });
    expect((await getArbitration(wallet(KEYS.seller), escrowUid, d.fulfillmentUid, cfg))?.decision).toBe(true);

    await expect(
      bridge.writeContract({ address: receiver, abi: art.abi, functionName: "lzReceive", args: lzArgs(PEER, d.fulfillmentUid, false) }),
    ).rejects.toThrow(/AlreadyDelivered/);

    const seller = wallet(KEYS.seller).extend(publicActions);
    await expect(
      seller.writeContract({ address: receiver, abi: art.abi, functionName: "lzReceive", args: lzArgs(PEER, d.fulfillmentUid, true) }),
    ).rejects.toThrow(/NotEndpoint/);

    await testClient.waitForTransactionReceipt({ hash: await collect(wallet(KEYS.seller), escrowUid, d.fulfillmentUid, cfg) });
  });
});

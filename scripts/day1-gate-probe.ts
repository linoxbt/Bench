/**
 * Day 1 gate, part 2. Deploys contracts/probe/gate_probe.py on Bradbury, then:
 *  1. read_escrow: an EVM view from GenVM (exercises the v0.2.16 view-proxy shim).
 *  2. probe: emits TrustedOracleArbiter.arbitrate(dummyUid, 0x, true); after FINALIZED, an ArbitrationMade
 *     event with oracle == the probe's own address must appear on GenLayer Chain. That proves Plan A:
 *     EVM writes from GenVM execute, and msg.sender is the Intelligent Contract itself.
 * Env: GENLAYER_KEY. Takes as long as Bradbury finality (~30 min).
 */
import { readFileSync } from "node:fs";
import { createPublicClient, http, keccak256, parseAbiItem, toHex } from "viem";
import { TransactionStatus } from "genlayer-js/types";
import { ALKAHEST_BRADBURY, genlayer, genlayerChain, genvmTxUrl } from "../packages/core/src/index.js";

const key = process.env.GENLAYER_KEY;
if (!key) throw new Error("Set GENLAYER_KEY");
const gl = genlayer({ privateKey: (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`, network: "bradbury" });
const wait = (hash: string, status: TransactionStatus) =>
  gl.client.waitForTransactionReceipt({ hash: hash as never, status, retries: 720, interval: 5000 });

const code = readFileSync(new URL("../contracts/probe/gate_probe.py", import.meta.url), "utf8");
const deployTx = await gl.client.deployContract({ account: gl.account, code, args: [ALKAHEST_BRADBURY.trustedOracleArbiter, ALKAHEST_BRADBURY.eas] });
console.log(`deploy ${genvmTxUrl(deployTx)}`);
const dep = await wait(deployTx, TransactionStatus.ACCEPTED);
const probe = ((dep.data as { contract_address?: string } | undefined)?.contract_address ?? dep.recipient) as `0x${string}`;
console.log(`probe contract: ${probe}`);

// 1. EVM view from GenVM. Any attestation uid works; a zero uid returns an empty attestation.
const readTx = await gl.client.writeContract({ account: gl.account, address: probe, functionName: "read_escrow", args: ["0x" + "00".repeat(32)], value: 0n });
const read = await wait(readTx, TransactionStatus.ACCEPTED);
console.log(`EVM view: ${read.txExecutionResultName} (${genvmTxUrl(readTx)})`);

// 2. EVM write from GenVM.
const uid = keccak256(toHex(`bench-gate-${Date.now()}`));
const t0 = Date.now();
const probeTx = await gl.client.writeContract({ account: gl.account, address: probe, functionName: "probe", args: [uid], value: 0n });
console.log(`probe ${genvmTxUrl(probeTx)}; waiting for FINALIZED ...`);
await wait(probeTx, TransactionStatus.FINALIZED);
console.log(`finalized after ${Math.round((Date.now() - t0) / 60000)} min`);

const evm = createPublicClient({ chain: genlayerChain, transport: http() });
const event = parseAbiItem("event ArbitrationMade(bytes32 indexed decisionKey, bytes32 indexed fulfillmentUid, address indexed oracle, bool decision)");
for (let i = 0; i < 60; i++) {
  const logs = await evm.getLogs({ address: ALKAHEST_BRADBURY.trustedOracleArbiter, event, args: { fulfillmentUid: uid }, fromBlock: "earliest" });
  if (logs[0]) {
    const oracle = logs[0].args.oracle!;
    const ok = oracle.toLowerCase() === probe.toLowerCase();
    console.log(`ArbitrationMade landed in tx ${logs[0].transactionHash}, oracle ${oracle}`);
    console.log(ok ? "GATE PASSED: Plan A works (msg.sender == the Intelligent Contract)." : "GATE FAILED: the write landed from a different address. Use Plan B.");
    process.exit(ok ? 0 : 1);
  }
  await new Promise((r) => setTimeout(r, 10_000));
}
console.log("GATE FAILED: no ArbitrationMade event 10 min after finality. Use Plan B and ask in the GenLayer builders channel.");
process.exit(1);

/**
 * Plan B: deploy BenchJudgeB (contracts/bench_judge_b.py) to GenLayer. It judges Alkahest escrows on Base Sepolia,
 * read over JSON-RPC, and stores verdicts for the relayer (packages/relayer) or bridge receiver to deliver.
 * Env: GENLAYER_KEY; BENCH_ORACLE = the address escrows name as oracle (the relayer key's address for B1,
 * or the BenchBridgeReceiver for B2); BENCH_NETWORK=studionet|bradbury; SOURCE_RPC (default https://sepolia.base.org).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { TransactionStatus } from "genlayer-js/types";
import { privateKeyToAccount } from "viem/accounts";
import { ALKAHEST_BASE_SEPOLIA, genlayer, genvmTxUrl, type Network } from "../packages/core/src/index.js";

const network: Network = process.env.BENCH_NETWORK === "bradbury" ? "bradbury" : "studionet";
const key = process.env.GENLAYER_KEY as `0x${string}` | undefined;
if (!key) throw new Error("Set GENLAYER_KEY");
const oracle = process.env.BENCH_ORACLE ?? (process.env.RELAYER_KEY ? privateKeyToAccount(process.env.RELAYER_KEY as `0x${string}`).address : undefined);
if (!oracle) throw new Error("Set BENCH_ORACLE (or RELAYER_KEY): the address escrows will name as oracle");
const rpc = process.env.SOURCE_RPC ?? "https://sepolia.base.org";

const gl = genlayer({ privateKey: key, network });
const code = readFileSync(new URL("../contracts/bench_judge_b.py", import.meta.url), "utf8");
const a = ALKAHEST_BASE_SEPOLIA;
const args = [rpc, a.trustedOracleArbiter, a.erc20EscrowObligation, a.commitRevealObligation, a.eas, oracle];
console.log(`Deploying BenchJudgeB to ${network} (source ${rpc}, oracle ${oracle}) ...`);
const hash = await gl.client.deployContract({ account: gl.account, code, args });
const r = await gl.client.waitForTransactionReceipt({ hash: hash as never, status: TransactionStatus.ACCEPTED, retries: 200, interval: 5000 });
const address = (r.data as { contract_address?: string } | undefined)?.contract_address ?? r.recipient ?? r.to_address;
if (!address) throw new Error("no contract address in receipt");
mkdirSync(new URL("../deployments/", import.meta.url), { recursive: true });
writeFileSync(
  new URL(`../deployments/plan-b-${network}.json`, import.meta.url),
  JSON.stringify({ network, benchJudgeB: address, oracle, sourceRpc: rpc, deployTx: hash, alkahest: a, deployedAt: new Date().toISOString() }, null, 2) + "\n",
);
console.log(`BenchJudgeB: ${address}  (${genvmTxUrl(hash, network)})\n\nexport BENCH_JUDGE_B=${address}`);

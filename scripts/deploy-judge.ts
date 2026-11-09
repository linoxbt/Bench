/**
 * Deploy BenchJudge to GenLayer (default Testnet Bradbury; BENCH_NETWORK=studionet for preview-only use).
 * Env: GENLAYER_KEY (required). Writes deployments/<network>.json and prints the export line.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { TransactionStatus } from "genlayer-js/types";
import { ALKAHEST_BRADBURY, genlayer, genvmTxUrl, type Network } from "../packages/core/src/index.js";

const network: Network = process.env.BENCH_NETWORK === "studionet" ? "studionet" : "bradbury";
const key = process.env.GENLAYER_KEY;
if (!key) throw new Error("Set GENLAYER_KEY (a testnet key with GEN from testnet-faucet.genlayer.foundation)");

const gl = genlayer({ privateKey: (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`, network });
const code = readFileSync(new URL("../contracts/bench_judge.py", import.meta.url), "utf8");
const a = ALKAHEST_BRADBURY;
const args = [a.trustedOracleArbiter, a.erc20EscrowObligation, a.commitRevealObligation, a.eas];

console.log(`Deploying BenchJudge to ${network} from ${gl.account!.address} ...`);
const hash = await gl.client.deployContract({ account: gl.account, code, args });
console.log(`  tx ${genvmTxUrl(hash, network)}`);
const receipt = await gl.client.waitForTransactionReceipt({ hash: hash as never, status: TransactionStatus.ACCEPTED, retries: 200, interval: 5000 });
const address = (receipt.data as { contract_address?: string } | undefined)?.contract_address ?? receipt.recipient ?? receipt.to_address;
if (!address) throw new Error(`Deployed, but no contract address in the receipt: ${JSON.stringify(receipt).slice(0, 400)}`);
if (receipt.txExecutionResultName && receipt.txExecutionResultName !== "FINISHED_WITH_RETURN") {
  throw new Error(`Deploy executed with ${receipt.txExecutionResultName}; check \`genlayer receipt ${hash} --stdout --stderr\``);
}

mkdirSync(new URL("../deployments/", import.meta.url), { recursive: true });
writeFileSync(
  new URL(`../deployments/${network}.json`, import.meta.url),
  JSON.stringify({ network, benchJudge: address, deployTx: hash, deployedAt: new Date().toISOString(), alkahest: a }, null, 2) + "\n",
);
console.log(`BenchJudge: ${address}\n\nexport BENCH_JUDGE=${address}\n(also saved to deployments/${network}.json; put it in .env and the Vercel env as NEXT_PUBLIC_BENCH_JUDGE)`);

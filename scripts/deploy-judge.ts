/**
 * Deploy BenchJudge to GenLayer (default Testnet Bradbury; BENCH_NETWORK=studionet for preview-only use).
 * Env: GENLAYER_KEY (required). Writes deployments/<network>.json and prints the export line.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ALKAHEST_BRADBURY, feesFor, genlayer, genvmTxUrl, waitTx, type Network } from "../packages/core/src/index.js";

const network: Network = process.env.BENCH_NETWORK === "studionet" ? "studionet" : "bradbury";
const key = process.env.GENLAYER_KEY;
if (!key) throw new Error("Set GENLAYER_KEY (a testnet key with GEN from testnet-faucet.genlayer.foundation)");

const gl = genlayer({ privateKey: (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`, network });
// Bradbury runs GenVM v0.3: the full BenchJudge. Studionet still runs v0.2: the free preview sandbox, built from
// the same shared jury code (contracts/studionet/bench_judge_preview.py).
const source = network === "bradbury" ? "../contracts/bench_judge.py" : "../contracts/studionet/bench_judge_preview.py";
const code = readFileSync(new URL(source, import.meta.url), "utf8");
const a = ALKAHEST_BRADBURY;
const args = network === "bradbury" ? [a.trustedOracleArbiter, a.erc20EscrowObligation, a.commitRevealObligation, a.eas] : [];

console.log(`Deploying ${source.split("/").pop()} to ${network} from ${gl.account!.address} ...`);
const hash = await gl.client.deployContract({ account: gl.account, code, args, fees: await feesFor(gl) });
console.log(`  tx ${genvmTxUrl(hash, network)}`);
const receipt = await waitTx(gl, hash as `0x${string}`, "ACCEPTED");
const address = (receipt.data as { contract_address?: string } | undefined)?.contract_address ?? receipt.recipient ?? receipt.to_address;
if (!address) throw new Error(`Deployed, but no contract address in the receipt: ${JSON.stringify(receipt).slice(0, 400)}`);
if (receipt.txExecutionResultName && receipt.txExecutionResultName !== "FINISHED_WITH_RETURN") {
  throw new Error(`Deploy executed with ${receipt.txExecutionResultName}; check the tx on the explorer`);
}

mkdirSync(new URL("../deployments/", import.meta.url), { recursive: true });
writeFileSync(
  new URL(`../deployments/${network}.json`, import.meta.url),
  JSON.stringify(
    network === "bradbury"
      ? { network, benchJudge: address, deployTx: hash, deployedAt: new Date().toISOString(), source, alkahest: a }
      : { network, benchJudgePreview: address, deployTx: hash, deployedAt: new Date().toISOString(), source },
    null,
    2,
  ) + "\n",
);
console.log(
  network === "bradbury"
    ? `BenchJudge: ${address}\n\nexport BENCH_JUDGE=${address}\n(also saved to deployments/bradbury.json; put it in .env and the Vercel env as NEXT_PUBLIC_BENCH_JUDGE)`
    : `BenchJudge preview sandbox: ${address}\n(saved to deployments/studionet.json; set it in the Vercel env as NEXT_PUBLIC_BENCH_JUDGE_STUDIONET)`,
);

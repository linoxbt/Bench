// Deploy BenchUSD to GenLayer Chain (4221) and mint to the buyer.
// Env: DEPLOYER_KEY (required), BUYER_ADDRESS (optional), MINT_AMOUNT in whole tokens (default 1000),
//      GENLAYER_CHAIN_RPC (default https://rpc.testnet-chain.genlayer.com).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createWalletClient, defineChain, http, parseUnits, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const here = dirname(fileURLToPath(import.meta.url));
const { abi, bytecode } = JSON.parse(readFileSync(join(here, "..", "artifacts", "BenchUSD.json"), "utf8"));
const rpc = process.env.GENLAYER_CHAIN_RPC ?? "https://rpc.testnet-chain.genlayer.com";
const chain = defineChain({
  id: 4221,
  name: "GenLayer Chain (Testnet Bradbury)",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
if (!process.env.DEPLOYER_KEY) throw new Error("Set DEPLOYER_KEY");
const account = privateKeyToAccount(process.env.DEPLOYER_KEY);
const wallet = createWalletClient({ account, chain, transport: http(rpc) }).extend(publicActions);

const hash = await wallet.deployContract({ abi, bytecode, args: [] });
const { contractAddress } = await wallet.waitForTransactionReceipt({ hash });
console.log(`BenchUSD deployed: ${contractAddress}  (tx ${hash})`);

const to = process.env.BUYER_ADDRESS ?? account.address;
const amount = parseUnits(process.env.MINT_AMOUNT ?? "1000", 18);
const mint = await wallet.writeContract({ address: contractAddress, abi, functionName: "mint", args: [to, amount] });
await wallet.waitForTransactionReceipt({ hash: mint });
console.log(`Minted ${process.env.MINT_AMOUNT ?? "1000"} bUSD to ${to}  (tx ${mint})`);
console.log(`\nexport BENCH_USD=${contractAddress}`);

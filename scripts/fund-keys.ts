/** Split the deployer's GEN across the other Bench keys on GenLayer Chain (testnet). Amounts in GEN via argv: genlayer buyer seller. */
import { createWalletClient, http, parseEther, publicActions, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { genlayerChain } from "../packages/core/src/chains.js";

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Set ${k}`);
  return v as Hex;
};
const [g = "8", b = "2", s = "2"] = process.argv.slice(2);
const deployer = createWalletClient({ account: privateKeyToAccount(env("DEPLOYER_KEY")), chain: genlayerChain, transport: http() }).extend(publicActions);
for (const [name, key, amt] of [["GENLAYER_KEY", "GENLAYER_KEY", g], ["BENCH_BUYER_KEY", "BENCH_BUYER_KEY", b], ["BENCH_SELLER_KEY", "BENCH_SELLER_KEY", s]] as const) {
  const to = privateKeyToAccount(env(key)).address;
  const hash = await deployer.sendTransaction({ to, value: parseEther(amt) });
  const r = await deployer.waitForTransactionReceipt({ hash });
  console.log(`${name} ${to} +${amt} GEN  ${r.status}  ${hash}`);
}
console.log("deployer left:", Number(await deployer.getBalance({ address: deployer.account.address })) / 1e18, "GEN");

// Shared local-chain setup: Alkahest's real bytecode + BenchUSD on a Hardhat node (chain id 4221).
import { readFileSync } from "node:fs";
import { deployAlkahest } from "alkahest-ts";
import {
  createTestClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  getAddress,
  http,
  parseAbi,
  parseUnits,
  publicActions,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { encodeNlaDemand, type BenchConfig, type BenchDemand } from "../../packages/core/src/index.js";
import { LOCAL_RPC } from "./global-setup.js";

export const chain = defineChain({
  id: 4221,
  name: "Local GenLayer Chain",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: { default: { http: [LOCAL_RPC] } },
});

/** Throwaway keys for the local chain only; funded by deployLocal(). */
export const KEYS = {
  deployer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  buyer: "0x59c6995e998f97a5a0044966f0945389dc9c86dae88c7a8412f4603b6b78690d",
  seller: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fa9e5f2b2b6d93a",
  stranger: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
} as const satisfies Record<string, Hex>;

/** Stand-in for BenchJudge's address (the oracle named in every escrow). */
export const BENCH_JUDGE = getAddress("0xbe0c4000000000000000000000000000000ce000");

export const ERC20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function mint(address,uint256)"]);
export const ARBITER = parseAbi(["function arbitrate(bytes32 fulfillmentUid, bytes demand, bool decision)"]);
export const EAS_ABI = parseAbi([
  "function getAttestation(bytes32 uid) view returns ((bytes32 uid, bytes32 schema, uint64 time, uint64 expirationTime, uint64 revocationTime, bytes32 refUID, address recipient, address attester, bool revocable, bytes data))",
]);

export const wallet = (key: Hex) => createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(LOCAL_RPC) });
export const testClient = createTestClient({ chain, mode: "hardhat", transport: http(LOCAL_RPC) }).extend(publicActions);

export async function deployLocal(): Promise<{ cfg: BenchConfig; token: Address }> {
  for (const key of Object.values(KEYS)) {
    await testClient.setBalance({ address: privateKeyToAccount(key).address, value: parseUnits("100", 18) });
  }
  const deployer = wallet(KEYS.deployer).extend(publicActions);
  const deployed = await deployAlkahest(
    async (abi, bytecode, args) => {
      const hash = await deployer.deployContract({ abi, bytecode, args });
      const { contractAddress } = await deployer.waitForTransactionReceipt({ hash });
      return contractAddress!;
    },
    { eas: true, scope: "all" },
  );
  const art = JSON.parse(readFileSync(new URL("../../contracts/evm/artifacts/BenchUSD.json", import.meta.url), "utf8"));
  const hash = await deployer.deployContract({ abi: art.abi, bytecode: art.bytecode, args: [] });
  const token = (await deployer.waitForTransactionReceipt({ hash })).contractAddress!;
  const mint = await deployer.writeContract({
    address: token,
    abi: ERC20,
    functionName: "mint",
    args: [privateKeyToAccount(KEYS.buyer).address, parseUnits("1000", 18)],
  });
  await deployer.waitForTransactionReceipt({ hash: mint });
  return { cfg: { addresses: deployed as BenchConfig["addresses"], judge: BENCH_JUDGE }, token };
}

/** Send exactly what BenchJudge's emit().arbitrate(...) produces on finality, from BenchJudge's address. */
export async function benchJudgeArbitrates(cfg: BenchConfig, fulfillmentUid: Hex, demand: BenchDemand, verdict: boolean) {
  await testClient.impersonateAccount({ address: BENCH_JUDGE });
  await testClient.setBalance({ address: BENCH_JUDGE, value: parseUnits("1", 18) });
  const judge = createWalletClient({ account: BENCH_JUDGE, chain, transport: http(LOCAL_RPC) });
  const hash = await judge.sendTransaction({
    to: cfg.addresses.trustedOracleArbiter,
    data: encodeFunctionData({ abi: ARBITER, functionName: "arbitrate", args: [fulfillmentUid, encodeNlaDemand(demand), verdict] }),
  });
  const receipt = await testClient.waitForTransactionReceipt({ hash });
  await testClient.stopImpersonatingAccount({ address: BENCH_JUDGE });
  if (receipt.status !== "success") throw new Error(`impersonated arbitrate reverted (${hash})`);
}

export async function now(): Promise<bigint> {
  return (await testClient.getBlock()).timestamp;
}

import { defineChain, type Chain } from "viem";
import { baseSepolia } from "viem/chains";

export const GENLAYER_CHAIN_EXPLORER = "https://explorer.testnet-chain.genlayer.com";

/** GenLayer Chain: the EVM side of Testnet Bradbury, where Alkahest is deployed. */
export const genlayerChain: Chain = defineChain({
  id: 4221,
  name: "GenLayer Chain (Testnet Bradbury)",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: { default: { http: [(typeof process !== "undefined" ? process.env?.GENLAYER_CHAIN_RPC : undefined) ?? "https://rpc.testnet-chain.genlayer.com"] } },
  blockExplorers: { default: { name: "GenLayer Chain Explorer", url: GENLAYER_CHAIN_EXPLORER } },
  testnet: true,
});

/** GenVM-side explorer (BenchJudge transactions). */
export const BRADBURY_EXPLORER = "https://explorer-bradbury.genlayer.com";
export const STUDIO_EXPLORER = "https://explorer-studio.genlayer.com";

export const evmTxUrl = (hash: string) => `${GENLAYER_CHAIN_EXPLORER}/tx/${hash}`;
export const evmAddressUrl = (address: string) => `${GENLAYER_CHAIN_EXPLORER}/address/${address}`;
export const genvmTxUrl = (hash: string, network: "bradbury" | "studionet" = "bradbury") =>
  `${network === "bradbury" ? BRADBURY_EXPLORER : STUDIO_EXPLORER}/tx/${hash}`;

/** "a" (default): escrows on GenLayer Chain, BenchJudge emits the verdict. "b": escrows on Base Sepolia, BenchJudgeB + relayer/bridge. */
export const BENCH_PLAN: "a" | "b" = (typeof process !== "undefined" ? process.env?.BENCH_PLAN : undefined) === "b" ? "b" : "a";

/** The chain the escrows live on for the active plan. SOURCE_RPC overrides Base Sepolia's public RPC. */
export const escrowChain: Chain =
  BENCH_PLAN === "b"
    ? { ...baseSepolia, rpcUrls: { default: { http: [(typeof process !== "undefined" ? process.env?.SOURCE_RPC : undefined) ?? "https://sepolia.base.org"] } } }
    : genlayerChain;

export const escrowTxUrl = (hash: string) =>
  BENCH_PLAN === "b" ? `https://sepolia.basescan.org/tx/${hash}` : evmTxUrl(hash);

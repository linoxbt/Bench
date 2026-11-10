import { createPublicClient, defineChain, http } from "viem";
import { PUBLIC } from "./config";

/** The chain wallets sign on. Overridable for local runs (NEXT_PUBLIC_CHAIN_*). */
export const walletChain = defineChain({
  id: PUBLIC.chainId,
  name: PUBLIC.chainName,
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: { default: { http: [PUBLIC.chainRpc] } },
  blockExplorers: { default: { name: `${PUBLIC.chainName} explorer`, url: PUBLIC.chainExplorer } },
  testnet: true,
});

export const publicClient = createPublicClient({ chain: walletChain, transport: http(PUBLIC.chainRpc) });

export const txUrl = (hash: string) => `${PUBLIC.chainExplorer}/tx/${hash}`;
export const addressUrl = (a: string) => `${PUBLIC.chainExplorer}/address/${a}`;

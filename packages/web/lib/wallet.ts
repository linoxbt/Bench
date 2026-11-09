"use client";
import { createPublicClient, createWalletClient, custom, http, type Account, type Chain, type EIP1193Provider, type Transport, type WalletClient } from "viem";
import { genlayerChain } from "@bench/core/browser";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export const publicClient = createPublicClient({ chain: genlayerChain, transport: http() });

/** Connect the injected wallet and make sure it is on GenLayer Chain (4221). */
export async function connectWallet(): Promise<WalletClient<Transport, Chain, Account>> {
  const eth = window.ethereum;
  if (!eth) throw new Error("No browser wallet found. Install one (e.g. MetaMask) or use the bench CLI.");
  const [address] = (await eth.request({ method: "eth_requestAccounts" })) as `0x${string}`[];
  if (!address) throw new Error("Wallet returned no account");
  const hexId = `0x${genlayerChain.id.toString(16)}`;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  } catch {
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hexId,
          chainName: genlayerChain.name,
          nativeCurrency: genlayerChain.nativeCurrency,
          rpcUrls: genlayerChain.rpcUrls.default.http,
          blockExplorerUrls: [genlayerChain.blockExplorers!.default.url],
        },
      ],
    });
  }
  return createWalletClient({ account: address, chain: genlayerChain, transport: custom(eth) });
}

export function errorText(e: unknown): string {
  const msg = e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message : String(e);
  return msg.split("\n")[0]!;
}

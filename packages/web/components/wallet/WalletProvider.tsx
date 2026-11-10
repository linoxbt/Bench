"use client";
/**
 * Wallet state for the whole site. Discovers browser wallets with EIP-6963 (every installed wallet announces
 * itself, so MetaMask, Coinbase Wallet, Rabby, ... can coexist), falls back to window.ethereum, reconnects
 * silently on reload, follows account and network changes, and can add/switch to GenLayer Bradbury.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createWalletClient, custom, getAddress, type Account, type Address, type Chain, type EIP1193Provider, type Transport, type WalletClient } from "viem";
import { walletChain } from "@/lib/chain";

export type WalletInfo = { uuid: string; name: string; icon: string; rdns: string };
export type WalletDetail = { info: WalletInfo; provider: EIP1193Provider };
type Status = "disconnected" | "connecting" | "connected";

type Ctx = {
  wallets: WalletDetail[];
  status: Status;
  address?: Address;
  chainId?: number;
  wallet?: WalletInfo;
  provider?: EIP1193Provider;
  onRightChain: boolean;
  error?: string;
  modalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  connect: (w: WalletDetail) => Promise<void>;
  disconnect: () => Promise<void>;
  switchChain: () => Promise<void>;
  /** A viem wallet client on the right chain; switches network first if needed. */
  getWalletClient: () => Promise<WalletClient<Transport, Chain, Account>>;
};

const WalletContext = createContext<Ctx | null>(null);
const STORE = "bench-wallet-rdns";
const HEX_ID = `0x${walletChain.id.toString(16)}`;

declare global {
  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<WalletDetail>;
  }
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<WalletDetail[]>([]);
  const [status, setStatus] = useState<Status>("disconnected");
  const [address, setAddress] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [current, setCurrent] = useState<WalletDetail>();
  const [error, setError] = useState<string>();
  const [modalOpen, setModalOpen] = useState(false);
  const detached = useRef<() => void>(() => {});

  // EIP-6963 discovery, with window.ethereum as a fallback for older wallets.
  useEffect(() => {
    const seen = new Map<string, WalletDetail>();
    const add = (d: WalletDetail) => {
      if (!d?.info?.uuid || !d.provider) return;
      if (seen.has(d.info.rdns || d.info.uuid)) return;
      seen.set(d.info.rdns || d.info.uuid, d);
      setWallets([...seen.values()]);
    };
    const onAnnounce = (e: CustomEvent<WalletDetail>) => add(e.detail);
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const fallback = setTimeout(() => {
      if (seen.size === 0 && window.ethereum) {
        add({ info: { uuid: "injected", name: "Browser wallet", icon: "", rdns: "injected" }, provider: window.ethereum });
      }
    }, 400);
    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      clearTimeout(fallback);
    };
  }, []);

  const attach = useCallback((w: WalletDetail, accounts: string[], chainHex: string) => {
    detached.current();
    setCurrent(w);
    setAddress(getAddress(accounts[0]!));
    setChainId(parseInt(chainHex, 16));
    setStatus("connected");
    setError(undefined);
    localStorage.setItem(STORE, w.info.rdns || w.info.uuid);
    const onAccounts = (a: unknown) => {
      const list = a as string[];
      if (!list?.length) {
        detached.current();
        setStatus("disconnected");
        setAddress(undefined);
        setCurrent(undefined);
        localStorage.removeItem(STORE);
      } else setAddress(getAddress(list[0]!));
    };
    const onChain = (c: unknown) => setChainId(parseInt(String(c), 16));
    const p = w.provider as EIP1193Provider & { on?: Function; removeListener?: Function };
    p.on?.("accountsChanged", onAccounts);
    p.on?.("chainChanged", onChain);
    detached.current = () => {
      p.removeListener?.("accountsChanged", onAccounts);
      p.removeListener?.("chainChanged", onChain);
    };
  }, []);

  // Silent reconnect to the last wallet (eth_accounts never prompts).
  useEffect(() => {
    if (status !== "disconnected") return;
    const last = typeof localStorage !== "undefined" ? localStorage.getItem(STORE) : null;
    const w = last && wallets.find((x) => (x.info.rdns || x.info.uuid) === last);
    if (!w) return;
    (async () => {
      try {
        const accounts = (await w.provider.request({ method: "eth_accounts" })) as string[];
        if (accounts.length) attach(w, accounts, (await w.provider.request({ method: "eth_chainId" })) as string);
      } catch {
        /* stay disconnected */
      }
    })();
  }, [wallets, status, attach]);

  const connect = useCallback(
    async (w: WalletDetail) => {
      setStatus("connecting");
      setError(undefined);
      try {
        const accounts = (await w.provider.request({ method: "eth_requestAccounts" })) as string[];
        if (!accounts.length) throw new Error("The wallet returned no account.");
        attach(w, accounts, (await w.provider.request({ method: "eth_chainId" })) as string);
        setModalOpen(false);
      } catch (e) {
        setStatus("disconnected");
        setError(errorText(e));
      }
    },
    [attach],
  );

  const disconnect = useCallback(async () => {
    try {
      await current?.provider.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] } as never);
    } catch {
      /* not every wallet supports revoking; forgetting locally is enough */
    }
    detached.current();
    localStorage.removeItem(STORE);
    setStatus("disconnected");
    setAddress(undefined);
    setCurrent(undefined);
  }, [current]);

  const switchChain = useCallback(async () => {
    const p = current?.provider;
    if (!p) throw new Error("Connect a wallet first.");
    try {
      await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: HEX_ID }] });
    } catch (e) {
      const code = (e as { code?: number; data?: { originalError?: { code?: number } } }).code ?? (e as any)?.data?.originalError?.code;
      if (code !== 4902 && !/unrecognized|not added|unknown chain/i.test(errorText(e))) throw e;
      await p.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: HEX_ID,
            chainName: walletChain.name,
            nativeCurrency: walletChain.nativeCurrency,
            rpcUrls: walletChain.rpcUrls.default.http,
            blockExplorerUrls: [walletChain.blockExplorers!.default.url],
          },
        ],
      });
    }
    setChainId(parseInt((await p.request({ method: "eth_chainId" })) as string, 16));
  }, [current]);

  const getWalletClient = useCallback(async () => {
    if (!current || !address) {
      setModalOpen(true);
      throw new Error("Connect a wallet to continue.");
    }
    if (chainId !== walletChain.id) await switchChain();
    return createWalletClient({ account: address, chain: walletChain, transport: custom(current.provider) });
  }, [current, address, chainId, switchChain]);

  const value = useMemo<Ctx>(
    () => ({
      wallets,
      status,
      address,
      chainId,
      wallet: current?.info,
      provider: current?.provider,
      onRightChain: chainId === walletChain.id,
      error,
      modalOpen,
      openModal: () => {
        setError(undefined);
        setModalOpen(true);
      },
      closeModal: () => setModalOpen(false),
      connect,
      disconnect,
      switchChain,
      getWalletClient,
    }),
    [wallets, status, address, chainId, current, error, modalOpen, connect, disconnect, switchChain, getWalletClient],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): Ctx {
  const c = useContext(WalletContext);
  if (!c) throw new Error("useWallet must be used inside <WalletProvider>");
  return c;
}

export function errorText(e: unknown): string {
  const any = e as { shortMessage?: string; message?: string; code?: number };
  if (any?.code === 4001) return "You rejected the request in your wallet.";
  const msg = any?.shortMessage ?? any?.message ?? String(e);
  return msg.split("\n")[0]!;
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

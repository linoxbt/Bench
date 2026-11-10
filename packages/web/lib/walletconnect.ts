"use client";
/**
 * WalletConnect (Reown) as one more EIP-1193 provider. The SDK and its QR modal load only when someone picks
 * WalletConnect, and the option only exists when NEXT_PUBLIC_REOWN_PROJECT_ID is set.
 */
import type { EIP1193Provider } from "viem";
import { PUBLIC } from "./config";

type Listener = (...args: unknown[]) => void;
type WcProvider = {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  session?: unknown;
  on(e: string, f: Listener): void;
  removeListener(e: string, f: Listener): void;
};

export const WALLETCONNECT_ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#3396ff"/><path d="M12.2 15.6c4.3-4.2 11.3-4.2 15.6 0l.5.5c.2.2.2.6 0 .8l-1.8 1.7c-.1.1-.3.1-.4 0l-.7-.7c-3-2.9-7.9-2.9-10.9 0l-.8.8c-.1.1-.3.1-.4 0l-1.8-1.7c-.2-.2-.2-.6 0-.8zm19.3 3.6 1.6 1.6c.2.2.2.6 0 .8l-7.2 7c-.2.2-.6.2-.8 0l-5.1-5c-.1-.1-.1-.1-.2 0l-5.1 5c-.2.2-.6.2-.8 0l-7.2-7c-.2-.2-.2-.6 0-.8l1.6-1.6c.2-.2.6-.2.8 0l5.1 5c.1.1.1.1.2 0l5.1-5c.2-.2.6-.2.8 0l5.1 5c.1.1.1.1.2 0l5.1-5c.2-.2.6-.2.8 0z" fill="#fff"/></svg>',
  );

export function walletConnectProvider(): (EIP1193Provider & { disconnect(): Promise<void> }) | undefined {
  const projectId = PUBLIC.reownProjectId;
  if (!projectId) return undefined;
  let loading: Promise<WcProvider> | undefined;
  let loaded: WcProvider | undefined;
  const queued: [string, Listener][] = [];

  const load = () =>
    (loading ??= import("@walletconnect/ethereum-provider").then(async ({ EthereumProvider }) => {
      const wc = (await EthereumProvider.init({
        projectId,
        showQrModal: true,
        qrModalOptions: { themeMode: "light", themeVariables: { "--wcm-accent-color": "#1f3cff", "--wcm-z-index": "70" } as never },
        optionalChains: [PUBLIC.chainId],
        rpcMap: { [PUBLIC.chainId]: PUBLIC.chainRpc },
        metadata: {
          name: "Bench",
          description: "The neutral judge for onchain agreements",
          url: window.location.origin,
          icons: [`${window.location.origin}/icon.svg`],
        },
      })) as unknown as WcProvider;
      for (const [e, f] of queued) wc.on(e, f);
      loaded = wc;
      return wc;
    }));

  const provider = {
    async request(args: { method: string; params?: unknown }) {
      const wc = await load();
      if (args.method === "eth_requestAccounts" && !wc.session) await wc.connect(); // opens the QR modal
      if (args.method === "eth_accounts" && !wc.session) return [];
      return wc.request(args);
    },
    on(e: string, f: Listener) {
      if (loaded) loaded.on(e, f);
      else queued.push([e, f]);
    },
    removeListener(e: string, f: Listener) {
      loaded?.removeListener(e, f);
      const i = queued.findIndex(([qe, qf]) => qe === e && qf === f);
      if (i >= 0) queued.splice(i, 1);
    },
    async disconnect() {
      if (loaded?.session) await loaded.disconnect();
    },
  };
  return provider as unknown as EIP1193Provider & { disconnect(): Promise<void> };
}

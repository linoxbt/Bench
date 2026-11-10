import { getAddress, type Address } from "viem";
import { ALKAHEST_BRADBURY } from "@bench/core/browser";

const ZERO = "0x0000000000000000000000000000000000000000";
const addr = (v: string | undefined): Address | undefined => {
  if (!v || v.toLowerCase() === ZERO) return undefined;
  try {
    return getAddress(v.toLowerCase());
  } catch {
    return undefined;
  }
};

function alkahest() {
  const raw = process.env.NEXT_PUBLIC_ALKAHEST_ADDRESSES;
  if (!raw) return ALKAHEST_BRADBURY;
  try {
    return { ...ALKAHEST_BRADBURY, ...(JSON.parse(raw) as Partial<typeof ALKAHEST_BRADBURY>) };
  } catch {
    return ALKAHEST_BRADBURY;
  }
}

/** Public config, inlined at build time (set these in Vercel). Every NEXT_PUBLIC_ name must be written out literally. */
export const PUBLIC = {
  judge: addr(process.env.NEXT_PUBLIC_BENCH_JUDGE),
  judgeStudionet: addr(process.env.NEXT_PUBLIC_BENCH_JUDGE_STUDIONET),
  token: addr(process.env.NEXT_PUBLIC_BENCH_USD),
  repo: process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/linoxbt/Bench",
  /** The network wallets connect to: GenLayer Testnet Bradbury (EVM side and GenVM share chain 4221). */
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 4221),
  chainName: process.env.NEXT_PUBLIC_CHAIN_NAME ?? "GenLayer Bradbury",
  chainRpc: process.env.NEXT_PUBLIC_CHAIN_RPC ?? "https://rpc-bradbury.genlayer.com",
  chainExplorer: process.env.NEXT_PUBLIC_CHAIN_EXPLORER ?? "https://explorer-bradbury.genlayer.com",
  alkahest: alkahest(),
};

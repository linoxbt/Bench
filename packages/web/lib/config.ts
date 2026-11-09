import { getAddress, type Address } from "viem";

const ZERO = "0x0000000000000000000000000000000000000000";
const addr = (v: string | undefined): Address | undefined => {
  if (!v || v.toLowerCase() === ZERO) return undefined;
  try {
    return getAddress(v.toLowerCase());
  } catch {
    return undefined;
  }
};

/** Public config, inlined at build time (set these in Vercel). */
export const PUBLIC = {
  judge: addr(process.env.NEXT_PUBLIC_BENCH_JUDGE),
  judgeStudionet: addr(process.env.NEXT_PUBLIC_BENCH_JUDGE_STUDIONET),
  token: addr(process.env.NEXT_PUBLIC_BENCH_USD),
  repo: process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/linoxbt/Bench",
};

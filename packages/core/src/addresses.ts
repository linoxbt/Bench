import { getAddress, type Address } from "viem";

/**
 * Alkahest on GenLayer Chain (4221). Lives in alkahest-bradbury.ts, which scripts/deploy-alkahest.ts regenerates.
 * Always pass this full map to makeClient: alkahest-ts 1.1.2's "GenLayer Bradbury" preset
 * fills most contracts with 0x0 (Cantina ALKA-27/28).
 */
export { ALKAHEST_BRADBURY, ALKAHEST_BRADBURY_DEPLOYMENT } from "./alkahest-bradbury.js";

/** Alkahest on Base Sepolia (84532), Plan B only. */
export const ALKAHEST_BASE_SEPOLIA = {
  eas: "0x4200000000000000000000000000000000000021",
  erc20EscrowObligation: "0x235E4D9d329460fEE53A45cC6b14109bC74818AA",
  commitRevealObligation: "0x2834FFf408D729d08058E24002B19B45B1Ec06cd",
  stringObligation: "0xB1e14fdeBB8192Fb0bEe918075CcD350d0Cb47a7",
  trustedOracleArbiter: "0xCA13C55a1863fF8F6CEF9166C30bb4563EB7Dca3",
} as const satisfies Record<string, Address>;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/**
 * The oracle named in escrows. Plan A: BenchJudge's address on Testnet Bradbury (`pnpm deploy:judge`).
 * Plan B: the relayer key's address or the BenchBridgeReceiver; BenchJudgeB's own address is BENCH_JUDGE_B.
 */
/** A blank variable (`BENCH_USD=` in a copied .env) counts as unset. */
const env = (name: string): string | undefined => {
  const v = typeof process !== "undefined" ? process.env?.[name] : undefined;
  return v && v.trim() ? v.trim() : undefined;
};

/** Values that are set but aren't addresses: reported when a command needs them, never at import (so --help works). */
const INVALID: Record<string, string> = {};
const envAddress = (names: string[]): Address => {
  for (const n of names) {
    const v = env(n);
    if (v === undefined) continue;
    try {
      return getAddress(v.toLowerCase());
    } catch {
      INVALID[n] = v;
      return ZERO_ADDRESS;
    }
  }
  return ZERO_ADDRESS;
};

export const BENCH_JUDGE = envAddress(["BENCH_JUDGE", "NEXT_PUBLIC_BENCH_JUDGE"]);

/** BenchUSD demo token on chain 4221. Set after deploying contracts/evm/BenchUSD.sol. */
export const BENCH_USD = envAddress(["BENCH_USD", "NEXT_PUBLIC_BENCH_USD"]);

/** Plan B: BenchJudgeB on GenLayer (`pnpm deploy:judge-b`). */
export const BENCH_JUDGE_B = envAddress(["BENCH_JUDGE_B"]);

export function requireDeployed(name: string, address: Address): Address {
  const v = { BenchJudge: "BENCH_JUDGE", BenchJudgeB: "BENCH_JUDGE_B", BenchUSD: "BENCH_USD" }[name] ?? name;
  if (INVALID[v] !== undefined) throw new Error(`${v} is set to "${INVALID[v]}", which isn't an address.`);
  if (address.toLowerCase() === ZERO_ADDRESS) throw new Error(`${name} is not set. Export ${v} (see README).`);
  return address;
}

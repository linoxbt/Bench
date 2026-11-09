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

/** BenchJudge's address on Testnet Bradbury. Set after `pnpm deploy:judge` (see README). */
const env = (name: string): string | undefined => (typeof process !== "undefined" ? process.env?.[name] : undefined);
const envAddress = (v: string | undefined): Address => getAddress((v ?? ZERO_ADDRESS).toLowerCase());

export const BENCH_JUDGE = envAddress(env("BENCH_JUDGE") ?? env("NEXT_PUBLIC_BENCH_JUDGE"));

/** BenchUSD demo token on chain 4221. Set after deploying contracts/evm/BenchUSD.sol. */
export const BENCH_USD = envAddress(env("BENCH_USD") ?? env("NEXT_PUBLIC_BENCH_USD"));

export function requireDeployed(name: string, address: Address): Address {
  if (address.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(`${name} is not set. Export ${name === "BenchJudge" ? "BENCH_JUDGE" : "BENCH_USD"} (see README).`);
  }
  return address;
}

import { getAddress, type Address } from "viem";

/**
 * Alkahest on GenLayer Chain (4221), from arkhai-io/alkahest
 * contracts/deployments/deployment_genlayer_bradbury.json. Verify with scripts/day1-gate.sh.
 *
 * Always pass this full map to makeClient: alkahest-ts 1.1.2's "GenLayer Bradbury" preset
 * fills most contracts with 0x0 (Cantina ALKA-27/28).
 */
export const ALKAHEST_BRADBURY = {
  eas: "0xaC18Fa0DE3123215404a0C5f6d02ed9B2D0D0d98",
  easSchemaRegistry: "0xA1F9076932f6eEA0D90BBfA1D6E81D001012645D",
  erc20EscrowObligation: "0x2A7df117e45D93d34a7893CC3aE8B105Ae0B561C",
  erc20PaymentObligation: "0x59A9c929778Ad2cC4D5DB6151bDEf0F9Fa7A068C",
  erc20BarterUtils: "0x52De4B30721b3E3660A79da7491a9B2F8a9cB1D5",
  nativeTokenEscrowObligation: "0x5bf7c8b0d60d05af0a3De531EB876De271E80dbc",
  commitRevealObligation: "0xb822aA07F55a8B75Ee133ede1f21C4E49DE7952f",
  stringObligation: "0xB2c808911E84E80156101983897Da7c80e13cB47",
  trustedOracleArbiter: "0xe968dFA581B8aBb94eC5F24d0b56163DE69511fD",
  trivialArbiter: "0x847F69d27E4F1A8a115aCa3F4358B079706dc9CE",
} as const satisfies Record<string, Address>;

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

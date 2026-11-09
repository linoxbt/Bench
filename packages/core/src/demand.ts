import { decodeAbiParameters, encodeAbiParameters, getAddress, parseAbiParameters, type Address, type Hex } from "viem";

/** Arkhai NLA demand, the same ABI as natural-language-agreements/nla.ts. */
export const NLA_ABI = parseAbiParameters(
  "(string arbitrationProvider, string arbitrationModel, string arbitrationPrompt, string demand)",
);
/** TrustedOracleArbiter.DemandData */
export const TRUSTED_ORACLE_ABI = parseAbiParameters("(address oracle, bytes data)");

export const BENCH_PROVIDER = "GenLayer";
export const BENCH_MODEL = "bench-jury-v1";

/** Limits enforced by BenchJudge; longer text is cut and marked "[truncated]" for the jury. */
export const LIMITS = { deliveryChars: 6000, pageChars: 8000, maxUrls: 2 } as const;

export type BenchDemand = { demand: string; rubric?: string };

export const encodeNlaDemand = ({ demand, rubric = "" }: BenchDemand): Hex =>
  encodeAbiParameters(NLA_ABI, [
    { arbitrationProvider: BENCH_PROVIDER, arbitrationModel: BENCH_MODEL, arbitrationPrompt: rubric, demand },
  ]);

export const decodeNlaDemand = (data: Hex) => decodeAbiParameters(NLA_ABI, data)[0];

/** TrustedOracleArbiter.DemandData{oracle, data}, as Solidity abi.decode(demand, (DemandData)) expects. */
export const encodeOracleDemand = (oracle: Address, data: Hex): Hex =>
  encodeAbiParameters(TRUSTED_ORACLE_ABI, [{ oracle: getAddress(oracle.toLowerCase()), data }]);

export const decodeOracleDemand = (demand: Hex) => decodeAbiParameters(TRUSTED_ORACLE_ABI, demand)[0];

/** Full escrow demand for an escrow judged by `oracle` (BenchJudge). */
export const encodeBenchDemand = (oracle: Address, d: BenchDemand): Hex => encodeOracleDemand(oracle, encodeNlaDemand(d));

/** Warnings a seller should see before delivering. */
export function deliveryWarnings(delivery: string): string[] {
  const out: string[] = [];
  if (delivery.length > LIMITS.deliveryChars) {
    out.push(`Delivery is ${delivery.length} characters; the jury sees only the first ${LIMITS.deliveryChars}.`);
  }
  const urls = delivery.match(/https?:\/\/[^\s)"'<>]+/g) ?? [];
  if (urls.length > LIMITS.maxUrls) {
    out.push(`Delivery links ${urls.length} URLs; the jury renders only the first ${LIMITS.maxUrls}.`);
  }
  if (urls.length > 0) {
    out.push(
      `Each linked page is cut at ${LIMITS.pageChars} characters, and every validator renders it separately: keep it static until the verdict is final.`,
    );
  }
  return out;
}

/** Parse "24h", "90m", "2d", "3600s" or a unix timestamp into an absolute expiration (seconds). */
export function parseExpiry(input: string, now = Math.floor(Date.now() / 1000)): bigint {
  const m = /^(\d+)\s*([smhd])$/i.exec(input.trim());
  if (m) {
    const n = Number(m[1]);
    const unit = { s: 1, m: 60, h: 3600, d: 86400 }[m[2]!.toLowerCase() as "s" | "m" | "h" | "d"];
    return BigInt(now + n * unit);
  }
  if (/^\d{9,}$/.test(input.trim())) return BigInt(input.trim());
  throw new Error(`Can't read expiry "${input}". Use e.g. 24h, 90m, 2d, or a unix timestamp.`);
}

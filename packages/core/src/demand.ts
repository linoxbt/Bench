import { decodeAbiParameters, encodeAbiParameters, getAddress, isAddress, parseAbiParameters, parseUnits, type Address, type Hex } from "viem";

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

/** Most judged deliveries an escrow can allow (BenchJudge enforces 1-10, default 3). */
export const MAX_TRIES = 10;
export const DEFAULT_TRIES = 3;
/** Longest demand / rubric BenchJudge keeps (it stores and shows the first 2,000 characters). */
export const MAX_TERMS_CHARS = 2000;

/**
 * seller: only that address's deliveries are judged, so nobody can copy the seller's revealed work and race
 *   them for the payment. Leave it out for an open bounty (anyone may deliver).
 * tries: how many deliveries BenchJudge will judge for this escrow (1-10, default 3), so a seller can't keep
 *   redelivering until one jury run says yes.
 */
export type BenchDemand = { demand: string; rubric?: string; seller?: Address; tries?: number };

/** Bench's terms ride in the NLA tuple's arbitrationModel string ("bench-jury-v1;seller=0x…;tries=3"), so Arkhai's
 * NLA encoding is unchanged and BenchJudge (the oracle) reads them. */
export function benchModel({ seller, tries }: Pick<BenchDemand, "seller" | "tries">): string {
  let model = BENCH_MODEL;
  if (seller) {
    if (!isAddress(seller, { strict: false })) throw new Error(`seller must be an address, got "${seller}"`);
    model += `;seller=${seller.toLowerCase()}`;
  }
  if (tries !== undefined) {
    if (!Number.isInteger(tries) || tries < 1 || tries > MAX_TRIES) throw new Error(`tries must be 1-${MAX_TRIES}`);
    model += `;tries=${tries}`;
  }
  return model;
}

/** The terms an escrow's arbitrationModel string carries (what BenchJudge will enforce). */
export function parseBenchTerms(model: string): { seller?: Address; tries: number } {
  const out: { seller?: Address; tries: number } = { tries: DEFAULT_TRIES };
  for (const part of model.split(";").slice(1)) {
    const [k, v] = part.split("=").map((x) => x.trim());
    if (k?.toLowerCase() === "seller" && v && isAddress(v, { strict: false })) out.seller = getAddress(v.toLowerCase());
    if (k?.toLowerCase() === "tries" && v && /^\d+$/.test(v)) out.tries = Number(v);
  }
  return out;
}

/** Checks a buyer's demand before any money moves. Returns the problems, empty when fine. */
export function demandProblems(d: BenchDemand): string[] {
  const out: string[] = [];
  if (!d.demand.trim()) out.push("The demand is empty: write what the seller must deliver.");
  if (d.demand.length > MAX_TERMS_CHARS) out.push(`The demand is ${d.demand.length} characters; BenchJudge keeps ${MAX_TERMS_CHARS}.`);
  if ((d.rubric ?? "").length > MAX_TERMS_CHARS) out.push(`The rubric is ${(d.rubric ?? "").length} characters; BenchJudge keeps ${MAX_TERMS_CHARS}.`);
  try {
    benchModel(d);
  } catch (e) {
    out.push((e as Error).message);
  }
  return out;
}

export const encodeNlaDemand = ({ demand, rubric = "", seller, tries }: BenchDemand): Hex =>
  encodeAbiParameters(NLA_ABI, [
    { arbitrationProvider: BENCH_PROVIDER, arbitrationModel: benchModel({ seller, tries }), arbitrationPrompt: rubric, demand },
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

/**
 * Shortest escrow lifetime accepted: delivery plus GenLayer finality, and BenchJudge refuses a case when the
 * escrow has under 10 minutes left. 24 h is the recommended default.
 */
export const MIN_EXPIRY_SECONDS = 30 * 60;

/** Parse "24h", "90m", "2d", "3600s" or a unix timestamp into an absolute expiration (seconds), at least 30 min out. */
export function parseExpiry(input: string, now = Math.floor(Date.now() / 1000)): bigint {
  const m = /^(\d+)\s*([smhd])$/i.exec(input.trim());
  let at: number;
  if (m) {
    const unit = { s: 1, m: 60, h: 3600, d: 86400 }[m[2]!.toLowerCase() as "s" | "m" | "h" | "d"];
    at = now + Number(m[1]) * unit;
  } else if (/^\d{9,}$/.test(input.trim())) {
    at = Number(input.trim());
  } else {
    throw new Error(`Can't read expiry "${input}". Use e.g. 24h, 90m, 2d, or a unix timestamp.`);
  }
  if (at < now + MIN_EXPIRY_SECONDS) {
    throw new Error(`Expiry must be at least ${MIN_EXPIRY_SECONDS / 60} minutes from now (delivery + GenLayer finality); 24h is the safe default.`);
  }
  return BigInt(at);
}

/** Parse a token amount: positive, and no more decimal places than the token has (no silent rounding). */
export function parseAmount(input: string, decimals: number): bigint {
  const t = input.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error(`Amount must be a positive number, got "${input}".`);
  const frac = t.split(".")[1] ?? "";
  if (frac.length > decimals) throw new Error(`This token has ${decimals} decimals; "${input}" has ${frac.length}.`);
  const v = parseUnits(t, decimals);
  if (v <= 0n) throw new Error("Amount must be greater than zero.");
  return v;
}

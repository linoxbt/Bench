import { describe, expect, it } from "vitest";
import {
  decodeNlaDemand,
  decodeOracleDemand,
  deliveryWarnings,
  encodeBenchDemand,
  encodeNlaDemand,
  parseExpiry,
  parseAmount,
  benchModel,
  parseBenchTerms,
  demandProblems,
} from "../src/demand.js";
import vector from "./vector.json" with { type: "json" };

describe("NLA demand codec", () => {
  it("matches the bytes Python's eth_abi produces (what BenchJudge decodes)", () => {
    expect(encodeNlaDemand({ demand: vector.demand, rubric: vector.rubric })).toBe(vector.nla);
    expect(encodeBenchDemand(vector.oracle as `0x${string}`, { demand: vector.demand, rubric: vector.rubric })).toBe(
      vector.oracleDemand,
    );
  });

  it("round-trips", () => {
    const { oracle, data } = decodeOracleDemand(vector.oracleDemand as `0x${string}`);
    expect(oracle.toLowerCase()).toBe(vector.oracle);
    const nla = decodeNlaDemand(data);
    expect(nla).toEqual({
      arbitrationProvider: "GenLayer",
      arbitrationModel: "bench-jury-v1",
      arbitrationPrompt: vector.rubric,
      demand: vector.demand,
    });
  });

  it("accepts an oracle address in any letter case", () => {
    const upper = ("0x" + vector.oracle.slice(2).toUpperCase()) as `0x${string}`;
    expect(encodeBenchDemand(upper, { demand: vector.demand, rubric: vector.rubric })).toBe(vector.oracleDemand);
  });
});

describe("deliveryWarnings", () => {
  it("is quiet for short plain text", () => {
    expect(deliveryWarnings("Start free today.")).toEqual([]);
  });
  it("warns about truncation, URL count and page stability", () => {
    const w = deliveryWarnings("x".repeat(6001) + " https://a.example https://b.example https://c.example");
    expect(w.join(" ")).toMatch(/first 6000/);
    expect(w.join(" ")).toMatch(/only the first 2/);
    expect(w.join(" ")).toMatch(/static/);
  });
});

describe("parseExpiry", () => {
  const now = 1_800_000_000;
  it("reads relative durations", () => {
    expect(parseExpiry("24h", now)).toBe(BigInt(now + 86_400));
    expect(parseExpiry("90m", now)).toBe(BigInt(now + 5_400));
    expect(parseExpiry("2d", now)).toBe(BigInt(now + 172_800));
  });
  it("reads unix timestamps", () => {
    expect(parseExpiry("1900000000", now)).toBe(1_900_000_000n);
  });
  it("rejects nonsense", () => {
    expect(() => parseExpiry("soon", now)).toThrow(/Can't read expiry/);
  });
});

import { modelLabel } from "../src/judge.js";
describe("modelLabel", () => {
  it("turns network model ids into readable names", () => {
    expect(modelLabel("policy:prd-gpt-5-4")).toBe("GPT-5.4");
    expect(modelLabel("policy:prd-gemini")).toBe("Gemini");
    expect(modelLabel("anthropic/claude-sonnet-4.6")).toBe("Claude Sonnet 4.6");
    expect(modelLabel("Anthropic/Claude Sonnet 4.6")).toBe("Claude Sonnet 4.6");
    expect(modelLabel("policy:prd-glm")).toBe("GLM");
    expect(modelLabel("policy:prd-minimax")).toBe("MiniMax");
    expect(modelLabel("openai/gpt-oss-120b")).toBe("GPT OSS 120b");
    expect(modelLabel(undefined)).toBeUndefined();
  });
});

describe("escrow terms (seller, tries) in the model string", () => {
  const seller = "0x3F0AB25c861CDd0DE372132184755E34e69ae944" as const;
  it("encodes and parses them; plain demands keep the v1 model", () => {
    expect(benchModel({})).toBe("bench-jury-v1");
    expect(benchModel({ seller, tries: 2 })).toBe(`bench-jury-v1;seller=${seller.toLowerCase()};tries=2`);
    expect(parseBenchTerms(benchModel({ seller, tries: 2 }))).toEqual({ seller, tries: 2 });
    expect(parseBenchTerms("bench-jury-v1")).toEqual({ tries: 3 });
    expect(decodeNlaDemand(encodeNlaDemand({ demand: "d", seller })).arbitrationModel).toContain("seller=");
  });
  it("rejects bad terms before any money moves", () => {
    expect(() => benchModel({ tries: 0 })).toThrow(/tries must be 1-10/);
    expect(() => benchModel({ tries: 11 })).toThrow(/tries must be 1-10/);
    expect(() => benchModel({ seller: "0x1234" as never })).toThrow(/seller must be an address/);
    expect(demandProblems({ demand: "  " })).toEqual(["The demand is empty: write what the seller must deliver."]);
    expect(demandProblems({ demand: "x".repeat(2001) })[0]).toMatch(/keeps 2000/);
  });
});

describe("parseAmount", () => {
  it("parses exact amounts", () => {
    expect(parseAmount("50", 18)).toBe(50n * 10n ** 18n);
    expect(parseAmount("1.5", 6)).toBe(1_500_000n);
  });
  it("refuses zero, negatives, junk and silent rounding", () => {
    expect(() => parseAmount("0", 18)).toThrow(/greater than zero/);
    expect(() => parseAmount("-1", 18)).toThrow(/positive number/);
    expect(() => parseAmount("abc", 18)).toThrow(/positive number/);
    expect(() => parseAmount("1.0000005", 6)).toThrow(/6 decimals/);
  });
});

describe("parseExpiry minimum", () => {
  const now = 1_800_000_000;
  it("refuses expiries that leave no time for delivery and finality", () => {
    expect(() => parseExpiry("1m", now)).toThrow(/at least 30 minutes/);
    expect(() => parseExpiry("0s", now)).toThrow(/at least 30 minutes/);
    expect(() => parseExpiry(String(now - 10), now)).toThrow(/at least 30 minutes/);
    expect(parseExpiry("30m", now)).toBe(BigInt(now + 1800));
  });
});

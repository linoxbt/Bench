import { describe, expect, it } from "vitest";
import {
  decodeNlaDemand,
  decodeOracleDemand,
  deliveryWarnings,
  encodeBenchDemand,
  encodeNlaDemand,
  parseExpiry,
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

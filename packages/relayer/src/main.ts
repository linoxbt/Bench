#!/usr/bin/env node
/**
 * bench-relayer: Plan B1 service. Env:
 *   BENCH_JUDGE_B   BenchJudgeB address on GenLayer      GENLAYER_NETWORK  studionet | bradbury (default bradbury)
 *   RELAYER_KEY     the oracle key escrows name           SOURCE_RPC        default https://sepolia.base.org
 *   ARBITER         TrustedOracleArbiter (default Base Sepolia's)   POLL_SECONDS  default 30
 *   STATE_FILE      cursor file (default .relayer-state.json)        FROM_BLOCK   earliest block to search for decisions
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { ALKAHEST_BASE_SEPOLIA } from "@bench/core/browser";
import { Relayer, benchJudgeBSource } from "./relayer.js";

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Set ${k}`);
  return v;
};
const rpc = process.env.SOURCE_RPC ?? "https://sepolia.base.org";
const state = process.env.STATE_FILE ?? ".relayer-state.json";
const account = privateKeyToAccount(env("RELAYER_KEY") as Hex);
const relayer = new Relayer({
  source: benchJudgeBSource(env("BENCH_JUDGE_B") as Address, process.env.GENLAYER_NETWORK === "studionet" ? "studionet" : "bradbury"),
  wallet: createWalletClient({ account, chain: baseSepolia, transport: http(rpc) }),
  publicClient: createPublicClient({ transport: http(rpc) }), // plain client: the OP-stack formatters add nothing here
  arbiter: (process.env.ARBITER ?? ALKAHEST_BASE_SEPOLIA.trustedOracleArbiter) as Address,
  cursor: existsSync(state) ? JSON.parse(readFileSync(state, "utf8")).cursor : 0,
  fromBlock: process.env.FROM_BLOCK ? BigInt(process.env.FROM_BLOCK) : undefined,
});
console.log(`[relayer] oracle ${account.address}, judge ${process.env.BENCH_JUDGE_B}, source ${rpc}, cursor ${relayer.cursor}`);
for (;;) {
  try {
    const done = await relayer.tick();
    if (done.length) console.log(JSON.stringify(done));
    writeFileSync(state, JSON.stringify({ cursor: relayer.cursor }));
  } catch (e) {
    console.error(`[relayer] ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  }
  if (process.env.ONCE) break;
  await new Promise((r) => setTimeout(r, Number(process.env.POLL_SECONDS ?? 30) * 1000));
}

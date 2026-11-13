#!/usr/bin/env node
/**
 * bench-relayer: Plan B1 service. Env:
 *   BENCH_JUDGE_B   BenchJudgeB address on GenLayer      GENLAYER_NETWORK  studionet | bradbury (default studionet,
 *                                                                          where BenchJudgeB runs: it is GenVM v0.2)
 *   RELAYER_KEY     the oracle key escrows name           SOURCE_RPC        default https://sepolia.base.org
 *   ARBITER / EAS   Alkahest on the source chain (default Base Sepolia's)   POLL_SECONDS  default 30
 *   STATE_FILE      cursor + retry list (default .relayer-state.json; a .lock next to it stops a second instance)
 */
import { closeSync, existsSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { ALKAHEST_BASE_SEPOLIA } from "@bench/core/browser";
import { Relayer, benchJudgeBSource } from "./relayer.js";

const env = (k: string) => {
  const v = process.env[k]?.trim();
  if (!v) throw new Error(`Set ${k}`);
  return v;
};
const rpc = process.env.SOURCE_RPC ?? "https://sepolia.base.org";
const state = process.env.STATE_FILE ?? ".relayer-state.json";
const lock = `${state}.lock`;

// One relayer per state file: two would race each other's cursor (sends stay safe, but the work doubles).
try {
  closeSync(openSync(lock, "wx"));
} catch {
  const pid = Number(readFileSync(lock, "utf8") || 0);
  let alive = false;
  try {
    alive = pid > 0 && process.kill(pid, 0);
  } catch {
    alive = false;
  }
  if (alive) throw new Error(`Another relayer (pid ${pid}) is using ${state}. Stop it, or set STATE_FILE.`);
}
writeFileSync(lock, String(process.pid));
const release = () => rmSync(lock, { force: true });
process.on("exit", release);
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => process.exit(0));

const saved = existsSync(state) ? JSON.parse(readFileSync(state, "utf8")) : {};
const key = env("RELAYER_KEY");
const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
const relayer = new Relayer({
  source: benchJudgeBSource(env("BENCH_JUDGE_B") as Address, process.env.GENLAYER_NETWORK === "bradbury" ? "bradbury" : "studionet"),
  wallet: createWalletClient({ account, chain: baseSepolia, transport: http(rpc) }),
  publicClient: createPublicClient({ transport: http(rpc) }), // plain client: the OP-stack formatters add nothing here
  arbiter: (process.env.ARBITER ?? ALKAHEST_BASE_SEPOLIA.trustedOracleArbiter) as Address,
  eas: (process.env.EAS ?? ALKAHEST_BASE_SEPOLIA.eas) as Address,
  cursor: saved.cursor ?? 0,
  retry: saved.retry ?? [],
});

/** Atomic: a crash mid-write never leaves a truncated state file. */
function persist() {
  writeFileSync(`${state}.tmp`, JSON.stringify({ cursor: relayer.cursor, retry: [...relayer.retry] }));
  renameSync(`${state}.tmp`, state);
}

console.log(`[relayer] oracle ${account.address}, judge ${process.env.BENCH_JUDGE_B}, source ${rpc}, cursor ${relayer.cursor}`);
for (;;) {
  try {
    const done = await relayer.tick();
    if (done.length) console.log(JSON.stringify(done));
  } catch (e) {
    console.error(`[relayer] ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  }
  persist();
  if (process.env.ONCE) break;
  await new Promise((r) => setTimeout(r, Number(process.env.POLL_SECONDS ?? 30) * 1000));
}

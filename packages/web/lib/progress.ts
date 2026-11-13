"use client";
/**
 * What a user did in this browser, so a refresh or a closed tab never strands them: escrows they locked,
 * unfinished deliveries (the commit's salt, without which the bond and the work are stuck), and judge
 * transactions they sent. localStorage only; nothing leaves the browser.
 */
import type { Address, Hex } from "viem";
import type { SavedCommit } from "@bench/core/browser";

const get = <T,>(k: string): T | undefined => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : undefined;
  } catch {
    return undefined;
  }
};
const set = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full or disabled: the URL still carries the ids */
  }
};

export type MyEscrow = { escrowUid: Hex; label: string; at: number };
export const myEscrows = () => get<MyEscrow[]>("bench:escrows") ?? [];
export function rememberEscrow(e: MyEscrow) {
  set("bench:escrows", [e, ...myEscrows().filter((x) => x.escrowUid !== e.escrowUid)].slice(0, 50));
}

const commitKey = (escrow: Hex, claimer: Address) => `bench:commit:${escrow.toLowerCase()}:${claimer.toLowerCase()}`;
export const savedCommit = (escrow: Hex, claimer: Address) => get<SavedCommit>(commitKey(escrow, claimer));
export const saveCommit = (s: SavedCommit) => set(commitKey(s.escrowUid, s.claimer), s);
export const clearCommit = (escrow: Hex, claimer: Address) => {
  try {
    localStorage.removeItem(commitKey(escrow, claimer));
  } catch {
    /* ignore */
  }
};

const judgeKey = (escrow: Hex, fulfillment: Hex) => `bench:judge:${escrow.toLowerCase()}:${fulfillment.toLowerCase()}`;
export const savedJudgeTx = (escrow: Hex, fulfillment: Hex) => get<Hex>(judgeKey(escrow, fulfillment));
export const saveJudgeTx = (escrow: Hex, fulfillment: Hex, tx: Hex) => set(judgeKey(escrow, fulfillment), tx);

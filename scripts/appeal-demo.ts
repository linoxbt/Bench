/**
 * Appeal demonstration on Testnet Bradbury: a borderline preview, appealed inside its (short) appeal window, followed to
 * finality. Writes the transactions and both rounds' outcomes to deployments/appeal-bradbury.json for the README.
 * Env: APPEAL_KEY (a funded Bradbury key; defaults to GENLAYER_KEY), BENCH_JUDGE.
 */
import { writeFileSync } from "node:fs";
import { formatEther, type Hex } from "viem";
import { BENCH_JUDGE, appeal, appealQuote, genlayer, genvmTxUrl, getCase, juryFromTx, preview, requireDeployed, waitFinal, getTx } from "../packages/core/src/index.js";

const k = (process.env.APPEAL_KEY ?? process.env.GENLAYER_KEY)?.trim();
if (!k) throw new Error("Set APPEAL_KEY or GENLAYER_KEY");
const gl = genlayer({ privateKey: (k.startsWith("0x") ? k : `0x${k}`) as Hex });
const judge = requireDeployed("BenchJudge", BENCH_JUDGE);

// Borderline on purpose: "about 50 words" with a 61-word delivery, so validators may split and an appeal is meaningful.
// APPEAL_TX=<hash> APPEAL_ID=<id> records an earlier run instead of starting a new one.
const id = process.env.APPEAL_ID ?? `appeal-demo-${Date.now().toString(36)}`;
const demand = "A product description of about 50 words for a reusable water bottle. Must mention that it keeps drinks cold for 24 hours.";
const delivery =
  "Meet the bottle that goes everywhere you do. Double-walled steel keeps water icy for a full day, so your drink is still cold " +
  "at the end of a long hike or a late shift. The leak-proof lid clicks shut, the powder coat won't slip, and it fits every cup " +
  "holder. Refill it, skip the plastic, and carry less.";
let hash = process.env.APPEAL_TX as Hex | undefined;
let quote: { canAppeal: boolean; charge?: bigint } = { canAppeal: false };
let appealed = Boolean(hash);
if (!hash) {
  const p = await preview(gl, id, demand, delivery, "", judge);
  hash = p.hash;
  console.log(`preview accepted: ${genvmTxUrl(hash)} (${p.receipt.statusName}); verdict in the appeal window: ${p.case.fulfilled}`);
  quote = await appealQuote(gl, hash);
  console.log(`appeal ${quote.canAppeal ? `possible, charge ${quote.charge === undefined ? "?" : formatEther(quote.charge)} GEN` : "not possible"}`);
  if (quote.canAppeal) {
    await appeal(gl, hash, quote.charge);
    appealed = true;
    console.log("appeal submitted; waiting for finality...");
  }
}
const final = await waitFinal(gl, hash);
const c = await getCase(gl, `preview:${id}`, judge, { final: true });
const tx = await getTx(gl, hash);
const out = {
  network: "bradbury",
  judge,
  tx: genvmTxUrl(hash),
  caseId: `preview:${id}`,
  appealed,
  appealCharge: quote.charge === undefined ? null : `${formatEther(quote.charge)} GEN`,
  rounds: Number(tx.numOfRounds ?? 0),
  finalStatus: final.statusName,
  jury: juryFromTx(final),
  // null: the transaction finalized with no verdict recorded (e.g. the appeal round's leader timed out).
  verdict: c ? { fulfilled: c.fulfilled, reason: c.reason } : null,
  ranAt: new Date().toISOString(),
};
writeFileSync(new URL("../deployments/appeal-bradbury.json", import.meta.url), JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n");
console.log(JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));

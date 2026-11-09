#!/usr/bin/env node
/**
 * bench: Arkhai natural-language escrows judged by a GenLayer validator jury.
 * Keys come only from environment variables; the CLI never prints them.
 */
import { Command, Option } from "commander";
import { formatUnits, parseAbi, parseUnits, type Address, type Hex } from "viem";
import {
  BENCH_JUDGE,
  BENCH_JUDGE_B,
  BENCH_PLAN,
  escrowTxUrl,
  BENCH_USD,
  appeal,
  collect,
  createEscrow,
  deliveryWarnings,
  evmTxUrl,
  fulfill,
  genlayer,
  genvmTxUrl,
  getArbitration,
  getCase,
  getEscrow,
  getTx,
  juryFromTx,
  listCases,
  openCase,
  parseExpiry,
  preview,
  reclaim,
  requestArbitration,
  requireDeployed,
  waitFinal,
  walletFromKey,
  type Network,
} from "@bench/core";
import { readFileSync } from "node:fs";

const ERC20 = parseAbi(["function decimals() view returns (uint8)", "function symbol() view returns (string)"]);

type Out = Record<string, unknown>;
let jsonMode = false;

function print(human: string, data: Out) {
  if (jsonMode) console.log(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  else console.log(human);
}

function key(name: "BENCH_BUYER_KEY" | "BENCH_SELLER_KEY" | "GENLAYER_KEY"): Hex {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Set ${name} in your environment (a testnet key you control). Bench never asks you to paste a key.`);
  }
  return (v.startsWith("0x") ? v : `0x${v}`) as Hex;
}

/** GENLAYER_KEY falls back to the caller's EVM key, since one key works on both sides. */
function genlayerKey(fallback: "BENCH_BUYER_KEY" | "BENCH_SELLER_KEY"): Hex {
  return process.env.GENLAYER_KEY ? key("GENLAYER_KEY") : key(fallback);
}

function uid(v: string): Hex {
  const h = v.startsWith("0x") || v.startsWith("0X") ? v.slice(2) : v;
  if (!/^[0-9a-fA-F]{64}$/.test(h)) throw new Error(`"${v}" is not a 32-byte uid`);
  return `0x${h.toLowerCase()}`;
}

const network = (): Network => (process.env.BENCH_NETWORK === "studionet" ? "studionet" : "bradbury");

async function tokenInfo(token: Address) {
  const w = walletFromKey(key("BENCH_BUYER_KEY"));
  const { createPublicClient, http } = await import("viem");
  const pc = createPublicClient({ chain: w.chain, transport: http() });
  const [decimals, symbol] = await Promise.all([
    pc.readContract({ address: token, abi: ERC20, functionName: "decimals" }),
    pc.readContract({ address: token, abi: ERC20, functionName: "symbol" }).catch(() => "tokens"),
  ]);
  return { decimals, symbol };
}

const program = new Command()
  .name("bench")
  .description("Arkhai natural-language escrows, judged by a GenLayer validator jury (testnet only).")
  .version("0.1.0")
  .option("--json", "machine-readable output (one JSON object per command)")
  .hook("preAction", (cmd) => {
    jsonMode = Boolean(cmd.opts().json);
  });

program
  .command("escrow")
  .description("Buyer: lock tokens against a plain-English demand judged by BenchJudge")
  .requiredOption("--demand <text>", "what the seller must deliver, as checkable requirements")
  .option("--rubric <text>", "how the jury should judge (shown to sellers)", "")
  .option("--amount <n>", "amount in whole tokens", "50")
  .option("--token <address>", "ERC20 token (default: BENCH_USD)")
  .option("--expires <when>", "expiry: 24h, 90m, 2d or a unix time (must outlast delivery + finality + appeals)", "24h")
  .action(async (o) => {
    requireDeployed("BenchJudge", BENCH_JUDGE);
    const token = (o.token ?? requireDeployed("BenchUSD", BENCH_USD)) as Address;
    const { decimals, symbol } = await tokenInfo(token);
    const amount = parseUnits(String(o.amount), decimals);
    const expiration = parseExpiry(o.expires);
    const wallet = walletFromKey(key("BENCH_BUYER_KEY"));
    const { escrowUid, hash } = await createEscrow(wallet, token, amount, { demand: o.demand, rubric: o.rubric }, expiration);
    print(
      `Escrow created: ${formatUnits(amount, decimals)} ${symbol} locked.\n  escrowUid  ${escrowUid}\n  expires    ${new Date(Number(expiration) * 1000).toISOString()}\n  tx         ${escrowTxUrl(hash)}\nShare the escrowUid with the seller.`,
      { escrowUid, hash, amount, token, expiration },
    );
  });

program
  .command("deliver")
  .description("Seller: deliver work against an escrow (Arkhai commit-reveal)")
  .requiredOption("--escrow <uid>")
  .addOption(new Option("--text <delivery>", "the delivery text (may include up to 2 URLs)").conflicts("file"))
  .addOption(new Option("--file <path>", "read the delivery from a file"))
  .action(async (o) => {
    const delivery: string = o.file ? readFileSync(o.file, "utf8") : o.text;
    if (!delivery) throw new Error("Pass --text or --file");
    const wallet = walletFromKey(key("BENCH_SELLER_KEY"));
    const escrow = await getEscrow(wallet, uid(o.escrow));
    if (escrow.revoked) throw new Error("This escrow is already collected or reclaimed.");
    if (escrow.oracle.toLowerCase() !== BENCH_JUDGE.toLowerCase()) {
      console.error(`warning: this escrow names oracle ${escrow.oracle}, not BENCH_JUDGE ${BENCH_JUDGE}`);
    }
    for (const w of deliveryWarnings(delivery)) console.error(`warning: ${w}`);
    const d = await fulfill(wallet, uid(o.escrow), delivery);
    print(
      `Delivered.\n  fulfillmentUid  ${d.fulfillmentUid}\n  commit tx       ${escrowTxUrl(d.commitHash)}\n  reveal tx       ${escrowTxUrl(d.revealHash)}\nNext: bench judge --escrow ${o.escrow} --fulfillment ${d.fulfillmentUid}`,
      { ...d },
    );
  });

program
  .command("judge")
  .description("Open the case on BenchJudge (anyone can run this)")
  .requiredOption("--escrow <uid>")
  .requiredOption("--fulfillment <uid>")
  .option("--no-request", "skip Alkahest's optional requestArbitration event")
  .action(async (o) => {
    if (BENCH_PLAN !== "b") requireDeployed("BenchJudge", BENCH_JUDGE);
    const e = uid(o.escrow);
    const f = uid(o.fulfillment);
    let requested: { hash?: Hex; skipped?: string } = { skipped: "disabled" };
    if (o.request && process.env.BENCH_SELLER_KEY) {
      // Only the fulfillment's recipient may request; failures never block judging.
      requested = await requestArbitration(walletFromKey(key("BENCH_SELLER_KEY")), e, f);
    }
    const planB = BENCH_PLAN === "b";
    const judgeAddr = planB ? requireDeployed("BenchJudgeB", BENCH_JUDGE_B) : BENCH_JUDGE;
    const gl = genlayer({ privateKey: genlayerKey("BENCH_SELLER_KEY"), network: planB ? network() : "bradbury" });
    const { hash, accepted } = await openCase(gl, e, f, judgeAddr);
    const c = await getCase(gl, f, judgeAddr);
    print(
      `Case opened and ACCEPTED (appeal window is open; not final yet).\n  GenLayer tx  ${genvmTxUrl(hash, planB ? network() : "bradbury")}\n  verdict     ${c ? (c.fulfilled ? "FULFILLED" : "NOT FULFILLED") : "pending"}${c?.reason ? ` - ${c.reason}` : ""}\n  requestArbitration  ${requested.hash ? escrowTxUrl(requested.hash) : `skipped (${requested.skipped})`}\n${planB ? "The relayer (or bridge) delivers it to Alkahest after FINALIZED:" : "The verdict reaches Alkahest only after FINALIZED:"} bench status --escrow ${e} --fulfillment ${f} --tx ${hash}`,
      { hash, status: accepted.statusName, case: c, requestArbitration: requested },
    );
  });

program
  .command("status")
  .description("Show the case, the jury and whether the verdict has landed on Alkahest")
  .requiredOption("--escrow <uid>")
  .requiredOption("--fulfillment <uid>")
  .option("--tx <hash>", "the GenLayer tx from `bench judge`, for jury votes and finality")
  .option("--wait", "wait for FINALIZED and for the verdict to land on Alkahest")
  .action(async (o) => {
    const e = uid(o.escrow);
    const f = uid(o.fulfillment);
    const gl = genlayer({ network: "bradbury" });
    let genlayerError: string | undefined;
    const c = await getCase(gl, f).catch((err: unknown) => {
      genlayerError = err instanceof Error ? err.message.split("\n")[0] : String(err);
      return undefined;
    });
    let jury;
    if (o.tx) {
      const tx = o.wait ? await waitFinal(gl, o.tx as Hex) : await getTx(gl, o.tx as Hex);
      jury = juryFromTx(tx);
    }
    const readerKey = process.env.BENCH_SELLER_KEY ?? process.env.BENCH_BUYER_KEY ?? process.env.GENLAYER_KEY;
    if (!readerKey) throw new Error("Set BENCH_SELLER_KEY, BENCH_BUYER_KEY or GENLAYER_KEY to read Alkahest.");
    const reader = walletFromKey((readerKey.startsWith("0x") ? readerKey : `0x${readerKey}`) as Hex);
    const escrow = await getEscrow(reader, e);
    const landed = await getArbitration(reader, e, f);
    const lines = [
      `Escrow ${e}: ${escrow.revoked ? "settled" : "open"}, expires ${new Date(Number(escrow.expirationTime) * 1000).toISOString()}`,
      genlayerError
        ? `Case: couldn't read BenchJudge (${genlayerError})`
        : c
        ? `Case: ${c.status.toUpperCase()} - ${c.fulfilled ? "FULFILLED" : "NOT FULFILLED"}: ${c.reason}\n  rubric: ${c.rubric || "(default: every explicit requirement must be met)"}`
        : "Case: not opened yet (bench judge ...)",
      jury
        ? `Jury: ${jury.status}, round ${jury.round}, ${jury.agree}/${jury.total} validators agreed with the leader`
        : "Jury: pass --tx <hash> to see validator votes",
      landed
        ? `Alkahest: verdict landed (${landed.decision ? "true: seller may collect" : "false: buyer may reclaim after expiry"})`
        : "Alkahest: no verdict yet (it lands after GenLayer FINALIZED)",
    ];
    print(lines.join("\n"), { escrow, case: c, jury, arbitration: landed, genlayerError });
  });

program
  .command("collect")
  .description("Seller: collect the escrow once the verdict is true")
  .requiredOption("--escrow <uid>")
  .requiredOption("--fulfillment <uid>")
  .action(async (o) => {
    const wallet = walletFromKey(key("BENCH_SELLER_KEY"));
    const landed = await getArbitration(wallet, uid(o.escrow), uid(o.fulfillment));
    if (!landed) throw new Error("No verdict on Alkahest yet. Wait for GenLayer FINALIZED (bench status --wait).");
    if (!landed.decision) throw new Error("The jury decided NOT FULFILLED; this escrow can't be collected with this delivery.");
    const hash = await collect(wallet, uid(o.escrow), uid(o.fulfillment));
    print(`Collected.\n  tx ${escrowTxUrl(hash)}`, { hash });
  });

program
  .command("reclaim")
  .description("Buyer: reclaim the escrow after it expires")
  .requiredOption("--escrow <uid>")
  .action(async (o) => {
    const wallet = walletFromKey(key("BENCH_BUYER_KEY"));
    const escrow = await getEscrow(wallet, uid(o.escrow));
    if (escrow.revoked) throw new Error("This escrow is already collected or reclaimed.");
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (escrow.expirationTime > now) {
      throw new Error(`Not expired yet: reclaim opens at ${new Date(Number(escrow.expirationTime) * 1000).toISOString()}.`);
    }
    const hash = await reclaim(wallet, uid(o.escrow));
    print(`Reclaimed.\n  tx ${escrowTxUrl(hash)}`, { hash });
  });

program
  .command("preview")
  .description("Run the jury on a demand and delivery with no money and no EVM (default: Studionet)")
  .requiredOption("--demand <text>")
  .requiredOption("--delivery <text>")
  .option("--rubric <text>", "", "")
  .option("--id <caseId>", "preview id (stored as preview:<id>)")
  .action(async (o) => {
    const previewJudge = BENCH_PLAN === "b" ? requireDeployed("BenchJudgeB", BENCH_JUDGE_B) : requireDeployed("BenchJudge", BENCH_JUDGE);
    for (const w of deliveryWarnings(o.delivery)) console.error(`warning: ${w}`);
    const net = network();
    const gl = genlayer({ privateKey: key("GENLAYER_KEY"), network: net });
    const id: string = o.id ?? `cli-${Date.now().toString(36)}`;
    const { hash, caseKey } = await preview(gl, id, o.demand, o.delivery, o.rubric, previewJudge);
    const c = await getCase(gl, caseKey, previewJudge);
    print(
      `Preview ${caseKey}: ${c?.fulfilled ? "FULFILLED" : "NOT FULFILLED"} - ${c?.reason}\n  tx ${genvmTxUrl(hash, net)}`,
      { hash, caseKey, case: c },
    );
  });

program
  .command("appeal")
  .description("Appeal a verdict before finality (a larger jury re-judges)")
  .requiredOption("--tx <hash>")
  .action(async (o) => {
    const gl = genlayer({ privateKey: key("GENLAYER_KEY"), network: "bradbury" });
    const res = await appeal(gl, o.tx as Hex);
    print(`Appeal submitted for ${o.tx}.`, { result: res });
  });

program
  .command("cases")
  .description("List recent cases on BenchJudge")
  .option("--start <n>", "", "0")
  .option("--limit <n>", "", "20")
  .action(async (o) => {
    const gl = genlayer({ network: network() });
    const ids = await listCases(gl, Number(o.start), Number(o.limit));
    print(ids.join("\n") || "(no cases)", { cases: ids });
  });

program.parseAsync().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
  if (jsonMode) console.log(JSON.stringify({ error: msg }));
  else console.error(`error: ${msg}`);
  process.exit(1);
});

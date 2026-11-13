#!/usr/bin/env node
/**
 * bench: Arkhai natural-language escrows judged by a GenLayer validator jury.
 * Keys come only from environment variables; the CLI never prints them.
 */
import { Command, CommanderError, Option } from "commander";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { formatEther, formatUnits, isAddress, parseAbi, toHex, type Address, type Hex } from "viem";
import {
  BENCH_JUDGE,
  BENCH_JUDGE_B,
  BENCH_PLAN,
  BENCH_USD,
  appeal,
  appealQuote,
  collect,
  createEscrow,
  defaultConfig,
  deliveryWarnings,
  escrowTxUrl,
  fulfill,
  genlayer,
  genvmTxUrl,
  getArbitration,
  getCase,
  getCaseSettled,
  getEscrow,
  getTx,
  juryFromTx,
  listCases,
  openCase,
  parseAmount,
  parseBenchTerms,
  parseExpiry,
  preview,
  reclaim,
  requestArbitration,
  requireDeployed,
  resendVerdict,
  waitFinal,
  waitForVerdict,
  walletFromKey,
  decodeNlaDemand,
  type Network,
  type SavedCommit,
} from "@bench/core";

const ERC20 = parseAbi(["function decimals() view returns (uint8)", "function symbol() view returns (string)"]);

type Out = Record<string, unknown>;
// Decided before parsing, so commander's own errors (a missing option, an unknown command) come out as JSON too.
const jsonMode = process.argv.includes("--json");

function print(human: string, data: Out) {
  if (jsonMode) console.log(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  else console.log(human);
}

/** Progress for humans (stderr), never mixed into --json output. */
function note(msg: string) {
  if (!jsonMode) console.error(msg);
}

function key(name: "BENCH_BUYER_KEY" | "BENCH_SELLER_KEY" | "GENLAYER_KEY"): Hex {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(`Set ${name} in your environment (a testnet key you control). Bench never asks you to paste a key.`);
  }
  return (v.startsWith("0x") ? v : `0x${v}`) as Hex;
}

/** GENLAYER_KEY falls back to the caller's EVM key, since one key works on both sides. */
function genlayerKey(fallback: "BENCH_BUYER_KEY" | "BENCH_SELLER_KEY"): Hex {
  return process.env.GENLAYER_KEY?.trim() ? key("GENLAYER_KEY") : key(fallback);
}

function uid(v: string, what = "uid"): Hex {
  const h = v.startsWith("0x") || v.startsWith("0X") ? v.slice(2) : v;
  if (!/^[0-9a-fA-F]{64}$/.test(h)) throw new Error(`"${v}" is not a 32-byte ${what}`);
  return `0x${h.toLowerCase()}`;
}

function int(v: string, name: string, min = 0, max = 1000): number {
  if (!/^\d+$/.test(String(v))) throw new Error(`--${name} must be a whole number`);
  const n = Number(v);
  if (n < min || n > max) throw new Error(`--${name} must be ${min}-${max}`);
  return n;
}

/** Plan B (BenchJudgeB) lives on Studionet; Plan A (BenchJudge) on Testnet Bradbury. BENCH_NETWORK overrides. */
const network = (): Network =>
  process.env.BENCH_NETWORK === "studionet" ? "studionet" : process.env.BENCH_NETWORK === "bradbury" ? "bradbury" : BENCH_PLAN === "b" ? "studionet" : "bradbury";

/** The GenLayer contract that judges this plan's cases: --judge, else BENCH_JUDGE_B (Plan B) or BENCH_JUDGE. */
function judgeAddress(): Address {
  const override = program.opts().judge as string | undefined;
  if (override) {
    if (!isAddress(override, { strict: false })) throw new Error(`--judge "${override}" is not an address`);
    return override as Address;
  }
  return BENCH_PLAN === "b" ? requireDeployed("BenchJudgeB", BENCH_JUDGE_B) : requireDeployed("BenchJudge", BENCH_JUDGE);
}

function readerWallet() {
  const k = process.env.BENCH_SELLER_KEY?.trim() || process.env.BENCH_BUYER_KEY?.trim() || process.env.GENLAYER_KEY?.trim();
  if (!k) throw new Error("Set BENCH_SELLER_KEY, BENCH_BUYER_KEY or GENLAYER_KEY to read Alkahest.");
  return walletFromKey((k.startsWith("0x") ? k : `0x${k}`) as Hex);
}

async function tokenInfo(token: Address) {
  const { createPublicClient, http } = await import("viem");
  const pc = createPublicClient({ chain: readerWallet().chain, transport: http() });
  const [decimals, symbol] = await Promise.all([
    pc.readContract({ address: token, abi: ERC20, functionName: "decimals" }),
    pc.readContract({ address: token, abi: ERC20, functionName: "symbol" }).catch(() => "tokens"),
  ]);
  return { decimals: Number(decimals), symbol };
}

/** Unfinished deliveries (salt included) live here until revealed, so an interrupted delivery can resume. */
const pendingDir = () => join(process.env.BENCH_HOME ?? join(homedir(), ".bench"), "pending");
const pendingFile = (escrow: Hex, claimer: Address) => join(pendingDir(), `${escrow}-${claimer.toLowerCase()}.json`);

const program = new Command()
  .name("bench")
  .description("Arkhai natural-language escrows, judged by a GenLayer validator jury (testnet only).")
  .version("0.2.0")
  .option("--json", "machine-readable output (one JSON object per command, errors included)")
  .option("--judge <address>", "the judge contract (default: BENCH_JUDGE, or BENCH_JUDGE_B with BENCH_PLAN=b)")
  .exitOverride()
  .configureOutput({ writeErr: (s) => (jsonMode ? undefined : process.stderr.write(s)) });

program
  .command("escrow")
  .description("Buyer: lock tokens against a plain-English demand judged by BenchJudge")
  .requiredOption("--demand <text>", "what the seller must deliver, as checkable requirements")
  .option("--rubric <text>", "how the jury should judge (shown to sellers)", "")
  .option("--amount <n>", "amount in whole tokens", "50")
  .option("--token <address>", "ERC20 token (default: BENCH_USD)")
  .option("--expires <when>", "expiry: 24h, 90m, 2d or a unix time; at least 30m (delivery + finality + appeals)", "24h")
  .option("--seller <address>", "only this address's deliveries are judged (recommended for hired work)")
  .option("--tries <n>", "how many deliveries the jury will judge for this escrow (1-10, default 3)")
  .action(async (o) => {
    if (BENCH_PLAN !== "b") requireDeployed("BenchJudge", BENCH_JUDGE);
    const token = (o.token ?? requireDeployed("BenchUSD", BENCH_USD)) as Address;
    if (!isAddress(token, { strict: false })) throw new Error(`--token "${token}" is not an address`);
    const { decimals, symbol } = await tokenInfo(token);
    const amount = parseAmount(String(o.amount), decimals);
    const expiration = parseExpiry(o.expires);
    const tries = o.tries === undefined ? undefined : int(o.tries, "tries", 1, 10);
    if (o.seller && !isAddress(o.seller, { strict: false })) throw new Error(`--seller "${o.seller}" is not an address`);
    if (!o.seller) {
      note("note: open escrow (no --seller): anyone may deliver, and someone who copies a revealed delivery could race the seller to a verdict. Use --seller for hired work.");
    }
    const wallet = walletFromKey(key("BENCH_BUYER_KEY"));
    const { escrowUid, hash } = await createEscrow(wallet, token, amount, { demand: o.demand, rubric: o.rubric, seller: o.seller, tries }, expiration);
    print(
      `Escrow created: ${formatUnits(amount, decimals)} ${symbol} locked.\n  escrowUid  ${escrowUid}\n  seller     ${o.seller ?? "anyone (open)"}\n  tries      ${tries ?? 3}\n  expires    ${new Date(Number(expiration) * 1000).toISOString()}\n  tx         ${escrowTxUrl(hash)}\nShare the escrowUid, the demand and the rubric with the seller.`,
      { escrowUid, hash, amount, token, expiration, seller: o.seller ?? null, tries: tries ?? 3 },
    );
  });

program
  .command("deliver")
  .description("Seller: deliver work against an escrow (Arkhai commit-reveal; resumes an interrupted delivery)")
  .requiredOption("--escrow <uid>")
  .addOption(new Option("--text <delivery>", "the delivery text (may include up to 2 URLs)").conflicts("file"))
  .addOption(new Option("--file <path>", "read the delivery from a file"))
  .option("--discard", "throw away an unfinished delivery for this escrow and start over")
  .action(async (o) => {
    const e = uid(o.escrow, "escrow uid");
    const wallet = walletFromKey(key("BENCH_SELLER_KEY"));
    const me = wallet.account.address;
    const file = pendingFile(e, me);
    let saved: SavedCommit | undefined = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
    if (saved && o.discard) {
      rmSync(file);
      saved = undefined;
    }
    const delivery: string | undefined = o.file ? readFileSync(o.file, "utf8") : o.text;
    if (saved && delivery !== undefined && toHex(delivery) !== saved.payload) {
      throw new Error(`An unfinished delivery with different text exists for this escrow (${file}). Run without --text/--file to finish it, or pass --discard.`);
    }
    if (!saved && !delivery) throw new Error("Pass --text or --file");
    const text = delivery ?? Buffer.from(saved!.payload.slice(2), "hex").toString("utf8");

    const escrow = await getEscrow(wallet, e);
    if (escrow.revoked) throw new Error("This escrow is already collected or reclaimed.");
    if (escrow.expirationTime !== 0n && escrow.expirationTime * 1000n < BigInt(Date.now()) + 15n * 60_000n) {
      throw new Error("This escrow expires in under 15 minutes: too late to deliver and get a verdict before it does.");
    }
    const expected = BENCH_PLAN === "b" ? undefined : BENCH_JUDGE;
    if (expected && escrow.oracle.toLowerCase() !== expected.toLowerCase()) {
      throw new Error(`This escrow names oracle ${escrow.oracle}, not BenchJudge ${expected}: no Bench jury will judge it.`);
    }
    const terms = parseBenchTerms(decodeNlaDemand(escrow.demandData).arbitrationModel);
    if (terms.seller && terms.seller.toLowerCase() !== me.toLowerCase()) {
      throw new Error(`This escrow only accepts deliveries from ${terms.seller}.`);
    }
    for (const w of deliveryWarnings(text)) note(`warning: ${w}`);
    if (saved) note(`Resuming the unfinished delivery saved in ${file}.`);
    const d = await fulfill(wallet, e, text, defaultConfig(), {
      saved,
      onSaved: (s) => {
        mkdirSync(pendingDir(), { recursive: true, mode: 0o700 });
        writeFileSync(file, JSON.stringify(s, null, 2), { mode: 0o600 });
      },
    });
    rmSync(file, { force: true });
    print(
      `Delivered.\n  fulfillmentUid  ${d.fulfillmentUid}\n  commit tx       ${escrowTxUrl(d.commitHash)}\n  reveal tx       ${escrowTxUrl(d.revealHash)}\nNext: bench judge --escrow ${e} --fulfillment ${d.fulfillmentUid}`,
      { ...d },
    );
  });

program
  .command("judge")
  .description("Open the case on BenchJudge (anyone can run this; a fee deposit of ~0.1 GEN, mostly refunded)")
  .requiredOption("--escrow <uid>")
  .requiredOption("--fulfillment <uid>")
  .option("--no-request", "skip Alkahest's optional requestArbitration event")
  .action(async (o) => {
    const e = uid(o.escrow, "escrow uid");
    const f = uid(o.fulfillment, "fulfillment uid");
    const judge = judgeAddress();
    let requested: { hash?: Hex; skipped?: string } = { skipped: "disabled" };
    if (o.request && process.env.BENCH_SELLER_KEY?.trim()) {
      // Only the fulfillment's recipient may request; failures never block judging. It waits for its receipt,
      // so a GenLayer tx from the same key can't race it for the nonce.
      requested = await requestArbitration(walletFromKey(key("BENCH_SELLER_KEY")), e, f);
    }
    const net = network();
    const gl = genlayer({ privateKey: genlayerKey("BENCH_SELLER_KEY"), network: net });
    const { hash, accepted } = await openCase(gl, e, f, {
      judge,
      arbiter: defaultConfig().addresses.trustedOracleArbiter,
      onSubmitted: (h) => note(`Case submitted: ${genvmTxUrl(h, net)} (waiting for the jury...)`),
    });
    const c = await getCaseSettled(gl, f, judge, 30_000);
    print(
      `Case ACCEPTED: the jury has a verdict, but the appeal window is open, so it isn't final yet.\n  GenLayer tx  ${genvmTxUrl(hash, net)}\n  verdict     ${c ? (c.fulfilled ? "FULFILLED" : "NOT FULFILLED") : "pending"}${c?.reason ? ` (leader's reason: ${c.reason})` : ""}\n  requestArbitration  ${requested.hash ? escrowTxUrl(requested.hash) : `skipped (${requested.skipped})`}\n${BENCH_PLAN === "b" ? "The relayer (or bridge) delivers it to Alkahest after FINALIZED:" : "The verdict reaches Alkahest only after FINALIZED:"} bench status --escrow ${e} --fulfillment ${f} --tx ${hash} --wait`,
      { hash, status: accepted.statusName, case: c, requestArbitration: requested },
    );
  });

program
  .command("status")
  .description("Show the case, the jury and whether the verdict has landed on Alkahest")
  .requiredOption("--escrow <uid>")
  .requiredOption("--fulfillment <uid>")
  .option("--tx <hash>", "the GenLayer tx from `bench judge`, for jury votes and finality")
  .option("--wait", "wait for GenLayer FINALIZED (needs --tx) and then for the verdict to land on Alkahest")
  .option("--timeout <minutes>", "how long --wait waits for the verdict on Alkahest", "30")
  .action(async (o) => {
    const e = uid(o.escrow, "escrow uid");
    const f = uid(o.fulfillment, "fulfillment uid");
    const tx = o.tx ? uid(o.tx, "transaction hash") : undefined;
    const judge = judgeAddress();
    const net = network();
    const gl = genlayer({ network: net });
    let jury;
    if (tx) {
      if (o.wait) note("Waiting for GenLayer FINALIZED...");
      jury = juryFromTx(o.wait ? await waitFinal(gl, tx) : await getTx(gl, tx));
    }
    let genlayerError: string | undefined;
    const readCase = (final: boolean) =>
      getCase(gl, f, judge, { final }).catch((err: unknown) => {
        genlayerError = err instanceof Error ? err.message.split("\n")[0] : String(err);
        return undefined;
      });
    const [latest, final] = await Promise.all([readCase(false), readCase(true)]);
    const reader = readerWallet();
    const escrow = await getEscrow(reader, e);
    let landed = await getArbitration(reader, e, f, defaultConfig(), escrow);
    const finalNoVerdict = Boolean(o.wait && tx && jury?.status === "FINALIZED" && !final && !genlayerError);
    if (!landed && o.wait && (latest || tx) && !finalNoVerdict) {
      note("Waiting for the verdict to land on Alkahest...");
      landed = await waitForVerdict(reader, e, f, int(o.timeout, "timeout", 1, 24 * 60) * 60_000);
    }
    const c = final ?? latest;
    const finality = final ? "FINAL" : latest ? "ACCEPTED, in the appeal window (not final yet)" : "";
    const lines = [
      `Escrow ${e}: ${escrow.revoked ? "settled" : "open"}, expires ${new Date(Number(escrow.expirationTime) * 1000).toISOString()}`,
      genlayerError && !c
        ? `Case: couldn't read the judge (${genlayerError})`
        : c
          ? `Case: ${finality} - ${c.fulfilled ? "FULFILLED" : "NOT FULFILLED"} (leader's reason: ${c.reason})\n  rubric: ${c.rubric || "(default: every explicit requirement must be met)"}`
          : finalNoVerdict
            ? `Case: the transaction FINALIZED without a verdict (e.g. an appeal round timed out), so nothing was recorded. Open it again: bench judge --escrow ${e} --fulfillment ${f}`
            : "Case: not opened yet (bench judge ...)",
      jury ? `Jury: ${jury.status}, round ${jury.round}, ${jury.agree}/${jury.total} validators agreed with the leader` : "Jury: pass --tx <hash> to see validator votes",
      landed
        ? `Alkahest: verdict landed (${landed.decision ? "true: seller may collect" : "false: buyer may reclaim after expiry"}), tx ${escrowTxUrl(landed.txHash)}`
        : "Alkahest: no verdict yet (it lands after GenLayer FINALIZED)",
    ];
    print(lines.join("\n"), { escrow, case: c, final: Boolean(final), jury, arbitration: landed, genlayerError });
  });

program
  .command("collect")
  .description("Seller: collect the escrow once the verdict is true (before it expires)")
  .requiredOption("--escrow <uid>")
  .requiredOption("--fulfillment <uid>")
  .action(async (o) => {
    const e = uid(o.escrow, "escrow uid");
    const f = uid(o.fulfillment, "fulfillment uid");
    const wallet = walletFromKey(key("BENCH_SELLER_KEY"));
    const escrow = await getEscrow(wallet, e);
    if (escrow.revoked) throw new Error("This escrow is already collected or reclaimed.");
    if (escrow.expirationTime !== 0n && escrow.expirationTime * 1000n <= BigInt(Date.now())) {
      throw new Error("This escrow has expired: Alkahest no longer lets it be collected (the buyer can reclaim).");
    }
    const landed = await getArbitration(wallet, e, f, defaultConfig(), escrow);
    if (!landed) throw new Error("No verdict on Alkahest yet. Wait for GenLayer FINALIZED (bench status --tx <hash> --wait).");
    if (!landed.decision) throw new Error("The jury decided NOT FULFILLED; this escrow can't be collected with this delivery.");
    const hash = await collect(wallet, e, f);
    print(`Collected.\n  tx ${escrowTxUrl(hash)}`, { hash });
  });

program
  .command("reclaim")
  .description("Buyer: reclaim the escrow after it expires")
  .requiredOption("--escrow <uid>")
  .action(async (o) => {
    const e = uid(o.escrow, "escrow uid");
    const wallet = walletFromKey(key("BENCH_BUYER_KEY"));
    const escrow = await getEscrow(wallet, e);
    if (escrow.revoked) throw new Error("This escrow is already collected or reclaimed.");
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (escrow.expirationTime > now) {
      throw new Error(`Not expired yet: reclaim opens at ${new Date(Number(escrow.expirationTime) * 1000).toISOString()}.`);
    }
    const hash = await reclaim(wallet, e);
    print(`Reclaimed.\n  tx ${escrowTxUrl(hash)}`, { hash });
  });

program
  .command("preview")
  .description("Run the jury on a demand and delivery with no money and no EVM (BENCH_NETWORK=studionet for the free sandbox)")
  .requiredOption("--demand <text>")
  .requiredOption("--delivery <text>")
  .option("--rubric <text>", "", "")
  .option("--id <caseId>", "preview id (stored as preview:<id>)")
  .action(async (o) => {
    const judge = judgeAddress();
    for (const w of deliveryWarnings(o.delivery)) note(`warning: ${w}`);
    const net = network();
    const gl = genlayer({ privateKey: key("GENLAYER_KEY"), network: net });
    const id: string = o.id ?? `cli-${Date.now().toString(36)}`;
    const { hash, caseKey, case: c } = await preview(gl, id, o.demand, o.delivery, o.rubric, judge);
    print(`Preview ${caseKey}: ${c.fulfilled ? "FULFILLED" : "NOT FULFILLED"} (leader's reason: ${c.reason})\n  tx ${genvmTxUrl(hash, net)}`, { hash, caseKey, case: c });
  });

program
  .command("appeal")
  .description("Appeal a verdict before finality: a larger jury re-judges. Shows the bond; pass --yes to pay it")
  .requiredOption("--tx <hash>")
  .option("--yes", "pay the quoted bond and submit the appeal")
  .action(async (o) => {
    const tx = uid(o.tx, "transaction hash");
    const gl = genlayer({ privateKey: key("GENLAYER_KEY"), network: network() });
    const quote = await appealQuote(gl, tx);
    if (!quote.canAppeal) throw new Error("This transaction can't be appealed now (already final, or not in its appeal window).");
    const cost = quote.charge === undefined ? "unknown" : `${formatEther(quote.charge)} GEN`;
    if (!o.yes) {
      print(`Appealing ${tx} costs ${cost} (bond plus appeal funding; returned if the appeal succeeds). Re-run with --yes to pay it.\n` +
        `Warning (Testnet Bradbury, Nov 2026): an appealed BenchJudge transaction re-judged as ACCEPTED could not be finalized ` +
        `(finalizeTransaction reverts), which held every later transaction to that contract in ACCEPTED. Appeal only if you accept that risk.`, {
        canAppeal: true,
        charge: quote.charge,
      });
      return;
    }
    await appeal(gl, tx, quote.charge);
    print(`Appeal submitted for ${tx} (paid ${cost}). Follow it with: bench status ... --tx ${tx} --wait`, { appealed: tx, charge: quote.charge });
  });

program
  .command("resend")
  .description("Re-send a recorded verdict to Alkahest (if it never landed). Same decision; anyone can run it")
  .requiredOption("--fulfillment <uid>")
  .action(async (o) => {
    const f = uid(o.fulfillment, "fulfillment uid");
    const net = network();
    const gl = genlayer({ privateKey: genlayerKey("BENCH_SELLER_KEY"), network: net });
    const { hash } = await resendVerdict(gl, f, {
      judge: judgeAddress(),
      arbiter: defaultConfig().addresses.trustedOracleArbiter,
      onSubmitted: (h) => note(`Submitted: ${genvmTxUrl(h, net)}`),
    });
    print(`Verdict re-sent; it reaches Alkahest after GenLayer FINALIZED.\n  GenLayer tx ${genvmTxUrl(hash, net)}`, { hash });
  });

program
  .command("cases")
  .description("List recent cases on BenchJudge")
  .option("--start <n>", "", "0")
  .option("--limit <n>", "1-100", "20")
  .action(async (o) => {
    const gl = genlayer({ network: network() });
    const ids = await listCases(gl, int(o.start, "start", 0, 1_000_000), int(o.limit, "limit", 1, 100), judgeAddress());
    print(ids.join("\n") || "(no cases)", { cases: ids });
  });

program.parseAsync().catch((e: unknown) => {
  if (e instanceof CommanderError) {
    // --help and --version exit 0; usage errors exit 1 (commander has already printed them for humans).
    if (jsonMode && e.exitCode !== 0) console.log(JSON.stringify({ error: e.message.replace(/^error: /, "") }));
    process.exit(e.exitCode);
  }
  const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
  if (jsonMode) console.log(JSON.stringify({ error: msg }));
  else console.error(`error: ${msg}`);
  process.exit(1);
});

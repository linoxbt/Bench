/**
 * Browser end to end for the wallet flow, on a local chain (no testnet funds needed):
 *   connect (EIP-6963) → faucet mint → lock escrow → deliver (commit-reveal) → verdict → collect → reconnect → disconnect.
 *
 * - A Hardhat node (chain id 4221) runs Alkahest's real bytecode and BenchUSD.
 * - The site is built with NEXT_PUBLIC_CHAIN_RPC / NEXT_PUBLIC_ALKAHEST_ADDRESSES pointing at it.
 * - An injected "Bench Test Wallet" announces itself over EIP-6963 and forwards JSON-RPC to the node, whose
 *   unlocked dev account signs. BenchJudge can't run locally, so its verdict is impersonated (see tests/local/fixture.ts).
 * Run: pnpm test:web   (screenshots land in tests/web/screenshots/)
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseUnits } from "viem";
import { setup as startNode, teardown as stopNode } from "../local/global-setup.js";
import { execSync } from "node:child_process";
import { BENCH_JUDGE, benchJudgeArbitrates, deployLocal, testClient } from "../local/fixture.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright") as typeof import("playwright");
const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "../../packages/web");
const shots = join(here, "screenshots");
mkdirSync(shots, { recursive: true });
const PORT = 3124;
const DEV_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // Hardhat dev account #0 (unlocked on the local node)
const DEMAND = { demand: "A haiku about rain (three lines, 5-7-5).", rubric: "Fulfilled only if it is a haiku about rain." };

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv, cwd: string): Promise<void> {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "inherit", "inherit"] });
    p.on("exit", (c) => (c === 0 ? res() : rej(new Error(`${cmd} ${args.join(" ")} exited ${c}`))));
  });
}

async function main() {
  // Always a fresh chain: contract addresses are then deterministic, so a cached build (SKIP_BUILD=1) stays valid.
  try {
    execSync(`pkill -f "hardhat.config.cjs --port 8546"`);
    await new Promise((r) => setTimeout(r, 1000));
  } catch {
    /* no stale node */
  }
  await startNode();
  const { cfg, token } = await deployLocal();
  await testClient.setBalance({ address: DEV_ACCOUNT, value: parseUnits("100", 18) });

  const env = {
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_CHAIN_RPC: "http://127.0.0.1:8546",
    NEXT_PUBLIC_CHAIN_NAME: "Local GenLayer Chain",
    NEXT_PUBLIC_CHAIN_EXPLORER: "http://127.0.0.1:8546",
    NEXT_PUBLIC_ALKAHEST_ADDRESSES: JSON.stringify(cfg.addresses),
    NEXT_PUBLIC_BENCH_JUDGE: BENCH_JUDGE,
    NEXT_PUBLIC_BENCH_USD: token,
    GENLAYER_CHAIN_RPC: "http://127.0.0.1:8546",
  };
  if (!process.env.SKIP_BUILD) {
    console.log("building the site against the local chain…");
    await run("npx", ["next", "build"], env, web);
  }
  const server: ChildProcess = spawn("npx", ["next", "start", "-p", String(PORT)], { cwd: web, env: { ...process.env, ...env }, stdio: "ignore", detached: true });
  for (let i = 0; i < 60; i++) {
    if (await fetch(`http://127.0.0.1:${PORT}/`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  const browser = await chromium.launch();
  // RECORD_DIR=<dir> records the run as video (1280×720) with short pauses, e.g. as footage for the demo video.
  const record = process.env.RECORD_DIR;
  const context = await browser.newContext(
    record
      ? { viewport: { width: 1280, height: 720 }, recordVideo: { dir: record, size: { width: 1280, height: 720 } } }
      : { viewport: { width: 1360, height: 900 } },
  );
  if (record) await context.addInitScript(() => localStorage.setItem("bench-announcement-v1", "1"));
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // The injected test wallet: EIP-6963 announcement + an EIP-1193 provider that forwards to the local node.
  // Plain JS string: a TS function would carry the transpiler's helpers into the page.
  await page.addInitScript(`(() => {
    const account = ${JSON.stringify(DEV_ACCOUNT)};
    const rpc = "http://127.0.0.1:8546";
    const listeners = {};
    let connected = localStorage.getItem("test-wallet-connected") === "1";
    const provider = {
      async request({ method, params }) {
        if (method === "eth_requestAccounts") { connected = true; localStorage.setItem("test-wallet-connected", "1"); return [account]; }
        if (method === "eth_accounts") return connected ? [account] : [];
        if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
        if (method === "wallet_revokePermissions") { connected = false; localStorage.removeItem("test-wallet-connected"); return null; }
        const r = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params || [] }) });
        const j = await r.json();
        if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code });
        return j.result;
      },
      on(e, f) { (listeners[e] = listeners[e] || []).push(f); },
      removeListener(e, f) { listeners[e] = (listeners[e] || []).filter((g) => g !== f); },
    };
    const icon = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#111"/><circle cx="16" cy="16" r="7" fill="#66c800"/></svg>');
    const detail = Object.freeze({ info: { uuid: "bench-test-wallet", name: "Bench Test Wallet", icon, rdns: "dev.bench.testwallet" }, provider });
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
  })();`);

  const base = `http://127.0.0.1:${PORT}`;
  const step = async (name: string) => {
    if (record) await page.waitForTimeout(1800);
    await page.screenshot({ path: join(shots, `${name}.png`) });
    console.log(`  ✓ ${name}`);
  };
  try {
    // 1. Connect
    await page.goto(base + "/", { waitUntil: "networkidle" });
    await page.click('header button:has-text("Connect wallet")');
    await page.waitForSelector('[aria-label="Connect a wallet"] >> text=Bench Test Wallet');
    await step("01-wallet-picker");
    await page.click('[aria-label="Connect a wallet"] button:has-text("Bench Test Wallet")');
    await page.waitForSelector('header button[aria-label="Account"] >> text=0xf39F');
    await step("02-connected");

    // 2. Account menu + faucet
    await page.click('header button[aria-label="Account"]');
    await page.waitForSelector('[role="dialog"][aria-label="Account"] >> text=Local GenLayer Chain');
    await page.click('button:has-text("Get 100 test bUSD")');
    await page.waitForSelector("text=Minted 100 bUSD", { timeout: 60000 });
    await step("03-account-menu-minted");
    await page.keyboard.press("Escape");

    // 3. Lock an escrow
    await page.goto(base + "/new", { waitUntil: "networkidle" });
    await page.fill("textarea >> nth=0", DEMAND.demand);
    await page.fill("textarea >> nth=1", DEMAND.rubric);
    await page.fill('input >> nth=0', "25");
    await page.click('button:has-text("Approve & lock escrow")');
    await page.waitForSelector("text=Escrow locked", { timeout: 90000 });
    const escrowUid = (await page.getAttribute('p:has-text("escrowUid") span[title]', "title"))!;
    await step("04-escrow-locked");

    // 4. Deliver as the seller (same dev account)
    await page.goto(`${base}/deliver?escrow=${escrowUid}`, { waitUntil: "networkidle" });
    await page.waitForSelector(`text=${DEMAND.demand}`, { timeout: 30000 });
    await page.fill("textarea", "Rain taps the tin roof / puddles gather silver light / the gutter hums on");
    await step("05-deliver-terms");
    await page.click('button:has-text("Deliver")');
    await page.waitForSelector("text=Your delivery is on chain.", { timeout: 120000 });
    const fulfillmentUid = (await page.getAttribute('p:has-text("fulfillmentUid") span[title]', "title"))!;
    await step("06-delivered");

    // 5. The verdict (BenchJudge impersonated on the local chain), then collect in the browser
    await benchJudgeArbitrates(cfg, fulfillmentUid as `0x${string}`, DEMAND, true);
    await page.goto(`${base}/case/${escrowUid}/${fulfillmentUid}`, { waitUntil: "networkidle" });
    await page.waitForSelector("text=ArbitrationMade: true");
    await page.click('button:has-text("Collect (seller)")');
    await page.waitForSelector("text=Settled:", { timeout: 60000 });
    await page.waitForSelector("text=settled (collected or reclaimed)", { timeout: 20000 }); // page refreshed from chain
    await page.evaluate(() => window.scrollTo(0, 0));
    await step("07-collected");

    // 6. Silent reconnect after reload, then disconnect
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector('header button[aria-label="Account"] >> text=0xf39F', { timeout: 10000 });
    await page.click('header button[aria-label="Account"]');
    await page.click('button:has-text("Disconnect")');
    await page.waitForSelector('header button:has-text("Connect wallet")');
    await step("08-disconnected");

    if (errors.length) throw new Error(`page errors: ${errors.join(" | ")}`);
    console.log("wallet e2e passed");
  } catch (e) {
    await page.screenshot({ path: join(shots, "failure.png"), fullPage: true });
    console.error("page text at failure:\n" + (await page.innerText("main").catch(() => "")).slice(0, 1500));
    throw e;
  } finally {
    await context.close(); // flushes the video when recording
    await browser.close();
    if (server.pid) process.kill(-server.pid, "SIGTERM");
    await stopNode();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

/**
 * Live browser run against the deployed site on GenLayer Testnet Bradbury: every step is real.
 *   connect (EIP-6963) → mint bUSD → lock escrow → deliver (commit-reveal) → open the case (fee deposit,
 *   real validators) → wait for finality and the verdict on Alkahest → collect → disconnect.
 *
 * The injected "Bench Test Wallet" signs in Node with a funded testnet key (viem), so no browser extension is
 * needed; everything else (reads, fee estimates, the jury) goes to Bradbury exactly as for a real user.
 * One key plays buyer and seller (anyone can deliver against an open escrow).
 *
 * Env: LIVE_KEY (a Bradbury key with ~1 GEN; defaults to GENLAYER_KEY), SITE (default https://bench-ivory.vercel.app).
 * Run: npx tsx tests/web/live-bradbury.ts   (screenshots land in tests/web/screenshots/live-*.png)
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { genlayerChain } from "../../packages/core/src/chains.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright") as typeof import("playwright");
const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, "screenshots");
mkdirSync(shots, { recursive: true });

const SITE = process.env.SITE ?? "https://bench-ivory.vercel.app";
const RPC = "https://rpc-bradbury.genlayer.com";
const key = (process.env.LIVE_KEY ?? process.env.GENLAYER_KEY) as Hex | undefined;
if (!key) throw new Error("Set LIVE_KEY (or GENLAYER_KEY) to a funded Bradbury testnet key");
const account = privateKeyToAccount(key);
const chain = { ...genlayerChain, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account, chain, transport: http(RPC) });

const DEMAND = { demand: "A haiku about rain (three lines, 5-7-5).", rubric: "Fulfilled only if it is a haiku about rain." };
const DELIVERY = "Rain taps the tin roof\nPuddles gather silver light\nThe gutter hums on";
const t0 = Date.now();
const log = (s: string) => console.log(`  [${Math.round((Date.now() - t0) / 1000)}s] ${s}`);

/** JSON-RPC for the injected wallet: sign transactions here, forward everything else to Bradbury. */
async function rpc(method: string, paramsJson: string): Promise<string> {
  const params = JSON.parse(paramsJson) as unknown[];
  try {
    if (method === "eth_sendTransaction") {
      const tx = params[0] as { to?: Hex; data?: Hex; value?: Hex; gas?: Hex };
      const hash = await wallet.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: tx.value ? BigInt(tx.value) : 0n,
        gas: tx.gas ? BigInt(tx.gas) : undefined,
      });
      log(`signed tx ${hash}`);
      return JSON.stringify({ result: hash });
    }
    return JSON.stringify({ result: await pub.request({ method: method as never, params: params as never }) });
  } catch (e) {
    const err = e as { message?: string; code?: number; details?: string; data?: unknown; cause?: { data?: unknown; code?: number } };
    const data = err.data ?? err.cause?.data; // revert data, as a real wallet passes it on
    return JSON.stringify({ error: { message: err.details ?? err.message ?? String(e), code: err.cause?.code ?? err.code ?? -32603, data } });
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.exposeFunction("__benchRpc", rpc);
await page.addInitScript(`(() => {
  const account = ${JSON.stringify(account.address)};
  const listeners = {};
  let connected = localStorage.getItem("test-wallet-connected") === "1";
  const provider = {
    async request({ method, params }) {
      if (method === "eth_requestAccounts") { connected = true; localStorage.setItem("test-wallet-connected", "1"); return [account]; }
      if (method === "eth_accounts") return connected ? [account] : [];
      if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
      if (method === "wallet_revokePermissions") { connected = false; localStorage.removeItem("test-wallet-connected"); return null; }
      const j = JSON.parse(await window.__benchRpc(method, JSON.stringify(params || [])));
      if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code, data: j.error.data });
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

const step = async (name: string) => {
  await page.screenshot({ path: join(shots, `live-${name}.png`) });
  log(`✓ ${name}`);
};
const short = account.address.slice(0, 6);

try {
  console.log(`Live run on ${SITE} as ${account.address}`);
  // 1. Connect
  await page.goto(SITE + "/", { waitUntil: "networkidle" });
  await page.click('header button:has-text("Connect wallet")');
  await page.click('[aria-label="Connect a wallet"] button:has-text("Bench Test Wallet")');
  await page.waitForSelector(`header button[aria-label="Account"] >> text=${short}`);
  await step("01-connected");

  // 2. Mint test bUSD from the account menu
  await page.click('header button[aria-label="Account"]');
  await page.waitForSelector('[role="dialog"][aria-label="Account"] >> text=GenLayer Bradbury');
  await page.waitForSelector('[role="dialog"][aria-label="Account"] >> text=bUSD', { timeout: 30_000 }); // token info loaded
  await page.click('button:has-text("Get 100 test bUSD")');
  await page.waitForSelector("text=/Minted 100 /", { timeout: 120_000 });
  await step("02-minted");
  await page.keyboard.press("Escape");

  // 3. Lock an escrow (default 24 h expiry)
  await page.goto(SITE + "/new", { waitUntil: "networkidle" });
  await page.fill("textarea >> nth=0", DEMAND.demand);
  await page.fill("textarea >> nth=1", DEMAND.rubric);
  await page.fill("input >> nth=0", "5");
  await page.fill('input[placeholder="0x… (the seller\'s wallet)"]', account.address); // hired work: name the seller
  await page.click('button:has-text("Approve & lock escrow")');
  await page.waitForSelector("text=Escrow locked", { timeout: 180_000 });
  const escrowUid = (await page.getAttribute('p:has-text("escrowUid") span[title]', "title"))!;
  await step("03-escrow-locked");
  log(`escrow ${escrowUid}`);

  // 4. Deliver (commit, wait for a newer block, reveal)
  await page.goto(`${SITE}/deliver?escrow=${escrowUid}`, { waitUntil: "networkidle" });
  await page.waitForSelector(`text=${DEMAND.demand}`, { timeout: 60_000 });
  await page.fill("textarea", DELIVERY);
  await page.click('button:has-text("Deliver")');
  await page.waitForSelector("text=Your delivery is on chain.", { timeout: 240_000 });
  const fulfillmentUid = (await page.getAttribute('p:has-text("fulfillmentUid") span[title]', "title"))!;
  await step("04-delivered");
  log(`fulfillment ${fulfillmentUid}`);

  // 5. Open the case: fee deposit + real validators
  // The case page refreshes itself every 15 s and each render reads GenVM (~6 s), so don't wait for network idle.
  await page.goto(`${SITE}/case/${escrowUid}/${fulfillmentUid}`, { waitUntil: "load", timeout: 90_000 });
  // Wait for the silent wallet reconnect: before it, the button reads "Connect wallet to open the case".
  await page.waitForSelector(`header button[aria-label="Account"] >> text=${short}`, { timeout: 30_000 });
  await page.getByRole("button", { name: "Open the case", exact: true }).click({ timeout: 60_000 });
  await page.waitForURL(/\?tx=0x/, { timeout: 600_000 });
  const tx = new URL(page.url()).searchParams.get("tx");
  log(`case opened, GenLayer tx ${tx}`);
  await step("05-jury");

  // 6. Wait for finality: the verdict lands on Alkahest from BenchJudge itself
  for (let i = 0; ; i++) {
    await page.reload({ waitUntil: "load", timeout: 90_000 });
    if (await page.locator("text=ArbitrationMade: true").count()) break;
    if (await page.locator("text=ArbitrationMade: false").count()) throw new Error("The jury said NOT fulfilled");
    if (i > 60) throw new Error("No verdict on Alkahest 20 minutes after opening the case");
    await page.waitForTimeout(20_000);
  }
  await step("06-verdict-landed");

  // 7. Collect as the seller
  await page.click('button:has-text("Collect (seller)")');
  await page.waitForSelector("text=Settled:", { timeout: 180_000 });
  await page.reload({ waitUntil: "load", timeout: 90_000 });
  await page.waitForSelector("text=settled (collected or reclaimed)", { timeout: 60_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await step("07-collected");

  // 8. Disconnect
  await page.click('header button[aria-label="Account"]');
  await page.click('button:has-text("Disconnect")');
  await page.waitForSelector('header button:has-text("Connect wallet")');
  await step("08-disconnected");

  if (errors.length) console.log(`page errors:\n  ${errors.join("\n  ")}`);
  console.log(`live Bradbury run passed in ${Math.round((Date.now() - t0) / 60000)} min\n  ${SITE}/case/${escrowUid}/${fulfillmentUid}?tx=${tx}`);
} catch (e) {
  await page.screenshot({ path: join(shots, "live-failure.png"), fullPage: true });
  if (errors.length) console.log(`page errors:\n  ${errors.join("\n  ")}`);
  throw e;
} finally {
  await browser.close();
}

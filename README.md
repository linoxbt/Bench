# Bench

[![ci](https://github.com/linoxbt/Bench/actions/workflows/ci.yml/badge.svg?branch=ccr-76225ed0-dg5csa)](https://github.com/linoxbt/Bench/actions/workflows/ci.yml)

**Arkhai's natural-language escrows, judged by a jury of independent GenLayer validators instead of a single AI oracle.**

Internet Court · GenLayer · Arkhai — _logos and the 45-second video go here once recorded._

A buyer locks tokens in an [Alkahest](https://github.com/arkhai-io/alkahest) escrow against a demand written in plain English.
A seller delivers. **BenchJudge**, a GenLayer Intelligent Contract, reads the escrow and the delivery straight from
GenLayer Chain, has its validators judge it, and, once the verdict is final, calls Alkahest's `TrustedOracleArbiter.arbitrate`
itself. The seller collects or the buyer reclaims on that verdict alone: no relayer, no bridge, no trusted key.

## Quickstart

```bash
git clone https://github.com/linoxbt/Bench bench && cd bench
pnpm install && pnpm build                     # core, CLI, viewer
cp .env.example .env                            # fill in testnet keys + BENCH_JUDGE / BENCH_USD
set -a; . ./.env; set +a
BENCH_NETWORK=studionet pnpm bench --judge 0x364B283843F500250A3FdbB22B5646C61F2d845a preview --demand "A haiku about rain" --delivery "Rain taps the tin roof / ..."
pnpm bench escrow --demand "Landing copy under 60 words that mentions the free tier" --amount 50 --expires 24h --seller 0x<seller>
```

Then follow the [agent skill](skill/bench/SKILL.md): `deliver` → `judge` → `status --wait` → `collect` / `reclaim`.

## Status (Nov 13, 2026)

**Live on Testnet Bradbury:** **https://bench-ivory.vercel.app** reads BenchJudge on Bradbury. Connect any browser wallet
(EIP-6963 discovery: MetaMask, Coinbase Wallet, Rabby, …, or WalletConnect's QR via Reown), add/switch to GenLayer Bradbury, mint
test bUSD, then lock, deliver (commit-reveal), open the case on BenchJudge, and collect or reclaim, all signed in your wallet.
`/preview` runs real validators for free on the Studionet sandbox.

| Piece | State |
| --- | --- |
| Alkahest on GenLayer Chain (4221) | Deployed by us ([deployments/alkahest-bradbury.json](deployments/alkahest-bradbury.json)); the published addresses had no code |
| Day 1 gate (EVM read + write from GenVM) | **Passed.** `ArbitrationMade` landed with `oracle ==` the probe contract `0x0a97B54f…c74B`, finalized in ~2 min |
| BenchJudge on **Bradbury** (GenVM v0.3) | `0xa1Df17D40dE10a8CF4a6Cb7Ce3962C3304d775dE` ([deployments/bradbury.json](deployments/bradbury.json)): per-escrow limits, named sellers, `check_case`, `resend` |
| BenchUSD on GenLayer Chain | `0xbf977ee6d7299d32ae96d2d29e784b7455e898b9` |
| Live site, browser (`pnpm test:web:live`) | **Pass** on bench-ivory.vercel.app: connect → mint → lock → deliver → open the case (fee deposit) → verdict lands → collect, in 3 min |
| Bradbury end-to-end (`BENCH_E2E=1 pnpm e2e`) | **3/3 pass**: clear pass (verdict lands, seller collects), clear fail (collect reverts, buyer reclaims after expiry), prompt injection (rejected). Every verdict on chain matches the one on Alkahest |
| Preview sandbox on **Studionet** (GenVM v0.2) | `0x364B283843F500250A3FdbB22B5646C61F2d845a` ([contracts/studionet/bench_judge_preview.py](contracts/studionet/bench_judge_preview.py), same jury code) |
| BenchJudgeB (Plan B) on **Studionet** | `0x764911B11Bf6b8C0C41bb7503fA0e9c2025e65B3`, reading Base Sepolia, dedicated relayer key ([deployments/plan-b-studionet.json](deployments/plan-b-studionet.json)) |
| Integration tests, real validators (Studionet) | **5/5 pass**: clear pass, clear fail, URL delivery (validators render the page), prompt injection, preview-id reuse |
| `contracts/*.py` | All four lint- and SDK-validation clean; **38** v0.3 direct-mode tests (BenchJudge, gate probe, the validators' vote rule) + **12** v0.2 (Plan B, preview sandbox) |
| `packages/*` | **14** unit + **18** local-chain tests on **Alkahest's real bytecode** (incl. resumed deliveries, the relayer parking a stuck case); Playwright wallet flow in Chromium |
| `contracts/evm` | BenchUSD + BenchBridgeReceiver (LayerZero `lzReceive`, authenticated origin); **5** Foundry tests |
| Base Sepolia: funded Plan B run | Not run: Plan B is the fallback and the Day 1 gate passed, so Plan A is the shipped path |

## Deploy (Plan A, all on GenLayer Testnet Bradbury)

1. **Keys and gas.** Three testnet EVM keys (buyer, seller, deployer). Claim GEN for each at
   [testnet-faucet.genlayer.foundation](https://testnet-faucet.genlayer.foundation) (100 GEN / 24 h, manual Cloudflare check).
2. **Day 1 gate, part 1:** `pnpm gate`. It checks chain 4221 and that Alkahest has code there.
   The published addresses had no code, so we ran `DEPLOYER_KEY=... pnpm deploy:alkahest` (deploys EAS, the arbiters and the obligations from
   alkahest-ts's bundled bytecode and regenerates `packages/core/src/alkahest-bradbury.ts`). Then `pnpm build && pnpm gate`.
3. **Day 1 gate, part 2:** `GENLAYER_KEY=... pnpm gate:probe`. It deploys `contracts/probe/gate_probe.py`, makes one EVM read and
   one `arbitrate` write from GenVM, waits for finality and checks that `ArbitrationMade` landed with `oracle ==` the probe's own address.
   If it fails, Plan A is blocked: use Plan B (below) and say so in the README and video.
4. **BenchJudge:** `GENLAYER_KEY=... pnpm deploy:judge` → `export BENCH_JUDGE=0x...` (also written to `deployments/bradbury.json`).
   Every Bradbury transaction carries a fee deposit (about 0.1 GEN, nearly all refunded); `feesFor()` in `@bench/core` builds it,
   including the budget for the `arbitrate` call BenchJudge emits on finality. The free `/preview` sandbox:
   `BENCH_NETWORK=studionet pnpm deploy:judge` deploys `contracts/studionet/bench_judge_preview.py` (see *GenVM versions*).
5. **Demo token:** `DEPLOYER_KEY=... BUYER_ADDRESS=0x... pnpm deploy:token` → `export BENCH_USD=0x...`.
6. **Viewer on Vercel:** root directory `packages/web`, install command `pnpm install` (monorepo root), env
   `NEXT_PUBLIC_BENCH_JUDGE`, `NEXT_PUBLIC_BENCH_JUDGE_STUDIONET`, `NEXT_PUBLIC_BENCH_USD`, and optionally
   `NEXT_PUBLIC_REOWN_PROJECT_ID` (adds a WalletConnect QR option; the ID is public, so restrict it to your domains in the Reown dashboard). Put the official partner logos in
   `packages/web/public/logos/` (see the README there).

**Expiry rule.** Escrows must outlast delivery + GenLayer finality + any appeals: 24 h is the default and 30 minutes the minimum
(the CLI and the site refuse less; BenchJudge refuses a case when the escrow has under 10 minutes left). Finality on Bradbury took
about 2 minutes in our runs. Reclaim opens only after expiry, so for the recorded fail case use a short expiry (30 min) and say so on
screen. An expiry of 0 disables reclaim and is refused.

**Escrow terms.** Name the seller for hired work (`--seller`, or the Seller field on `/new`): only their deliveries are judged, so
nobody can copy their revealed delivery and race them to the payment. An *open bounty* (no seller) is still possible, with that
risk stated on screen. `--tries` (1-10, default 3) caps how many deliveries the jury judges per escrow; after a true verdict the escrow
takes no more cases. Both ride in Arkhai's NLA `arbitrationModel` field, so the encoding is unchanged.

## Plan B (Base Sepolia escrows)

Use it if the Day 1 probe fails. Escrows stay on Base Sepolia, where Alkahest and Arkhai's `nla` CLI already work.

```bash
export BENCH_PLAN=b                                    # core + CLI target Base Sepolia's Alkahest and BenchJudgeB on Studionet
RELAYER_KEY=0x... pnpm deploy:judge-b                  # BenchJudgeB; escrows name the relayer address as oracle (a dedicated key)
export BENCH_JUDGE=<relayer address> BENCH_JUDGE_B=<BenchJudgeB address>
bench escrow ... && bench deliver ... && bench judge ...   # same commands; judge calls BenchJudgeB
RELAYER_KEY=0x... BENCH_JUDGE_B=0x... pnpm relayer         # B1: relays finalized verdicts, once each
```

- **B1, relayer** (`packages/relayer`): reads only finalized BenchJudgeB state and calls `arbitrate` once per delivery,
  never again after a restart; a case that fails is retried without blocking the rest. The relayer key is **custodial**: it can
  approve or flip any escrow that names it. Use a dedicated key and say so in the video.
- **B2, bridge receiver** (`contracts/evm/BenchBridgeReceiver.sol`): LayerZero V2 `lzReceive`, callable only by the endpoint,
  with the source taken from the authenticated `Origin` (never the payload). Deploy it with the endpoint, the GenLayer side's
  endpoint id and BenchJudgeB's bridge sender, and name it as the oracle (`BENCH_ORACLE=<receiver> pnpm deploy:judge-b`).
  Sending the verdict from BenchJudgeB through GenLayer's bridge boilerplate is not wired yet.
- BenchJudgeB's validators check the leader's block is recent and finalized; list several RPCs (`SOURCE_RPC=a,b`) and every read
  must match on all of them, so one lying RPC can't feed the jury.

## Trust model (Plan A)

- **Funds** sit in Alkahest's ERC20 escrow contract. Only the oracle named in the demand (BenchJudge) can release them; a stranger's
  `arbitrate` is ignored (tested).
- **Judgment** is GenLayer validator consensus: every validator re-runs the judgment with its own model and must agree with the
  leader on fulfilled / not fulfilled. Anyone can appeal before finality.
- **Verdict delivery** is BenchJudge's own external message, executed only after finality, with `msg.sender` = BenchJudge.
- **Not trusted:** the seller, any single model, any relayer or bridge, the person who opens the case, and (with a named seller)
  anyone else who delivers.
- **Trusted, and worth saying out loud:**
  - The **buyer writes the rubric**, and it can be strict or unfair. Sellers should read the demand and rubric before delivering
    (the viewer and `bench status` show both).
  - **Redelivery is capped**: at most `tries` judged deliveries per escrow (default 3), none after a true verdict, and the same
    content is never judged twice for one escrow. So a seller can't grind the jury until one run says yes.
  - **Open bounties** (no named seller) let anyone deliver; someone who copies a revealed delivery could reach a verdict first.
    The site and CLI say so, and default to naming the seller.
  - The verdict's **reason** is the leader's wording; validators vote only on fulfilled / not fulfilled.
  - `arbitrate` **overwrites** an earlier decision for the same delivery (tested), so BenchJudge must never send two. It doesn't:
    cases are keyed by the normalized fulfillment uid and previews live under a separate `preview:` key.
  - **Collect only works between finality and the escrow's expiry**; after expiry the buyer can reclaim.

## Repo layout

```
contracts/bench_judge.py        BenchJudge Intelligent Contract (GenVM v0.3, Testnet Bradbury)
contracts/bench_judge_b.py      Plan B judge (GenVM v0.2, Studionet): reads Base Sepolia over JSON-RPC, stores verdicts for relay
contracts/probe/gate_probe.py   Day 1 gate probe (GenVM v0.3: EVM read + write from GenVM; owner-only)
contracts/studionet/            the free preview sandbox (GenVM v0.2), sharing BenchJudge's jury code
contracts/evm/                  BenchUSD demo token, BenchBridgeReceiver (B2); solc-js build, Foundry tests
packages/core/                  chains, Alkahest addresses, NLA demand codec, escrow + BenchJudge clients
                                (index: Node/CLI via alkahest-ts; ./browser: viem-only wallet calls)
packages/cli/                   `bench` CLI (commander, --json for agents)
packages/web/                   Next.js site + app: every page is its own route under app/(site); /demo has no site chrome
packages/relayer/               Plan B1 relayer service
skill/bench/SKILL.md            installable agent skill
scripts/                        day1-gate.sh, day1-gate-probe.ts, deploy-alkahest.ts, deploy-judge.ts, deploy-judge-b.ts,
                                fund-keys.ts (split the deployer's GEN), genvm_lint.py (genvm-lint for v0.3 contracts)
deployments/                    deployed addresses per network
tests/direct/                   genlayer-test direct mode, GenVM v0.3: BenchJudge (mocked web + LLM + EVM)
tests/direct_b/                 same for Plan B's BenchJudgeB, GenVM v0.2 (own virtualenv: requirements-plan-b.txt)
tests/local/                    Alkahest bytecode on a Hardhat node (chain id 4221): core, browser calls, CLI
tests/integration/              real consensus on Studionet/Bradbury (manual)
tests/e2e/                      full Bradbury runs incl. payout and reclaim (manual, BENCH_E2E=1)
tests/web/                      Playwright wallet flow with an injected EIP-6963 test wallet on a local chain
fixtures/cases/                 demo demands and deliveries (pass, fail, URL, prompt injection)
```

## Tests

```bash
pip install -r requirements.txt          # GenVM v0.3 toolchain (BenchJudge, gate probe)
pnpm lint:contract                       # genvm-lint against the Bradbury runner (GENVM_VERSION=v0.6.0-rc13)
pnpm test:contract                       # 38 direct-mode tests, ~2 s after the first SDK download (~300 MB)
# Studionet contracts (GenVM v0.2: Plan B's BenchJudgeB, the preview sandbox) in their own virtualenv:
python -m venv .venv-b && .venv-b/bin/pip install -r requirements-plan-b.txt
.venv-b/bin/genvm-lint check contracts/bench_judge_b.py && .venv-b/bin/pytest tests/direct_b -p gltest   # 12 tests
pnpm test                                # 14 unit tests: demand codec (cross-checked against eth_abi), terms, amounts, expiry
pnpm test:local                          # 18 tests on Alkahest bytecode: lifecycle, resumed delivery, CLI, relayer, bridge receiver
(cd contracts/evm && forge test)         # BenchBridgeReceiver (5)
.venv-b/bin/pytest tests/integration -p gltest --network studionet   # real validators (5); accounts come from .env
BENCH_E2E=1 pnpm e2e                     # manual: full Bradbury runs incl. payout and a reclaim after a 30-minute expiry
pnpm test:web                            # browser: connect wallet → mint → lock → deliver → verdict → collect, on a local chain
pnpm test:web:live                       # the same in Chromium against the deployed site on Bradbury: real jury, real payout (~3 min, ~0.1 GEN)
```

CI runs both lint + direct-test toolchains, typechecks, the unit and local-chain tests, Foundry, and the browser wallet flow on every push.

## GenVM versions

Testnet Bradbury runs **GenVM v0.3**; Studionet still runs **v0.2**. They differ in the contract header, the SDK API and the
calldata, so:

| | Bradbury (v0.3) | Studionet (v0.2) |
| --- | --- | --- |
| Contracts | `bench_judge.py`, `probe/gate_probe.py` | `bench_judge_b.py`, `studionet/bench_judge_preview.py` (the `/preview` sandbox) |
| Header | `# v0.3.0` then `# { "Depends": "py-genlayer:babwp9t3…" }` | `# { "Depends": "py-genlayer:1jb45aa8…" }` |
| SDK | `import genlayer as gl`, `gl.contract.Contract`, `gl.vm.run_nondet` | `from genlayer import *`, `gl.Contract`, `gl.vm.run_nondet_unsafe` |
| genlayer-js | 2.0.0-rc.3 (fee deposits) | 1.1.8, installed as `genlayer-js-v02` |
| Python tests | `requirements.txt`, `tests/direct` | `requirements-plan-b.txt`, `tests/direct_b` |

`genlayer()` in `@bench/core` picks the right SDK per network, so callers don't change. The jury, parsing and escaping code is one
block shared verbatim by all three judges (a test fails if they drift).

## Findings that shaped the code

- **GenVM can briefly miss a fresh reveal.** Right after a delivery, `check_case` sometimes still saw the old EVM state ("fulfillment
  does not reference this escrow"): Bradbury's RPC is load-balanced and a node can trail the head. The CLI and the site retry
  those particular refusals for up to 90 s before paying for `judge()`.
- **Two explorers.** EVM transactions (locks, reveals, `ArbitrationMade`) are on `explorer.testnet-chain.genlayer.com`; GenVM
  transactions (BenchJudge) are on `explorer-bradbury.genlayer.com`, which shows nothing for an EVM hash.
- **The appeal window is short.** On Bradbury it closed about 60 s after ACCEPTED (from the consensus contract's lifecycle view,
  which the jury panel reads for its countdown). Appeal right away or not at all.

- **Bradbury moved to GenVM v0.3 and fee deposits.** v0.2 contracts deploy but always finish with an error; genlayer-js 1.x
  transactions go to the old consensus contract and are never picked up; 2.x without fees reverts (`FeeValueMustBeNonZero`).
  The fix was porting to the v0.3 SDK, genlayer-js 2.x and `feesFor()`.
- **Keep the v0.3 header to exactly two comment lines.** A third comment line right under `Depends` made every deploy finish
  with `FINISHED_WITH_ERROR` (all validators agreeing, no message). Found by bisecting deploys; documentation goes in the docstring.
- **Two Bradbury RPCs, not interchangeable for GenVM.** `rpc.testnet-chain.genlayer.com` (genlayer-js's default) serves the EVM
  methods only; `gen_call` reads need `rpc-bradbury.genlayer.com`. Both are chain 4221.
- **Bradbury votes are execution results.** Receipts list each validator's result (`FINISHED_WITH_RETURN`, …), so the jury panel
  counts a validator as agreeing when its result hash matches the leader's.
- **genvm-linter 0.11 can't load v0.3 EVM interfaces**: it loads the SDK in docs mode, where `contract_interface` raises
  `KeyError('return')`. `scripts/genvm_lint.py` runs the same checks with docs mode off.
- **GenVM v0.2.16 EVM views are broken** (Plan B / Studionet). The generated view proxy reads `self.parent.address` but stores
  `_proxy_parent`; BenchJudgeB uses a small `_view()` shim. v0.3 fixed it, so BenchJudge calls `.view()` directly.
- **Commit-reveal needs a newer block, and Bradbury's RPC can lag.** `CommitRevealObligation` rejects a reveal unless
  `block.number` is past the commit's block (`CommitmentTooRecent`). On Bradbury the reveal still failed after the head had moved
  on (the simulation hit a node that was behind), so `fulfill()` and the browser's `deliverLite()` wait for a margin block and
  retry the reveal while it is reported too recent.
- **`requestArbitration` is seller-only.** A stranger's request reverts (`UnauthorizedArbitrationRequest`); `bench judge` sends it
  from the seller key when present and never lets it block judging.
- **alkahest-ts can't go in a browser bundle** (it pulls in `@viem/anvil` and ~15 MB of artifacts), so the viewer uses
  `@bench/core/browser`, which makes the same calls with plain viem and is tested against the real bytecode.
- **Validators must agree on identical errors.** Found live on Studionet: when the leader's read failed, validators voted
  "disagree" and the transaction went UNDETERMINED. Both contracts now agree on identical failures so bad cases revert cleanly.
- **Studionet has no EVM interop**: an EVM view from GenVM runs until the 600 s leader timeout. Bradbury has it: the Day 1 probe
  read EAS and wrote `arbitrate` from GenVM, and the write landed with `oracle ==` the contract, finalized in about 2 minutes.
- **Every GenVM read on Bradbury takes ~6 s**, whatever the read options. The site caches decided cases (they can't change),
  and verdict lookups scan Alkahest's events only from the escrow's creation block instead of the whole chain (7 s → under 1 s).
- **Browser wallets drop revert reasons.** The seller's reveal is simulated against the public RPC first (with Alkahest's error
  ABI), so a too-early reveal is recognised and retried instead of surfacing as "doObligation reverted".
- **Receipts carry votes, not model names**, so the jury panel shows validator addresses and votes and never invents model badges.

## License

MIT

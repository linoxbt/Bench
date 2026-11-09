# Bench

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
pnpm bench preview --demand "A haiku about rain" --delivery "Rain taps the tin roof / ..."   # BENCH_NETWORK=studionet
pnpm bench escrow --demand "Landing copy under 60 words that mentions the free tier" --amount 50 --expires 24h
```

Then follow the [agent skill](skill/bench/SKILL.md): `deliver` → `judge` → `status --wait` → `collect` / `reclaim`.

## Status (Nov 9, 2026)

| Piece | State |
| --- | --- |
| `contracts/bench_judge.py` | Lints clean; 22 direct-mode tests pass, including `judge()` against an in-memory Alkahest |
| `packages/core`, `packages/cli` | Typecheck; 8 unit tests and 11 lifecycle tests pass on **Alkahest's real bytecode** (local chain) |
| `packages/web` | Builds; reads are server-side with no keys, writes go through the user's wallet |
| Alkahest on GenLayer Chain (4221) | **Not deployed.** The addresses in Alkahest's `deployment_genlayer_bradbury.json` have no code (`pnpm gate`). Run `pnpm deploy:alkahest` first (see Deploy) |
| BenchJudge on Bradbury / Studionet | Not deployed yet: needs a funded `GENLAYER_KEY` |
| EVM write from GenVM on Bradbury | Unproven until `pnpm gate:probe` passes |

## Deploy (Plan A, all on GenLayer Testnet Bradbury)

1. **Keys and gas.** Three testnet EVM keys (buyer, seller, deployer). Claim GEN for each at
   [testnet-faucet.genlayer.foundation](https://testnet-faucet.genlayer.foundation) (100 GEN / 24 h, manual Cloudflare check).
2. **Day 1 gate, part 1:** `pnpm gate`. It checks chain 4221 and that Alkahest has code there.
   It fails today, so: `DEPLOYER_KEY=... pnpm deploy:alkahest` (deploys EAS, the arbiters and the obligations from
   alkahest-ts's bundled bytecode and regenerates `packages/core/src/alkahest-bradbury.ts`). Then `pnpm build && pnpm gate`.
3. **Day 1 gate, part 2:** `GENLAYER_KEY=... pnpm gate:probe`. It deploys `contracts/probe/gate_probe.py`, makes one EVM read and
   one `arbitrate` write from GenVM, waits for finality and checks that `ArbitrationMade` landed with `oracle ==` the probe's own address.
   If it fails, Plan A is blocked: use Plan B (Base Sepolia + relayer or bridge, see ARCHITECTURE.md) and say so in the README and video.
4. **BenchJudge:** `GENLAYER_KEY=... pnpm deploy:judge` → `export BENCH_JUDGE=0x...` (also written to `deployments/bradbury.json`).
   For the free `/preview` sandbox, also `BENCH_NETWORK=studionet pnpm deploy:judge`.
5. **Demo token:** `DEPLOYER_KEY=... BUYER_ADDRESS=0x... pnpm deploy:token` → `export BENCH_USD=0x...`.
6. **Viewer on Vercel:** root directory `packages/web`, install command `pnpm install` (monorepo root), env
   `NEXT_PUBLIC_BENCH_JUDGE`, `NEXT_PUBLIC_BENCH_JUDGE_STUDIONET`, `NEXT_PUBLIC_BENCH_USD`. Put the official partner logos in
   `packages/web/public/logos/` (see the README there).

**Expiry rule.** Escrows must outlast delivery + GenLayer finality (~30 min) + any appeals: 24 h is the default. Reclaim opens only
after expiry, so for the recorded fail case use a short expiry (finality + 1–2 h) and say so on screen. An expiry of 0 disables reclaim
and is refused by the CLI.

## Trust model (Plan A)

- **Funds** sit in Alkahest's ERC20 escrow contract. Only the oracle named in the demand (BenchJudge) can release them; a stranger's
  `arbitrate` is ignored (tested).
- **Judgment** is GenLayer validator consensus: every validator re-runs the judgment with its own model and must agree with the
  leader on fulfilled / not fulfilled. Anyone can appeal before finality.
- **Verdict delivery** is BenchJudge's own external message, executed only after finality, with `msg.sender` = BenchJudge.
- **Not trusted:** the seller, any single model, any relayer or bridge, and the person who opens the case.
- **Trusted, and worth saying out loud:**
  - The **buyer writes the rubric**, and it can be strict or unfair. Sellers should read the demand and rubric before delivering
    (the viewer and `bench status` show both).
  - **A seller can redeliver** against an open escrow, and each delivery is judged once. Anyone can deliver against an open escrow
    (tested). Bench does not yet bind a specific seller: that needs a field beside Arkhai's NLA tuple.
  - `arbitrate` **overwrites** an earlier decision for the same delivery (tested), so BenchJudge must never send two. It doesn't:
    cases are keyed by the normalized fulfillment uid and previews live under a separate `preview:` key.
  - **Collect only works between finality and the escrow's expiry**; after expiry the buyer can reclaim.

## Repo layout

```
contracts/bench_judge.py        BenchJudge Intelligent Contract (GenVM, runner pinned to v0.2.16)
contracts/probe/gate_probe.py   Day 1 gate probe (EVM read + write from GenVM)
contracts/evm/                  BenchUSD demo token (solc-js build, viem deploy)
packages/core/                  chains, Alkahest addresses, NLA demand codec, escrow + BenchJudge clients
                                (index: Node/CLI via alkahest-ts; ./browser: viem-only wallet calls)
packages/cli/                   `bench` CLI (commander, --json for agents)
packages/web/                   Next.js case viewer: /, /new, /case/[escrow]/[fulfillment], /preview
skill/bench/SKILL.md            installable agent skill
scripts/                        day1-gate.sh, day1-gate-probe.ts, deploy-alkahest.ts, deploy-judge.ts
tests/direct/                   genlayer-test direct mode (mocked web + LLM + EVM)
tests/local/                    Alkahest bytecode on a Hardhat node (chain id 4221): core, browser calls, CLI
tests/integration/              real consensus on Studionet/Bradbury (manual)
tests/e2e/                      full Bradbury runs incl. payout and reclaim (manual, BENCH_E2E=1)
fixtures/cases/                 demo demands and deliveries (pass, fail, URL, prompt injection)
```

## Tests

```bash
pip install -r requirements.txt
pnpm lint:contract                       # genvm-lint: BenchJudge + gate probe
pytest tests/direct -p gltest            # 22 tests, ~1 s after the first SDK download
pnpm -F @bench/core test                 # demand codec (cross-checked against Python eth_abi bytes), limits, expiry
pnpm test:local                          # 11 tests: escrow → delivery → verdict → collect / reclaim on Alkahest bytecode
pytest tests/integration -p gltest --network studionet    # manual: real validators
BENCH_E2E=1 pnpm e2e                     # manual: full Bradbury runs (each waits for finality)
```

CI runs the lint, the direct tests, typechecks, the unit and local-chain tests and the web build on every push.

## Findings that shaped the code

- **GenVM v0.2.16 EVM views are broken.** The generated view proxy reads `self.parent.address` but stores `_proxy_parent`, so every
  `.view()` call on a `@gl.evm.contract_interface` raises `AttributeError`. It's fixed on genvm `main` but not in any release.
  BenchJudge and the gate probe use a small `_view()` shim that adds the alias (a no-op once fixed).
- **Commit-reveal needs a newer block.** `CommitRevealObligation` rejects a reveal in the same block as its commit
  (`CommitmentTooRecent`), and alkahest-ts simulates the reveal against the latest block, so `fulfill()` waits for one.
- **`requestArbitration` is seller-only.** A stranger's request reverts (`UnauthorizedArbitrationRequest`); `bench judge` sends it
  from the seller key when present and never lets it block judging.
- **alkahest-ts can't go in a browser bundle** (it pulls in `@viem/anvil` and ~15 MB of artifacts), so the viewer uses
  `@bench/core/browser`, which makes the same calls with plain viem and is tested against the real bytecode.
- **Receipts carry votes, not model names**, so the jury panel shows validator addresses and votes and never invents model badges.

## License

MIT

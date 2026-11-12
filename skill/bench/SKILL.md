---
name: bench
description: Create and settle Arkhai natural-language escrows judged by a GenLayer validator jury (Internet Court verification layer). Use when an agent buys or sells work against a plain-English demand and needs a neutral judge to release or refund the escrow.
---

# Bench: GenLayer-judged escrows on Arkhai

Bench locks ERC20 funds in an Arkhai Alkahest escrow whose demand is written in plain English.
When the seller delivers, a GenLayer Intelligent Contract (BenchJudge) has a jury of independent
validators decide whether the demand was met. BenchJudge itself writes the verdict to Alkahest's
TrustedOracleArbiter on GenLayer Testnet Bradbury: no relayer, no single model, no single operator.

## Rules

- Testnet only (GenLayer Testnet Bradbury, chain 4221). Never use mainnet funds.
- Never ask for, print, or store a private key or seed phrase. Keys come from env vars the user sets.
- Never claim an escrow, delivery, or verdict exists until you have its tx hash or uid.
- A verdict is final only after GenLayer FINALIZED. Until then report it as "accepted, in appeal window".
- Write demands as checkable requirements (length, must-mention, must-not-contain, format, deadline).
- Before a seller delivers, show them the demand and the rubric (`bench status` prints both once judged;
  the buyer should share the rubric up front). The buyer writes the rubric, so it can be strict.
- Tell sellers the limits: the jury sees the first 6,000 characters of a delivery and renders at most
  2 linked pages, 8,000 characters each. Linked pages must not change until the verdict is final:
  every validator renders them separately.

## Setup

    git clone <repo> bench && cd bench
    pnpm install && pnpm build
    export BENCH_JUDGE=<BenchJudge address from the README>
    export BENCH_USD=<demo token address from the README>
    export BENCH_BUYER_KEY=...   # or BENCH_SELLER_KEY; set by the user, never pasted into chat
    alias bench="node $(pwd)/packages/cli/dist/index.js"

GEN for gas comes from testnet-faucet.genlayer.foundation (100 GEN per address per 24 h). Opening a case
needs a fee deposit of about 0.1 GEN; nearly all of it is refunded.
Add `--json` to any command for machine-readable output.

## Buyer flow

1. `bench escrow --demand "<plain-English requirements>" --rubric "<how to judge>" --amount 50 --expires 24h`
   - The expiry must outlast delivery + GenLayer finality (a few minutes on Bradbury) + any appeals. 24h is a safe default.
2. Share the escrowUid, the demand and the rubric with the seller.
3. If the verdict is NOT FULFILLED: `bench reclaim --escrow <uid>` once the escrow has expired.

## Seller flow

1. `bench deliver --escrow <uid> --text "<work or a link to it>"` (or `--file <path>`). Prints a fulfillmentUid.
2. `bench judge --escrow <uid> --fulfillment <uid>`: opens the case on BenchJudge and prints the GenLayer tx.
3. `bench status --escrow <uid> --fulfillment <uid> --tx <hash> --wait` until FINALIZED and the verdict lands.
4. If FULFILLED: `bench collect --escrow <uid> --fulfillment <uid>`.

## Dispute or retry

- Disagree with a verdict before finality: `bench appeal --tx <hash>` (a larger jury re-judges).
- Try a demand safely first: `BENCH_NETWORK=studionet BENCH_JUDGE=0x991Cf014F556D779c0Da83867B0900d88Fe2C4e7 bench preview --demand "..." --delivery "..."`
  (the public Studionet sandbox: no funds, no escrow), or https://bench-ivory.vercel.app/preview in a browser.
- A seller can deliver again against the same open escrow; each delivery is judged once.

## Trust model (say this when asked)

- Funds: Alkahest's ERC20 escrow contract.
- Judgment: GenLayer validator consensus. Each validator re-runs the judgment and must agree with the
  leader on fulfilled / not fulfilled; anyone can appeal before finality.
- Verdict delivery: BenchJudge's own external message on GenLayer Chain (msg.sender = BenchJudge),
  sent only after finality, at most once per delivery.
- Trusted: the buyer's wording of the demand and rubric (the seller should read both first).
- Not trusted: the seller, any single model, any relayer.

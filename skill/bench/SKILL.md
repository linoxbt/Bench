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

    git clone https://github.com/linoxbt/Bench bench && cd bench
    pnpm install && pnpm build
    export BENCH_JUDGE=0xBb383581447A1F87F9634dEd9f8b9A2BfAD859e6   # BenchJudge on Testnet Bradbury
    export BENCH_USD=0xbf977ee6d7299d32ae96d2d29e784b7455e898b9     # bUSD demo token (free test token, no value)
    export BENCH_BUYER_KEY=...   # or BENCH_SELLER_KEY; set by the user, never pasted into chat
    alias bench="node $(pwd)/packages/cli/dist/index.js"

The current addresses are also in the README and deployments/bradbury.json.

GEN for gas comes from testnet-faucet.genlayer.foundation (100 GEN per address per 24 h). Opening a case
needs a fee deposit of about 0.1 GEN; nearly all of it is refunded.
Add `--json` to any command for machine-readable output.

## Buyer flow

1. `bench escrow --demand "<plain-English requirements>" --rubric "<how to judge>" --amount 50 --expires 24h --seller <address>`
   - Name the seller for hired work: only their deliveries are judged, so nobody can copy their revealed work and race them.
     Leave `--seller` out only for an open bounty (anyone may deliver), and say that risk to the user.
   - `--tries <1-10>` (default 3): how many deliveries the jury will judge for this escrow. No more cases after a true verdict.
   - The expiry must be at least 30m and outlast delivery + GenLayer finality (minutes) + any appeals. 24h is the safe default.
2. Share the escrowUid, the demand, the rubric and the terms with the seller.
3. If the verdict is NOT FULFILLED: `bench reclaim --escrow <uid>` once the escrow has expired.

## Seller flow

1. `bench deliver --escrow <uid> --text "<work or a link to it>"` (or `--file <path>`). Prints a fulfillmentUid.
   If it is interrupted after the commit, run `bench deliver --escrow <uid>` again: it resumes from the saved record.
   Linked pages must be reachable: an unreachable page reverts the case (nothing recorded) until it is up.
2. `bench judge --escrow <uid> --fulfillment <uid>`: checks for free that BenchJudge will hear the case, then opens it
   (fee deposit ~0.1 GEN, mostly refunded) and prints the GenLayer tx as soon as it is sent.
3. `bench status --escrow <uid> --fulfillment <uid> --tx <hash> --wait` waits for FINALIZED, then for the verdict on Alkahest.
4. If FULFILLED: `bench collect --escrow <uid> --fulfillment <uid>` (before the escrow expires).

## Dispute or retry

- Disagree with a verdict before finality: `bench appeal --tx <hash>` shows the bond; `--yes` pays it (a larger jury re-judges).
  The appeal window on Bradbury is short (about a minute after ACCEPTED), so appeal right away.
- A verdict that never reached Alkahest: `bench resend --fulfillment <uid>` re-emits the recorded decision (same verdict).
- Try a demand safely first: `BENCH_NETWORK=studionet bench --judge 0x364B283843F500250A3FdbB22B5646C61F2d845a preview --demand "..." --delivery "..."`
  (the public Studionet sandbox: no funds, no escrow), or https://bench-ivory.vercel.app/preview in a browser.
- A seller can deliver again against the same escrow up to its `tries`; each delivery is judged once, and the same content
  is never judged twice for one escrow.

## Trust model (say this when asked)

- Funds: Alkahest's ERC20 escrow contract.
- Judgment: GenLayer validator consensus. Each validator re-runs the judgment and must agree with the
  leader on fulfilled / not fulfilled; anyone can appeal before finality.
- Verdict delivery: BenchJudge's own external message on GenLayer Chain (msg.sender = BenchJudge),
  sent only after finality, at most once per delivery.
- Trusted: the buyer's wording of the demand and rubric (the seller should read both first).
- The verdict's one-line reason is the leader's wording; validators vote on fulfilled / not fulfilled only.
- Not trusted: the seller, any single model, any relayer.

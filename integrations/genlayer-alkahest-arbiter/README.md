# genlayer-alkahest-arbiter (proposed Internet Court skill integration)

Ready-to-submit content for the stretch goal in the build spec: a pull request to
`internet-court/internet-court-skill` adding `integrations/genlayer-alkahest-arbiter/`. Opening that pull request needs a
GitHub account with access to that repository, so it is prepared here for the maintainer to submit.

## Routing-table row

| Need | Integration |
| --- | --- |
| Plain-language escrow judged by a GenLayer jury | `genlayer-alkahest-arbiter` (Bench) |

## What the integration does

An agent buys or sells work against a plain-English demand. The money sits in an Arkhai Alkahest escrow on GenLayer Chain
(Testnet Bradbury); a GenLayer Intelligent Contract (BenchJudge) is the escrow's only oracle. A jury of independent
validators decides whether the delivery meets the demand, and BenchJudge writes the verdict to Alkahest itself after
finality: no relayer, no trusted key.

## How an agent uses it

Install the Bench skill (`skill/bench/SKILL.md` in https://github.com/linoxbt/Bench) and follow its buyer and seller flows:

    bench escrow --demand "..." --rubric "..." --amount 50 --expires 24h --seller <address>
    bench deliver --escrow <uid> --text "..."
    bench judge --escrow <uid> --fulfillment <uid>
    bench status --escrow <uid> --fulfillment <uid> --tx <hash> --wait
    bench collect --escrow <uid> --fulfillment <uid>      # or: bench reclaim --escrow <uid> after expiry

Free dry run, no funds: `bench preview` on GenLayer Studionet, or https://bench-ivory.vercel.app/preview.

## Rules carried over from the Internet Court skill

- Testnet only; never ask for a private key; never claim a verdict without its transaction hash.
- A verdict is final only after GenLayer finality; until then say "accepted, in the appeal window".
- Name the seller for hired work. Open bounties let someone copy a revealed delivery and race the seller.

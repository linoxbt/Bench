# Architecture

## Boundary

| Owned by | What |
| --- | --- |
| **Alkahest (Arkhai)**, EVM on GenLayer Chain 4221 | The money (ERC20EscrowObligation), the delivery (CommitRevealObligation attestation), the decision record (TrustedOracleArbiter), EAS |
| **BenchJudge (GenLayer)**, GenVM on Testnet Bradbury | Reading escrow + delivery, the jury, the single `arbitrate` message per delivery |
| **Bench tooling** | Encoding demands, sending wallet transactions, showing state. It never decides anything |

Remove BenchJudge and no escrow can settle: the demand names it as the only oracle.

## Plan A call sequence

1. **Buyer creates the escrow** (`bench escrow`, `/new`): `ERC20EscrowObligation.doObligation({arbiter: TrustedOracleArbiter,
   demand: abi.encode(DemandData{oracle: BenchJudge, data: abi.encode(NLA tuple)}), token, amount}, expiration)`.
   The NLA tuple is Arkhai's `(arbitrationProvider, arbitrationModel, arbitrationPrompt, demand)`. `arbitrationPrompt` is the rubric.
2. **Seller delivers** (`bench deliver`): `computeCommitment` → `commit(commitment, 1 wei bond, 3600 s)` → wait for a newer block →
   `doObligation({payload, salt, schema}, escrowUid)`. The bond comes back on reveal.
3. **Anyone opens the case** (`bench judge`): `BenchJudge.judge(escrowUid, fulfillmentUid)` on Bradbury. The seller key also sends
   Alkahest's optional `requestArbitration`, so Arkhai tooling sees the case.
4. **BenchJudge checks** with typed EVM views (deterministic host calls, no extra consensus):
   - The escrow's arbiter is TrustedOracleArbiter and its oracle is BenchJudge itself.
   - The escrow attestation isn't revoked (collect and reclaim revoke it).
   - The fulfillment's `refUID` is this escrow, it isn't revoked, and its attester is CommitRevealObligation.
   - This fulfillment uid (normalized to lowercase `0x` hex) hasn't been judged.
5. **The jury** (`gl.vm.run_nondet_unsafe`): the leader renders up to 2 URLs (8,000 chars each) and asks its model for
   `{fulfilled, reason}`. Party text is escaped and cut with a `[truncated]` marker. Each validator re-runs the whole judgment and
   agrees only if `fulfilled` matches. If both fail to get a usable answer they agree, so the transaction reverts cleanly.
6. **The verdict lands**: `TrustedOracleArbiter(...).emit().arbitrate(fulfillmentUid, nlaDemandData, fulfilled)`. GenLayer sends
   external messages only on finality, so this executes after the appeal window. Alkahest keys the decision on
   `keccak256(fulfillmentUid ++ demand.data)` with `msg.sender` = BenchJudge.
7. **Settlement**: verdict true → the seller calls `collect`. Otherwise the buyer calls `reclaim` after expiry.

## Plan B (if `pnpm gate:probe` fails)

The escrow stays on Base Sepolia, where Alkahest is live (`ALKAHEST_BASE_SEPOLIA`) and Arkhai's `nla` CLI works unchanged.
BenchJudgeB (`contracts/bench_judge_b.py`) reads Base Sepolia with `gl.nondet.web.post` eth_calls. The leader pins them to the
current finalized block, and validators re-read at that block and must match byte for byte. It runs the same checks and jury as
Plan A and stores the verdict plus the inner demand data instead of emitting it. One of these then delivers it:

- **B1, trusted relayer** (`packages/relayer`, built and tested): reads BenchJudgeB with `latest-final` state only and
  calls `arbitrate` from the oracle key, once per delivery. Before every send it checks Alkahest's `ArbitrationMade` log, so a
  restart can't re-send. Simple, but the key is trusted.
- **B2, bridge receiver** (`contracts/evm/BenchBridgeReceiver.sol`, built and tested): the oracle on Base Sepolia. It accepts
  `deliver(message)` only from the bridge endpoint, only for messages from BenchJudgeB, once per fulfillment. Connecting
  GenLayer's LayerZero-based bridge boilerplate to it is still to do.

Whichever ships, the README and the video must state the extra trust.

## Why each safety check exists

| Check | Without it |
| --- | --- |
| Normalized case key | `0xABC…`, `0xabc…` and `abc…` are three cases, so a seller re-rolls the jury and the second `arbitrate` overwrites the first |
| `preview:` key prefix | `preview(<decided uid>)` overwrites the decided case and reopens `judge` |
| Attester == CommitRevealObligation | Any attestation referencing the escrow (e.g. a StringObligation) could be judged |
| Escrow not revoked | Gas wasted judging an escrow that's already collected or reclaimed |
| Tag escaping | `</delivery>` in a delivery writes instructions outside the evidence block |
| Validators agree on shared parse errors | Bad model output on every node rotates until rounds run out (UNDETERMINED) instead of reverting |

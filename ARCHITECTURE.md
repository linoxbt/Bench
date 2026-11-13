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
   Bench's terms ride in `arbitrationModel` (`bench-jury-v1;seller=0x…;tries=3`), so Arkhai's encoding is unchanged:
   `seller` limits judging to that address's deliveries, `tries` caps how many deliveries are judged (default 3, max 10).
2. **Seller delivers** (`bench deliver`, `/deliver`): `computeCommitment` → `commit(commitment, 1 wei bond, 3600 s)` → wait for a
   newer block → `doObligation({payload, salt, schema}, escrowUid)`. The bond comes back on reveal. The commit record (with its
   random salt) is saved before signing (`~/.bench/pending`, or localStorage on the web), so an interrupted delivery resumes.
3. **Anyone opens the case** (`bench judge`, the case page): first the free `check_case` view says whether BenchJudge would hear it
   (retried for up to 90 s while a lagging RPC node hasn't seen the reveal), then `BenchJudge.judge(escrowUid, fulfillmentUid)` with a
   fee deposit that funds the `arbitrate` message. The seller key also sends Alkahest's optional `requestArbitration`.
4. **BenchJudge checks** with typed EVM views (deterministic host calls, no extra consensus):
   - The escrow's arbiter is TrustedOracleArbiter and its oracle is BenchJudge itself.
   - The escrow attestation isn't revoked (collect and reclaim revoke it) and has 10+ minutes left before it expires.
   - The fulfillment's `refUID` is this escrow, it isn't revoked or expired, its attester is CommitRevealObligation, and its
     recipient is the escrow's named seller (if any).
   - The escrow has no true verdict yet and hasn't used its `tries`; this fulfillment uid (normalized) hasn't been judged; and the
     same delivery content hasn't been judged for this escrow before (a copy of revealed work can't be judged again).
5. **The jury** (`gl.vm.run_nondet`): the leader renders up to 2 URLs (8,000 chars each; an unreachable page reverts the case as
   `[TRANSIENT]`, nothing recorded) and asks its model for `{fulfilled, reason}`. All party text, demand and rubric included, is
   escaped and cut with a `[truncated]` marker; only a boolean `fulfilled` is accepted. Each validator re-runs the whole judgment and
   agrees only if `fulfilled` matches (`_agree`, unit-tested). If both fail to get a usable answer they agree, so the transaction
   reverts cleanly. The `reason` is the leader's wording; validators don't vote on it.
6. **The verdict lands**: `TrustedOracleArbiter(...).emit().arbitrate(fulfillmentUid, nlaDemandData, fulfilled)`. GenLayer sends
   external messages only on finality, so this executes after the appeal window. Alkahest keys the decision on
   `keccak256(fulfillmentUid ++ demand.data)` with `msg.sender` = BenchJudge.
7. **Settlement**: verdict true → the seller calls `collect` (before expiry). Otherwise the buyer calls `reclaim` after expiry.
   If a verdict's message never landed, anyone can call `resend(fulfillmentUid)`: it re-emits the stored decision.

## Plan B (if `pnpm gate:probe` fails)

The escrow stays on Base Sepolia, where Alkahest is live (`ALKAHEST_BASE_SEPOLIA`) and Arkhai's `nla` CLI works unchanged.
BenchJudgeB (`contracts/bench_judge_b.py`) reads Base Sepolia with `gl.nondet.web.post` eth_calls. The leader pins them to the
current finalized block; validators check the block is a recent finalized one, re-read at it and must match byte for byte. With
several RPCs configured (comma-separated), every read must match on all of them. It runs the same checks and jury as Plan A and
stores the verdict plus the inner demand data instead of emitting it. It runs GenVM v0.2, so it lives on Studionet. One of these then
delivers it:

- **B1, trusted relayer** (`packages/relayer`, built and tested): reads BenchJudgeB with `latest-final` state only and
  calls `arbitrate` from the oracle key, once per delivery. Before every send it checks Alkahest's `ArbitrationMade` log, so a
  restart can't re-send; a case that fails is retried later without blocking the rest. Simple, but custodial: the relayer key can
  approve or flip any escrow that names it, whatever BenchJudgeB decided. Use a dedicated key, and prefer B2.
- **B2, bridge receiver** (`contracts/evm/BenchBridgeReceiver.sol`, built and tested): the oracle on Base Sepolia. It implements
  LayerZero V2's `lzReceive`: only the endpoint may call it, and the source (endpoint id + sender) comes from the authenticated
  `Origin`, never from the payload; each fulfillment is accepted once. Connecting GenLayer's LayerZero-based bridge boilerplate on the
  GenLayer side (BenchJudgeB sending the message) is still to do.

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
| `tries` cap per escrow, none after a true verdict | A seller re-delivers until one jury run says yes; one yes releases the money |
| Named seller (terms) | Anyone copies the seller's revealed delivery, gets it judged and collects first |
| Payload dedup per escrow | A copy of judged work is judged again, for the copier |
| 10 minutes left before expiry | A true verdict lands after the escrow expired: it can't be collected and the buyer reclaims |
| Unreachable page reverts (TRANSIENT) | A dead or not-yet-live link turns into a permanent "not fulfilled" |
| Strict `fulfilled` boolean, escaped demand/rubric | Synonyms ("pass", "result") or tag breakouts give injected text a way to steer the verdict |
| `check_case` preflight | Fees paid for a case BenchJudge was always going to refuse |
| `resend` | A verdict whose message failed is stuck "already decided" forever |

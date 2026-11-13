# Bug report: an appealed transaction can't be finalized and freezes its contract's finality queue (Testnet Bradbury)

**Network:** GenLayer Testnet Bradbury (chain 4221), GenVM `v0.3.0-rc10`, genlayer-js `2.0.0-rc.3`
**Consensus contracts:** main `0x2E2766cbc3E5e61Ce93bBcdCBb3eAcB82082A019`, data `0xc5FA6f82BEe53598825d6edf7E3e24613082c75B`
**Observed:** 2026-11-13, 17:30–19:00 UTC. The transaction was still stuck at the time of writing.

## Summary

After a successful appeal, the appealed transaction returned to ACCEPTED. The consensus data contract then reported it ready to
finalize (resolution action 6, `Finalize`), but `finalizeTransaction` reverts with `0x0c35bf69` (a selector we could not match to any
error in the ABIs shipped in genlayer-js). `finalizeDecisions` accepts the call but leaves the transaction ACCEPTED. Transactions to
one contract finalize in order, so every later transaction to that contract also stays ACCEPTED (resolution action 0, `NoOp`),
long after its own appeal deadline. The contract's finalized state stops advancing, and external messages emitted on finality are
never sent.

## Impact

- **One appeal halts a contract.** Every later transaction to it stops finalizing, whoever sent it and whatever it does.
- **Anyone can trigger it.** Appeals are permissionless; our bond was 0.05 GEN. A contract with funds that depend on finality can be
  stalled by a stranger for the price of one appeal (if the trigger is reproducible; see *Reproducibility*).
- **Downstream effects are real.** Our contract (BenchJudge) settles escrows on GenLayer Chain by emitting an `arbitrate` call on
  finality. A case opened after the appeal reached ACCEPTED with a clear verdict, but its verdict never reached the escrow. The
  only recovery available to users is a refund after the escrow expires.
- **No way out at the app level.** Redeploying the contract to a fresh address restored finality (2 minutes for a new case), but
  state and pending transactions on the old address stay stuck.

## Transactions

| | Hash | State |
| --- | --- | --- |
| Appealed (stuck) | [`0x6281bf62…9c36`](https://explorer-bradbury.genlayer.com/tx/0x6281bf62d83309231f5326a4ed8b156351cb40466820d0a40bc70c6b5c8d9c36) | ACCEPTED since ~17:31 UTC; 3 rounds |
| Later tx, same contract (blocked) | [`0xbfd35b19…2d56`](https://explorer-bradbury.genlayer.com/tx/0xbfd35b19649c23637b6aadb96ff9726a394861145d9f97d2cf5592c2f82b0d56) | ACCEPTED since ~17:53 UTC, appeal deadline 17:54:52 UTC |
| Our `finalizeTransaction` attempt | EVM tx `0xec359fb2299bf600a0d3103f1e5e314c0a1caa596e2bcd85f5c88a5b6687eede` | reverted |
| Our `finalizeDecisions` attempt | EVM tx `0xad20418c3e06ff1dc8661e4f410f03f0b958ea1a25323797848dd8a88dc5514c` | succeeded, no state change |
| Same code, fresh address (control) | [`0x647bcb69…a9b`](https://explorer-bradbury.genlayer.com/tx/0x647bcb6917faac16bd50149fff9d9657020ebe8c4b82d46723747fca9f1efa9b) | ACCEPTED in 65 s, FINALIZED in 120 s |

Contract with the frozen queue: `0xa1Df17D40dE10a8CF4a6Cb7Ce3962C3304d775dE`. Fresh deployment of the same code:
`0xBb383581447A1F87F9634dEd9f8b9A2BfAD859e6`.

## What happened

1. ~17:30 UTC: we sent a `preview` write to `0xa1Df17D4…`. It is an LLM call under a nondeterministic block, and it writes one
   storage entry and emits no messages. It reached ACCEPTED with `MAJORITY_AGREE`.
2. Inside the appeal window we read the charge (`canAppeal` true, 0.050000000000022617 GEN) and appealed with that value using
   genlayer-js `appealTransaction`.
3. The appeal ran and upheld the result. Execution result `FINISHED_WITH_RETURN`, status back to ACCEPTED. Per-round data from the
   rounds storage contract (`getRoundData(txId, i)`):

   | index | `round` | validators (commits / reveals) | `result` | `appealBond` | `rotationsLeft` | `validatorVotes` |
   | --- | --- | --- | --- | --- | --- | --- |
   | 0 | 0 | 0 / 0 | 0 | 0 | 3 | `[0,0,0,0,0]` |
   | 1 | 0 | 0 / 0 | 0 | 1100 | 0 | `[]` |
   | 2 | 2 | 4 / 4 | 1 | 0 | 0 | `[4,1,1,1]` |
   | 3 | 3 | 13 / 13 | 1 | 2600 | 0 | `[1,1,1,1,1,4,1,1,1,1,1,1,3]` |
4. From then on, `getTransactionLifecycle(txId, now)` reports the transaction as ready to finalize:

   ```
   storedStatus 5 (ACCEPTED)
   resolution:      action 6 (Finalize), source 9, sourceRound 3, resultRound 2, resultGeneration 2,
                    basisDecisionId 2, appealDeadline 1794591115 (17:31:55 UTC)
   latestDecision:  decisionId 3, status 5, sourceStatus 9, sourceRound 3, resultRound 2, resultGeneration 2
   ```

5. `finalizeTransaction(0x6281bf62…, 3)` reverts with `0x0c35bf69` in `eth_estimateGas`, in `eth_call` and when sent. An `eth_call`
   of `finalizeTransactionDeferred` reverts with the same data. `finalizeDecisions([{txId, expectedDecisionId: 3}])` succeeds but changes nothing.
6. A later transaction to the same contract (`0xbfd35b19…`) reached ACCEPTED with 5 reveals and `MAJORITY_AGREE`. Long after its
   appeal deadline it still reports `action 0` (`NoOp`), status ACCEPTED, and `finalizeTransaction` refuses it as not ready.
7. A fresh deployment of the same contract code finalized a new case in 120 s. Bradbury as a whole was finalizing normally.

**Things that may be relevant** (we can't see the revert reason, so these are observations, not a diagnosis):

- The latest decision has `sourceRound` 3 (the appeal round) and `resultRound` 2 (the original round, which the appeal upheld),
  `basisDecisionId` 2 and `decisionId` 3.
- Round index 1 is empty (no validators, `round` field 0) but carries `appealBond` 1100, while the appeal that actually ran is
  index 3 with `appealBond` 2600.

## Expected

After the appeal round agrees and its appeal window closes, the transaction finalizes (as an unappealed transaction does about
2 minutes after ACCEPTED), and later transactions to the contract finalize after it.

## Actual

The transaction stays ACCEPTED indefinitely, reported finalizable but impossible to finalize, and every later transaction to the
contract stays ACCEPTED behind it.

## Reproducibility

We appealed twice; this exact outcome happened once.

- **First appeal** ([`0x82c6158b…7627`](https://explorer-bradbury.genlayer.com/tx/0x82c6158b15aee604f482bd5ee692e436377b74bf5d411d2750031501725b7627),
  same contract, earlier the same afternoon): the appeal round's leader timed out with no rotations left. The transaction went to
  FINALIZED with execution `NOT_VOTED`, and the original round's accepted write was not applied, so the contract recorded nothing.
  That may be intended (a timed-out appeal discards the result), but it surprised us: we expected a failed appeal to leave the
  accepted result standing. Please confirm which behaviour is intended.
- **Second appeal** (`0x6281bf62…`): the stuck case described above. The appeal round agreed with the original result.

**Steps that led to it:**

1. Deploy any v0.3 contract with a write method that makes a nondeterministic (LLM) call and stores the result.
2. Call the method and wait for ACCEPTED.
3. Within the appeal window (~60 s on Bradbury), call `appealTransaction` with the quoted charge.
4. Wait for the appeal round to finish and the tx to return to ACCEPTED, then for its appeal deadline to pass.
5. Poll `getTransactionLifecycle`, and try `finalizeTransaction` once the action is 6.

Our script for steps 2–4: [`scripts/appeal-demo.ts`](../scripts/appeal-demo.ts). Our record of both runs:
[`deployments/appeal-bradbury.json`](../deployments/appeal-bradbury.json). We don't know what separates this run from an appeal that
finalizes normally. We have not seen an appeal finalize normally on Bradbury, so it may not be rare.

## Diagnostics we used

Read the lifecycle and simulate finalization (viem + genlayer-js chain config):

```ts
import { createPublicClient, encodeFunctionData, http } from "viem";
import { testnetBradbury } from "genlayer-js/chains";

const c = testnetBradbury as any;
const pc = createPublicClient({ transport: http("https://rpc-bradbury.genlayer.com") });
const txId = "0x6281bf62d83309231f5326a4ed8b156351cb40466820d0a40bc70c6b5c8d9c36";
const lc: any = await pc.readContract({
  address: c.consensusDataContract.address, abi: c.consensusDataContract.abi,
  functionName: "getTransactionLifecycle", args: [txId, BigInt(Math.floor(Date.now() / 1000))],
});
console.log(lc.resolution.action, lc.latestDecision.decisionId); // 6n, 3n
await pc.call({
  to: c.consensusMainContract.address,
  data: encodeFunctionData({ abi: c.consensusMainContract.abi, functionName: "finalizeTransaction", args: [txId, lc.latestDecision.decisionId] }),
}); // reverts with data 0x0c35bf69
```

## Questions

1. What does `0x0c35bf69` decode to? It isn't in the consensus ABIs that genlayer-js 2.0.0-rc.3 ships. Is the empty round at
   index 1 (with `appealBond` 1100) expected?
2. Is a per-contract queue expected to stop behind one transaction that can't be finalized? Is there a timeout or skip, or an
   operator action, that lets the transactions behind it proceed?
3. Can `0x6281bf62…` be finalized or cancelled on your side so the contract `0xa1Df17D4…` recovers?
4. When an appeal round's leader times out (our first appeal), is discarding the originally accepted result the intended outcome?

## Workarounds on our side

- We moved our app to a fresh deployment (`0xBb383581…`).
- Our CLI warns before taking an appeal bond, and our UI shows when finality is overdue.
- Escrows that never receive a verdict stay refundable to the buyer after expiry.

None of these fix the underlying problem: any contract can still be frozen by an appeal.

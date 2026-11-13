import { MessageType, deriveExternalMessageCallKey, encodeExternalMessageFeeParams, type createClient } from "genlayer-js";
import { toFunctionSelector, type Address, type Hex } from "viem";

type FeeClient = Pick<ReturnType<typeof createClient>, "estimateTransactionFees" | "request">;

/** TrustedOracleArbiter.arbitrate(bytes32,bytes,bool): the one EVM write BenchJudge emits. */
export const ARBITRATE_SELECTOR = toFunctionSelector("arbitrate(bytes32,bytes,bool)");

/** An EVM call an Intelligent Contract emits as an external message; Bradbury needs it pre-funded. */
export type EvmMessage = { to: Address; selector: Hex; gasLimit?: bigint };

/**
 * Gas price cap for external messages: 10x the current price, at least 1 gwei (Bradbury runs at 0.01 gwei), so a
 * spike between judging and finality can't strand the verdict. The unused budget is refunded.
 */
const MIN_GAS_PRICE_CAP = 1_000_000_000n;
async function gasPriceCap(client: FeeClient): Promise<bigint> {
  try {
    const now = BigInt((await client.request({ method: "eth_gasPrice" } as never)) as string);
    return now * 10n > MIN_GAS_PRICE_CAP ? now * 10n : MIN_GAS_PRICE_CAP;
  } catch {
    return MIN_GAS_PRICE_CAP * 10n;
  }
}

/**
 * Fee deposit for a GenLayer transaction. Bradbury requires one (the consensus contract reverts with
 * FeeValueMustBeNonZero otherwise); Studionet does not, so this returns undefined there.
 * Each EVM call the contract emits gets its own budget (gasLimit x price cap). Unspent fees are refunded.
 */
export async function feesFor(gl: { client: FeeClient; network: string }, evm: EvmMessage[] = []) {
  if (gl.network !== "bradbury") return undefined;
  const maxGasPrice = evm.length ? await gasPriceCap(gl.client) : MIN_GAS_PRICE_CAP;
  const messageAllocations = evm.map((m) => {
    const gasLimit = m.gasLimit ?? 300_000n;
    return {
      messageType: MessageType.External,
      recipient: m.to,
      callKey: deriveExternalMessageCallKey(m.selector),
      budget: gasLimit * maxGasPrice,
      feeParams: encodeExternalMessageFeeParams({ gasLimit, maxGasPrice }),
    };
  });
  const est = await gl.client.estimateTransactionFees(messageAllocations.length ? { messageAllocations } : {});
  return { distribution: est.distribution, messageAllocations: est.messageAllocations, feeValue: est.feeValue };
}

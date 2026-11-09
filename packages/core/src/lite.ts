/**
 * Wallet-side Alkahest calls with plain viem, for the browser: alkahest-ts bundles @viem/anvil (Node-only)
 * and ~15 MB of artifacts. ABIs match Alkahest's ERC20EscrowObligation and EAS (checked by tests/local/lite.test.ts).
 */
import { parseAbi, parseEventLogs, type Account, type Address, type Chain, type Hex, type PublicClient, type Transport, type WalletClient } from "viem";
import { encodeBenchDemand, type BenchDemand } from "./demand.js";

export const ESCROW_ABI = parseAbi([
  "function doObligation((address arbiter, bytes demand, address token, uint256 amount) data, uint64 expirationTime) returns (bytes32)",
  "function collect(bytes32 _escrow, bytes32 _fulfillment) returns (bytes)",
  "function reclaim(bytes32 uid) returns (bool)",
]);
export const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
]);
export const EAS_EVENTS = parseAbi(["event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)"]);

export type LiteAddresses = { erc20EscrowObligation: Address; trustedOracleArbiter: Address };
type Wallet = WalletClient<Transport, Chain, Account>;

export async function createEscrowLite(
  wallet: Wallet,
  pub: PublicClient,
  a: LiteAddresses,
  judge: Address,
  token: Address,
  amount: bigint,
  d: BenchDemand,
  expiration: bigint,
): Promise<{ escrowUid: Hex; hash: Hex }> {
  const owner = wallet.account.address;
  const allowance = await pub.readContract({ address: token, abi: ERC20_ABI, functionName: "allowance", args: [owner, a.erc20EscrowObligation] });
  if (allowance < amount) {
    const approve = await wallet.writeContract({ address: token, abi: ERC20_ABI, functionName: "approve", args: [a.erc20EscrowObligation, amount] });
    await pub.waitForTransactionReceipt({ hash: approve });
  }
  const hash = await wallet.writeContract({
    address: a.erc20EscrowObligation,
    abi: ESCROW_ABI,
    functionName: "doObligation",
    args: [{ arbiter: a.trustedOracleArbiter, demand: encodeBenchDemand(judge, d), token, amount }, expiration],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  const [attested] = parseEventLogs({ abi: EAS_EVENTS, logs: receipt.logs, eventName: "Attested" });
  if (!attested) throw new Error(`Escrow tx ${hash} emitted no Attested event`);
  return { escrowUid: attested.args.uid, hash };
}

export async function collectLite(wallet: Wallet, a: LiteAddresses, escrowUid: Hex, fulfillmentUid: Hex): Promise<Hex> {
  return wallet.writeContract({ address: a.erc20EscrowObligation, abi: ESCROW_ABI, functionName: "collect", args: [escrowUid, fulfillmentUid] });
}

export async function reclaimLite(wallet: Wallet, a: LiteAddresses, escrowUid: Hex): Promise<Hex> {
  return wallet.writeContract({ address: a.erc20EscrowObligation, abi: ESCROW_ABI, functionName: "reclaim", args: [escrowUid] });
}

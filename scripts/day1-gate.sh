#!/usr/bin/env bash
# Day 1 gate, part 1: are Alkahest's contracts live on GenLayer Chain (4221)?
# Part 2 (does an Intelligent Contract's EVM write land, and as whom?) is scripts/day1-gate-probe.ts.
set -euo pipefail
RPC="${GENLAYER_CHAIN_RPC:-https://rpc.testnet-chain.genlayer.com}"
GENVM_RPC="${GENLAYER_RPC:-https://rpc-bradbury.genlayer.com}"

rpc() { curl -sS -X POST -H 'content-type: application/json' --data "$2" "$1"; }
hex_to_dec() { printf '%d' "$1"; }

echo "GenLayer Chain RPC: $RPC"
chain=$(rpc "$RPC" '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' | sed -E 's/.*"result":"([^"]+)".*/\1/')
echo "  chain id: $(hex_to_dec "$chain") (want 4221)"
genvm_chain=$(rpc "$GENVM_RPC" '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' | sed -E 's/.*"result":"([^"]+)".*/\1/' || true)
echo "  GenVM RPC $GENVM_RPC chain id: $(hex_to_dec "${genvm_chain:-0x0}") (should match)"

# Addresses come from the generated map, so a redeploy (pnpm deploy:alkahest) is checked automatically.
MAP="$(dirname "$0")/../packages/core/src/alkahest-bradbury.ts"
addr_of() { grep -oE "^  $1: \"0x[0-9a-fA-F]{40}\"" "$MAP" | grep -oE '0x[0-9a-fA-F]{40}'; }
fail=0
for pair in \
  TrustedOracleArbiter:$(addr_of trustedOracleArbiter) \
  ERC20EscrowObligation:$(addr_of erc20EscrowObligation) \
  CommitRevealObligation:$(addr_of commitRevealObligation) \
  EAS:$(addr_of eas); do
  name=${pair%%:*}; addr=${pair##*:}
  code=$(rpc "$RPC" "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getCode\",\"params\":[\"$addr\",\"latest\"]}" | sed -E 's/.*"result":"([^"]*)".*/\1/')
  bytes=$(( (${#code} - 2) / 2 ))
  if [ "$bytes" -gt 0 ]; then echo "  ok   $name $addr ($bytes bytes)"; else echo "  FAIL $name $addr has no code"; fail=1; fi
done

[ "$(hex_to_dec "$chain")" = "4221" ] || fail=1
if [ "$fail" = 1 ]; then
  echo "Gate part 1 FAILED. Fix: pnpm deploy:alkahest (redeploys Alkahest to 4221 and updates the address map),"
  echo "or switch to Plan B (Base Sepolia). Post the gap in the GenLayer builders channel either way."
  exit 1
fi
echo "Gate part 1 passed. Next: pnpm gate:probe (needs GENLAYER_KEY with GEN from the faucet)."

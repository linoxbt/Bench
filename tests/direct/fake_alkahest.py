"""A tiny in-memory stand-in for Alkahest on GenLayer Chain, for direct-mode tests.

It answers BenchJudge's EVM views (ExternalCall in GenVM v0.3, EthCall in v0.2) (ERC20EscrowObligation.getObligationData,
CommitRevealObligation.getObligationData, EAS.getAttestation) with real ABI encoding,
and records EVM messages (EmitExternalMessage / EthSend) (TrustedOracleArbiter.arbitrate) so tests can assert on them.
Encoding uses eth_abi, independently of the GenLayer SDK, so the tests also cross-check
the contract's ABI shapes.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from eth_abi import decode as abi_decode
from eth_abi import encode as abi_encode
from eth_utils import keccak

ARBITER = bytes.fromhex("11" * 20)
ESCROW = bytes.fromhex("22" * 20)
COMMIT_REVEAL = bytes.fromhex("33" * 20)
EAS = bytes.fromhex("44" * 20)
TOKEN = bytes.fromhex("55" * 20)
BUYER = bytes.fromhex("66" * 20)
SELLER = bytes.fromhex("77" * 20)

ATTESTATION_T = "(bytes32,bytes32,uint64,uint64,uint64,bytes32,address,address,bool,bytes)"


def selector(sig: str) -> bytes:
    return keccak(text=sig)[:4]


SEL_ESCROW_DATA = selector("getObligationData(bytes32)")
SEL_GET_ATTESTATION = selector("getAttestation(bytes32)")
SEL_ARBITRATE = selector("arbitrate(bytes32,bytes,bool)")


def hexaddr(b: bytes) -> str:
    return "0x" + b.hex()


def nla_demand(demand: str, rubric: str = "", model: str = "bench-jury-v1") -> bytes:
    """Arkhai NLA demand: (arbitrationProvider, arbitrationModel, arbitrationPrompt, demand).
    Bench terms ride in the model string, e.g. "bench-jury-v1;seller=0x...;tries=2"."""
    return abi_encode(["(string,string,string,string)"], [("GenLayer", model, rubric, demand)])


def oracle_demand(oracle: bytes, data: bytes) -> bytes:
    """TrustedOracleArbiter.DemandData{address oracle, bytes data}."""
    return abi_encode(["(address,bytes)"], [(hexaddr(oracle), data)])


@dataclass
class Attestation:
    uid: bytes
    attester: bytes
    ref_uid: bytes = b"\x00" * 32
    revocation_time: int = 0
    expiration_time: int = 0
    recipient: bytes = SELLER
    data: bytes = b""


@dataclass
class FakeAlkahest:
    attestations: dict[bytes, Attestation] = field(default_factory=dict)
    escrows: dict[bytes, tuple[bytes, bytes]] = field(default_factory=dict)  # uid -> (arbiter, demand)
    deliveries: dict[bytes, bytes] = field(default_factory=dict)  # uid -> payload
    sent: list[tuple[bytes, bytes, bool]] = field(default_factory=list)  # arbitrate calls
    calls: int = 0

    # ---- builders ----
    def new_escrow(
        self, oracle: bytes, demand: str, rubric: str = "", arbiter: bytes = ARBITER, model: str = "bench-jury-v1",
        expires: int = 0,
    ) -> str:
        uid = os.urandom(32)
        demand_blob = oracle_demand(oracle, nla_demand(demand, rubric, model))
        self.escrows[uid] = (arbiter, demand_blob)
        self.attestations[uid] = Attestation(uid=uid, attester=ESCROW, expiration_time=expires, recipient=BUYER)
        return "0x" + uid.hex()

    def new_delivery(
        self, escrow_uid: str, text: str, attester: bytes = COMMIT_REVEAL, recipient: bytes = SELLER, expires: int = 0
    ) -> str:
        uid = os.urandom(32)
        self.attestations[uid] = Attestation(
            uid=uid, attester=attester, ref_uid=bytes.fromhex(escrow_uid[2:]), recipient=recipient, expiration_time=expires
        )
        self.deliveries[uid] = text.encode()
        return "0x" + uid.hex()

    def revoke(self, uid: str) -> None:
        self.attestations[bytes.fromhex(uid[2:])].revocation_time = 1_700_000_000

    # ---- EVM ----
    def eth_call(self, address: bytes, calldata: bytes) -> bytes:
        self.calls += 1
        sel, args = calldata[:4], calldata[4:]
        (uid,) = abi_decode(["bytes32"], args)
        if address == ESCROW and sel == SEL_ESCROW_DATA:
            arbiter, demand = self.escrows[uid]
            return abi_encode(["(address,bytes,address,uint256)"], [(hexaddr(arbiter), demand, hexaddr(TOKEN), 50 * 10**18)])
        if address == COMMIT_REVEAL and sel == SEL_ESCROW_DATA:
            return abi_encode(["(bytes,bytes32,bytes32)"], [(self.deliveries[uid], b"\x01" * 32, keccak(text="{item:string}"))])
        if address == EAS and sel == SEL_GET_ATTESTATION:
            a = self.attestations.get(uid) or Attestation(uid=b"\x00" * 32, attester=b"\x00" * 20)
            row = (a.uid, b"\x00" * 32, 1, a.expiration_time, a.revocation_time, a.ref_uid, hexaddr(a.recipient), hexaddr(a.attester), True, a.data)
            return abi_encode([ATTESTATION_T], [row])
        raise AssertionError(f"unexpected EthCall to 0x{address.hex()} selector 0x{sel.hex()}")

    def eth_send(self, address: bytes, calldata: bytes) -> bytes:
        assert address == ARBITER, f"EthSend to unexpected address 0x{address.hex()}"
        assert calldata[:4] == SEL_ARBITRATE, "EthSend is not arbitrate(bytes32,bytes,bool)"
        uid, demand, decision = abi_decode(["bytes32", "bytes", "bool"], calldata[4:])
        self.sent.append((uid, demand, decision))
        return b""

    def hook(self, _vm, request):
        def addr(a):
            return a.as_bytes if hasattr(a, "as_bytes") else bytes(a)

        # GenVM v0.3 names (BenchJudge, Bradbury) first, then v0.2 (BenchJudgeB, Studionet).
        for name in ("ExternalCall", "EthCall"):
            if name in request:
                r = request[name]
                return self.eth_call(addr(r["address"]), bytes(r["calldata"]))
        for name in ("EmitExternalMessage", "EthSend"):
            if name in request:
                r = request[name]
                return self.eth_send(addr(r["address"]), bytes(r["calldata"]))
        return None

# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""Day 1 gate probe: proves an Intelligent Contract's EVM write lands on GenLayer Chain as itself.

`probe(uid)` emits TrustedOracleArbiter.arbitrate(uid, b"", True). After FINALIZED, an ArbitrationMade
event with oracle == this contract's address must appear on chain 4221 (scripts/day1-gate-probe.ts checks).
`read_escrow(uid)` exercises the EVM view path BenchJudge uses (and the v0.2.16 view-proxy shim).
"""

from genlayer import *


@gl.evm.contract_interface
class TrustedOracleArbiter:
    class View:
        pass

    class Write:
        def arbitrate(self, fulfillment_uid: gl.evm.bytes32, demand: bytes, decision: bool, /) -> None: ...


@gl.evm.contract_interface
class EAS:
    class View:
        def getAttestation(
            self, uid: gl.evm.bytes32, /
        ) -> tuple[gl.evm.bytes32, gl.evm.bytes32, u64, u64, u64, gl.evm.bytes32, Address, Address, bool, bytes]: ...

    class Write:
        pass


def _view(contract):
    proxy = contract.view()
    cls = type(proxy)
    if not hasattr(cls, "parent"):
        cls.parent = property(lambda self: self._proxy_parent)
    return proxy


class GateProbe(gl.Contract):
    arbiter: Address
    eas: Address
    sent: u256
    last_attester: str

    def __init__(self, arbiter: str, eas: str):
        self.arbiter = Address(arbiter)
        self.eas = Address(eas)

    @gl.public.write
    def probe(self, uid: str) -> None:
        h = uid[2:] if uid.startswith("0x") else uid
        TrustedOracleArbiter(self.arbiter).emit().arbitrate(bytes.fromhex(h), b"", True)
        self.sent += 1

    @gl.public.write
    def read_escrow(self, uid: str) -> None:
        h = uid[2:] if uid.startswith("0x") else uid
        att = _view(EAS(self.eas)).getAttestation(bytes.fromhex(h))
        self.last_attester = att[7].as_hex

    @gl.public.view
    def status(self) -> dict:
        return {"self": gl.message.contract_address.as_hex, "sent": int(self.sent), "last_attester": self.last_attester}

# v0.3.0
# { "Depends": "py-genlayer:babwp9t37jw9g4j2bccgn14g6x7x9s1f7dsmh7emvz735pz4zxa0" }
"""Day 1 gate probe: proves an Intelligent Contract's EVM write lands on GenLayer Chain as itself.

`probe(uid)` emits TrustedOracleArbiter.arbitrate(uid, b"", True). After FINALIZED, an ArbitrationMade
event with oracle == this contract's address must appear on chain 4221 (scripts/day1-gate-probe.ts checks).
`read_escrow(uid)` exercises the EVM view path BenchJudge uses.
Only the deployer can call `probe`: otherwise the probe would be an always-true oracle anyone could trigger.
"""

import genlayer as gl
from genlayer.types import Address, u64, u256


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


class GateProbe(gl.contract.Contract):
    owner: Address
    arbiter: Address
    eas: Address
    sent: u256
    last_attester: str

    def __init__(self, arbiter: str, eas: str):
        self.owner = gl.message.sender_address
        self.arbiter = Address(arbiter)
        self.eas = Address(eas)

    @gl.public.write
    def probe(self, uid: str) -> None:
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError("only the deployer can probe")
        h = uid[2:] if uid.startswith("0x") else uid
        if len(h) != 64 or any(c not in "0123456789abcdefABCDEF" for c in h):
            raise gl.vm.UserError("uid must be 32 bytes hex")
        TrustedOracleArbiter(self.arbiter).emit().arbitrate(bytes.fromhex(h), b"", True)
        self.sent += 1

    @gl.public.write
    def read_escrow(self, uid: str) -> None:
        h = uid[2:] if uid.startswith("0x") else uid
        if len(h) != 64 or any(c not in "0123456789abcdefABCDEF" for c in h):
            raise gl.vm.UserError("uid must be 32 bytes hex")
        att = EAS(self.eas).view().getAttestation(bytes.fromhex(h))
        self.last_attester = att[7].as_hex

    @gl.public.view
    def status(self) -> dict:
        return {"self": gl.message.contract_address.as_hex, "sent": int(self.sent), "last_attester": self.last_attester}

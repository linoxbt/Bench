"""The Day 1 gate probe must not be an always-true oracle anyone can trigger."""

from fake_alkahest import ARBITER, EAS, FakeAlkahest, hexaddr

CONTRACT = "contracts/probe/gate_probe.py"


def test_only_the_deployer_can_probe(direct_vm, direct_deploy, direct_alice, direct_bob):
    fake = FakeAlkahest()
    direct_vm._gl_call_hook = fake.hook
    try:
        direct_vm.sender = direct_alice
        probe = direct_deploy(CONTRACT, hexaddr(ARBITER), hexaddr(EAS))
        direct_vm.sender = direct_bob
        with direct_vm.expect_revert("only the deployer can probe"):
            probe.probe("0x" + "ab" * 32)
        assert fake.sent == []
        direct_vm.sender = direct_alice
        probe.probe("0x" + "ab" * 32)
        assert fake.sent == [(bytes.fromhex("ab" * 32), b"", True)]
        with direct_vm.expect_revert("uid must be 32 bytes hex"):
            probe.probe("0x" + "ab " * 21 + "a")
    finally:
        direct_vm._gl_call_hook = None

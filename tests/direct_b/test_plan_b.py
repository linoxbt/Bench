"""Direct-mode tests for BenchJudgeB (Plan B): the escrow lives on Base Sepolia, read over JSON-RPC.

A fake JSON-RPC endpoint answers eth_call from the same in-memory Alkahest the Plan A tests use, so the
ABI shapes, the block pinning and every safety check run against real ABI encoding.
"""

import hashlib
import json
import re
from pathlib import Path

import pytest

from fake_alkahest import ARBITER, COMMIT_REVEAL, EAS, ESCROW, FakeAlkahest, hexaddr, nla_demand

CONTRACT = "contracts/bench_judge_b.py"
PREVIEW_CONTRACT = "contracts/studionet/bench_judge_preview.py"
RPC = "https://sepolia.base.example/rpc"
ORACLE = bytes.fromhex("0b" * 20)  # the relayer key (B1) or bridge receiver (B2)
JUROR = r".*one juror on a panel.*"
DEMAND = "Landing copy under 120 words that mentions the free tier"


class FakeRpc:
    """Minimal eth JSON-RPC over FakeAlkahest, with a moving 'finalized' head."""

    def __init__(self, alk: FakeAlkahest):
        self.alk = alk
        self.finalized = 0x1234
        self.blocks_seen: list[str] = []
        self.fail_with: str | None = None
        self.lie_at: str | None = None  # an RPC URL that answers eth_call with different bytes

    def __call__(self, data):
        req = json.loads(bytes(data["body"]).decode())
        if self.lie_at and data.get("url") == self.lie_at and req["method"] == "eth_call":
            out = {"jsonrpc": "2.0", "id": 1, "result": "0x" + "00" * 32}
        elif self.fail_with:
            out = {"jsonrpc": "2.0", "id": 1, "error": {"code": -32000, "message": self.fail_with}}
        elif req["method"] == "eth_getBlockByNumber":
            out = {"jsonrpc": "2.0", "id": 1, "result": {"number": hex(self.finalized)}}
        elif req["method"] == "eth_call":
            call, block = req["params"]
            self.blocks_seen.append(block)
            try:
                res = self.alk.eth_call(bytes.fromhex(call["to"][2:]), bytes.fromhex(call["data"][2:]))
                out = {"jsonrpc": "2.0", "id": 1, "result": "0x" + res.hex()}
            except KeyError:  # unknown uid: Alkahest's getObligationData reverts
                out = {"jsonrpc": "2.0", "id": 1, "error": {"code": 3, "message": "execution reverted"}}
        else:
            raise AssertionError(req["method"])
        return {"ok": {"response": {"status": 200, "headers": {}, "body": json.dumps(out).encode()}}}


@pytest.fixture
def alk():
    return FakeAlkahest()


@pytest.fixture
def rpc(direct_vm, alk):
    fake = FakeRpc(alk)
    direct_vm._live_web_handler = fake
    yield fake
    direct_vm._live_web_handler = None


@pytest.fixture
def judge(direct_deploy, rpc):
    return direct_deploy(CONTRACT, RPC, hexaddr(ARBITER), hexaddr(ESCROW), hexaddr(COMMIT_REVEAL), hexaddr(EAS), hexaddr(ORACLE))


def verdict(direct_vm, fulfilled, reason="r"):
    direct_vm.mock_llm(JUROR, json.dumps({"fulfilled": fulfilled, "reason": reason}))


def test_shared_helpers_identical_to_plan_a():
    """The jury, parsing, escaping and key helpers must not drift between the two contracts.

    The one allowed difference is the SDK's name for the same call: BenchJudge runs GenVM v0.3
    (`gl.vm.run_nondet`), BenchJudgeB runs v0.2 on Studionet (`gl.vm.run_nondet_unsafe`).
    """
    grab = lambda p: re.search(
        r"# ---- shared with bench_judge.py: begin ----(.*)# ---- shared with bench_judge.py: end ----",
        Path(p).read_text(),
        re.S,
    ).group(1)
    assert grab("contracts/bench_judge.py") == grab(CONTRACT).replace("gl.vm.run_nondet_unsafe(", "gl.vm.run_nondet(")
    assert grab(PREVIEW_CONTRACT) == grab(CONTRACT)


def test_judge_records_verdict_and_relay_data(direct_vm, judge, alk, rpc):
    e = alk.new_escrow(ORACLE, DEMAND, rubric="Fail on any hype word.")
    f = alk.new_delivery(e, "Start free today.")
    verdict(direct_vm, True, "Mentions the free tier.")
    judge.judge(e, f)
    c = judge.get_case(f)
    assert c["status"] == "decided" and c["fulfilled"] is True
    assert c["demand"] == DEMAND and c["rubric"] == "Fail on any hype word."
    # What the relayer sends to arbitrate(): the inner NLA demand data.
    assert c["demand_data"] == "0x" + nla_demand(DEMAND, "Fail on any hype word.").hex()
    assert c["block_read"] == 0x1234
    # Every read is pinned to the leader's finalized block, never "latest".
    assert set(rpc.blocks_seen) == {hex(0x1234)}


def test_wrong_oracle_reverts(direct_vm, judge, alk):
    e = alk.new_escrow(bytes.fromhex("99" * 20), DEMAND)
    f = alk.new_delivery(e, "x")
    with direct_vm.expect_revert("escrow names a different oracle"):
        judge.judge(e, f)


def test_mismatched_and_wrong_attester_and_settled(direct_vm, judge, alk):
    x = alk.new_escrow(ORACLE, DEMAND)
    y = alk.new_escrow(ORACLE, DEMAND)
    with direct_vm.expect_revert("does not reference this escrow"):
        judge.judge(y, alk.new_delivery(x, "x"))
    with direct_vm.expect_revert("not a CommitRevealObligation"):
        judge.judge(x, alk.new_delivery(x, "x", attester=bytes.fromhex("aa" * 20)))
    f = alk.new_delivery(x, "x")
    alk.revoke(x)
    with direct_vm.expect_revert("escrow already collected or reclaimed"):
        judge.judge(x, f)


def test_unknown_uids_revert_cleanly(direct_vm, judge, alk):
    e = alk.new_escrow(ORACLE, DEMAND)
    with direct_vm.expect_revert("source chain RPC error 3: execution reverted"):
        judge.judge(e, "0x" + "ee" * 32)


def test_double_judge_and_uid_spelling(direct_vm, judge, alk):
    e = alk.new_escrow(ORACLE, DEMAND)
    f = alk.new_delivery(e, "x")
    verdict(direct_vm, False)
    judge.judge(e, f)
    for spelling in (f, f.upper().replace("0X", "0x"), f[2:]):
        with direct_vm.expect_revert("already decided"):
            judge.judge(e, spelling)


def test_rpc_error_reverts(direct_vm, judge, alk, rpc):
    e = alk.new_escrow(ORACLE, DEMAND)
    f = alk.new_delivery(e, "x")
    rpc.fail_with = "header not found"
    with direct_vm.expect_revert("source chain RPC error -32000: header not found"):
        judge.judge(e, f)


def test_preview_cannot_shadow_a_judged_case(direct_vm, judge, alk):
    e = alk.new_escrow(ORACLE, DEMAND)
    f = alk.new_delivery(e, "x")
    verdict(direct_vm, False)
    judge.judge(e, f)
    verdict(direct_vm, True)
    judge.preview(f, DEMAND, "", "y")
    assert judge.get_case(f)["fulfilled"] is False


def _module():
    import sys

    return next(m for m in list(sys.modules.values()) if getattr(m, "_block_ok", None) and getattr(m, "BenchJudgeB", None))


def test_validators_check_the_leaders_block(judge):
    """A leader can't pick a stale, future or malformed block for everyone to agree on."""
    ok = _module()._block_ok
    head = 10_000
    assert ok(hex(head), head) and ok(hex(head - 1800), head)
    assert not ok(hex(head + 1), head)  # not final for this validator
    assert not ok(hex(head - 1801), head)  # stale: e.g. before the escrow was settled
    for bad in ("latest", "0x", "0xzz", 1234, None):
        assert not ok(bad, head)


def test_every_configured_rpc_must_agree(direct_deploy, direct_vm, alk, rpc):
    """With several RPCs configured, one lying RPC can't feed the jury: the read reverts as TRANSIENT."""
    other = "https://base-sepolia.other.example/rpc"
    j = direct_deploy(CONTRACT, f"{RPC}, {other}", hexaddr(ARBITER), hexaddr(ESCROW), hexaddr(COMMIT_REVEAL), hexaddr(EAS), hexaddr(ORACLE))
    e = alk.new_escrow(ORACLE, DEMAND)
    f = alk.new_delivery(e, "Start free today.")
    verdict(direct_vm, True)
    rpc.lie_at = other
    with direct_vm.expect_revert("source chain RPCs disagree"):
        j.judge(e, f)
    rpc.lie_at = None
    j.judge(e, f)
    assert j.get_case(f)["fulfilled"] is True


def test_plan_b_has_the_same_per_escrow_rules(judge, direct_vm, alk, rpc):
    e = alk.new_escrow(ORACLE, DEMAND, model="bench-jury-v1;tries=1")
    verdict(direct_vm, False)
    judge.judge(e, alk.new_delivery(e, "Revolutionary synergy!"))
    with direct_vm.expect_revert("escrow has used all 1 judged deliveries"):
        judge.judge(e, alk.new_delivery(e, "Start free today."))
    assert judge.escrow_state(e)["attempts"] == 1

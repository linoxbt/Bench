"""Integration tests: the jury through real validator consensus on GenLayer Studionet.

Studionet runs GenVM v0.2, so this deploys the preview sandbox (contracts/studionet/bench_judge_preview.py), which
shares BenchJudge's jury, parsing and escaping code verbatim (tests/direct_b checks the shared block). Run with the
v0.2 toolchain (requirements-plan-b.txt) and a funded account; see gltest.config.yaml:
    pytest tests/integration -p gltest --network studionet
These take minutes, so CI does not run them. The judge() path (EVM reads, the verdict on Alkahest) runs against
real validators on Bradbury in tests/e2e.
"""

import json
from pathlib import Path

import pytest
from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = sorted((ROOT / "fixtures" / "cases").glob("*.json"))


@pytest.fixture(scope="module")
def judge():
    factory = get_contract_factory(contract_file_path=ROOT / "contracts" / "studionet" / "bench_judge_preview.py")
    return factory.deploy(args=[])


def _case(judge, key: str) -> dict:
    return judge.get_case(args=[key]).call()


@pytest.mark.parametrize("path", FIXTURES, ids=[p.stem for p in FIXTURES])
def test_fixture_verdicts(judge, path):
    """Validators agree on the clear cases; the verdict matches the fixture's expectation."""
    fx = json.loads(path.read_text())
    case_id = f"{fx['id']}-{path.stat().st_mtime_ns}"
    receipt = judge.preview(args=[case_id, fx["demand"], fx["rubric"], fx["delivery"]]).transact()
    assert tx_execution_succeeded(receipt)
    case = _case(judge, f"preview:{case_id}")
    if fx["expected"] is not None:
        assert case["fulfilled"] is fx["expected"], case["reason"]


def test_preview_id_cannot_be_reused(judge):
    receipt = judge.preview(args=["dup-check", "A haiku about rain", "", "Rain on tin rooftops / ..."]).transact()
    assert tx_execution_succeeded(receipt)
    again = judge.preview(args=["dup-check", "A haiku about rain", "", "different"]).transact()
    assert not tx_execution_succeeded(again)

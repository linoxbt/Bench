"""Integration tests: BenchJudge.preview through real validator consensus.

Run against Studionet (fast) or Bradbury with a funded account; see gltest.config.yaml:
    pytest tests/integration -p gltest --network studionet
These cost testnet gas and take minutes, so CI does not run them; run them before recording.
The judge() path needs EVM interop (Bradbury only) and is covered by tests/e2e.
"""

import json
from pathlib import Path

import pytest
from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = sorted((ROOT / "fixtures" / "cases").glob("*.json"))
ADDR = ["0x" + "11" * 20, "0x" + "22" * 20, "0x" + "33" * 20, "0x" + "44" * 20]


@pytest.fixture(scope="module")
def judge():
    factory = get_contract_factory(contract_file_path=ROOT / "contracts" / "bench_judge.py")
    return factory.deploy(args=ADDR)


def _case(judge, key: str) -> dict:
    return judge.get_case(args=[key]).call()


@pytest.mark.parametrize("path", FIXTURES, ids=[p.stem for p in FIXTURES])
def test_fixture_verdicts(judge, path):
    """Validators agree on the clear cases; the verdict matches the fixture's expectation."""
    fx = json.loads(path.read_text())
    if "example" in fx["delivery"]:
        pytest.skip("URL fixture: put your hosted page in the delivery first")
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

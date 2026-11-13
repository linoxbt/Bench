"""The Studionet preview sandbox (GenVM v0.2): same jury, previews only."""

import json

CONTRACT = "contracts/studionet/bench_judge_preview.py"
JUROR = r".*one juror on a panel.*"


def test_preview_sandbox(direct_vm, direct_deploy):
    c = direct_deploy(CONTRACT)
    direct_vm.mock_llm(JUROR, json.dumps({"fulfilled": True, "reason": "three lines"}))
    c.preview("rain", "A haiku about rain", "", "Soft rain on the roof")
    assert c.get_case("preview:rain")["fulfilled"] is True
    assert c.get_case("rain")["reason"] == "three lines"
    assert c.list_previews(0, 10) == ["preview:rain"] and c.preview_count() == 1
    with direct_vm.expect_revert("preview id already used"):
        c.preview("rain", "x", "", "y")
    with direct_vm.expect_revert("TRANSIENT"):
        c.preview("dead", "Host a page", "", "https://dead.invalid/x")

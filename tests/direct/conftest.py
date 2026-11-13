"""Direct-mode setup for the GenVM v0.3 contracts (BenchJudge, the gate probe).

Run with GENVM_VERSION=v0.6.0-rc13 (the genvm-manager release that ships the Bradbury runner).
Plan B (GenVM v0.2) lives in tests/direct_b: the two SDKs can't share one interpreter.
"""

import json

import gltest.direct.wasi_mock as wasi_mock

_handle_llm_request = wasi_mock._handle_llm_request


def _llm_as_text(vm, data):
    # genlayer-test 0.30 parses mocked JSON into a dict, but the v0.3 SDK's
    # exec_prompt(response_format="json") decodes the host's answer itself and requires text.
    res = _handle_llm_request(vm, data)
    if isinstance(res, dict) and "ok" in res and not isinstance(res["ok"], (str, bytes)):
        res = {"ok": json.dumps(res["ok"])}
    return res


wasi_mock._handle_llm_request = _llm_as_text

_handle_run_nondet = wasi_mock._handle_run_nondet


def _run_nondet_v03(vm, data):
    # genlayer-test 0.30 returns a leader's error as code 1 + raw UTF-8; the v0.3 SDK decodes the
    # payload after the code as calldata (genlayer/vm: UserError(calldata.decode(mem[1:]))).
    res = _handle_run_nondet(vm, data)
    if isinstance(res, bytes) and res[:1] == b"\x01":
        res = b"\x01" + wasi_mock.import_calldata().encode(res[1:].decode("utf-8"))
    return res


wasi_mock._handle_run_nondet = _run_nondet_v03


import sys

import gltest.direct.vm as direct_vm_module

_warp = direct_vm_module.VMContext.warp


def _warp_and_sync(self, timestamp: str) -> None:
    # genlayer-test 0.30's warp() stores the time but never pushes it into the loaded v0.3 message module,
    # so contracts keep seeing the time of import. Push it, as the harness does for sender and value.
    _warp(self, timestamp)
    mod = sys.modules.get("genlayer.message")
    if mod is not None:
        mod.datetime = timestamp
        if isinstance(getattr(mod, "raw", None), dict):
            mod.raw["datetime"] = timestamp


direct_vm_module.VMContext.warp = _warp_and_sync

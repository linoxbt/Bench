"""Run `genvm-lint check` on GenVM v0.3 contracts.

genvm-linter 0.11.x loads the SDK with GENERATING_DOCS=true, and in that mode the v0.3 SDK's
`gl.evm.contract_interface` raises KeyError('return') for every EVM view method (a docs-only code
path; contracts load fine in the real VM). This wrapper turns docs mode off once the SDK is loaded,
then runs the linter's own check command unchanged.

Usage: GENVM_VERSION=v0.6.0-rc13 python scripts/genvm_lint.py contracts/bench_judge.py
(one contract per process: the SDK allows one contract class per interpreter)
"""

import os
import sys

from genvm_linter import cli
from genvm_linter.validate import sdk_loader, validator

_load_sdk = sdk_loader.load_sdk


def _load_sdk_no_docs(*args, **kwargs):
    result = _load_sdk(*args, **kwargs)
    os.environ["GENERATING_DOCS"] = "false"
    return result


sdk_loader.load_sdk = _load_sdk_no_docs
validator.load_sdk = _load_sdk_no_docs

if len(sys.argv) != 2:
    sys.exit("usage: python scripts/genvm_lint.py <contract.py>")
cli.main(["check", sys.argv[1]])

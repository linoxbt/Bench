"""Direct-mode setup for Plan B's BenchJudgeB (GenVM v0.2, Studionet). Shares tests/direct/fake_alkahest.py."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "direct"))

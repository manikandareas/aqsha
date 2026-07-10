import json
import os
import subprocess
import sys
from pathlib import Path

# Headless charts before any analysis imports matplotlib.pyplot.
os.environ.setdefault("MPLBACKEND", "Agg")

import pandas as pd
import pytest

FIXTURE = Path(__file__).parent / "fixtures" / "likert100.csv"
ITEMS_X1 = ["X1.1", "X1.2", "X1.3", "X1.4"]
ITEMS_X2 = ["X2.1", "X2.2", "X2.3", "X2.4"]
ITEMS_Y = ["Y.1", "Y.2", "Y.3", "Y.4"]


@pytest.fixture(scope="session")
def fixture_path() -> str:
    return str(FIXTURE)


@pytest.fixture(scope="session")
def df() -> pd.DataFrame:
    return pd.read_csv(FIXTURE)


def run_cli(*argv: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "aqsha_stats", *argv],
        capture_output=True,
        text=True,
        cwd=Path(__file__).parent.parent,
    )


def cli_json(*argv: str) -> tuple[dict, int]:
    proc = run_cli(*argv)
    return json.loads(proc.stdout), proc.returncode

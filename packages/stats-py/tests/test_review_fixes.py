"""Regression tests for the statistics code-review fixes (2026-07-09).

Each test fails on the pre-fix code and passes after:
- io.load_dataset: ';'-separated CSV must parse ',' decimals (Indonesian locale).
- profile: non-JSON-native cells (Timestamp from Google Forms exports) must not
  break json.dumps of the whole result.
- korelasi: pairwise deletion (SPSS Bivariate default), per-pair N.
- _ols / regresi_linear: reject n <= k + 1 instead of emitting nan as authoritative.
- uji_linearitas: reject a continuous independent (df_within == 0) instead of crashing.
"""

import json

import numpy as np
import pandas as pd
import pytest

from aqsha_stats import AnalysisError, run_analysis
from aqsha_stats.analyses import korelasi, profile
from aqsha_stats.io import load_dataset


def test_semicolon_csv_parses_comma_decimals(tmp_path):
    p = tmp_path / "id_locale.csv"
    p.write_text("X;Y\n1,5;2,25\n2,5;3,75\n3,5;4,50\n", encoding="utf-8")
    df = load_dataset(p)
    assert pd.api.types.is_numeric_dtype(df["X"])
    assert df["X"].tolist() == [1.5, 2.5, 3.5]
    assert df["Y"].tolist() == [2.25, 3.75, 4.5]


def test_profile_serializes_timestamp_column():
    # Google Forms xlsx exports lead with a Timestamp column.
    df = pd.DataFrame(
        {
            "Timestamp": pd.to_datetime(["2020-01-01 09:00", "2020-01-02 10:00", "2020-01-03 11:00"]),
            "X1.1": [4, 5, 3],
        }
    )
    result = profile.run(df, {})
    json.dumps(result, ensure_ascii=False)  # must not raise
    preview = next(t for t in result["tables"] if t["id"] == "preview")
    assert isinstance(preview["rows"][0][0], str)  # Timestamp stringified


def test_korelasi_pairwise_deletion_uses_per_pair_n():
    rng = np.random.default_rng(0)
    df = pd.DataFrame(
        {
            "A": rng.normal(size=40),
            "B": rng.normal(size=40),
            "C": rng.normal(size=40),
        }
    )
    df.loc[:9, "C"] = np.nan  # 10 missing only in C
    result = korelasi.run(df, {"variables": ["A", "B", "C"]})
    n_by_pair = {(r[0], r[1]): r[4] for r in result["tables"][0]["rows"]}
    assert n_by_pair[("A", "B")] == 40  # A,B complete → full N (listwise would give 30)
    assert n_by_pair[("A", "C")] == 30  # pair with C → 30


def test_regresi_rejects_too_few_rows(tmp_path):
    p = tmp_path / "tiny.csv"
    p.write_text("Y,X1,X2\n1,2,3\n2,3,4\n3,4,5\n", encoding="utf-8")  # n=3, k=2 → n < k+2
    with pytest.raises(AnalysisError) as exc:
        run_analysis("regresi_linear", str(p), {"dependent": "Y", "independents": ["X1", "X2"]})
    assert exc.value.code == "insufficient_data"


def test_linearitas_rejects_continuous_independent(tmp_path):
    p = tmp_path / "cont.csv"
    rows = "\n".join(f"{i * 1.3},{i * 0.7}" for i in range(1, 21))  # every X unique
    p.write_text("Y,X\n" + rows + "\n", encoding="utf-8")
    with pytest.raises(AnalysisError) as exc:
        run_analysis("uji_linearitas", str(p), {"dependent": "Y", "independent": "X"})
    assert exc.value.code == "insufficient_data"

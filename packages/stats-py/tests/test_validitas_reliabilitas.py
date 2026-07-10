import numpy as np
import pytest

from aqsha_stats.registry import ANALYSES

from conftest import ITEMS_X1


def test_validitas_golden(df):
    result = ANALYSES["uji_validitas"](df, {"items": ITEMS_X1})
    rows = {row[0]: row for row in result["tables"][0]["rows"]}

    # Independent cross-check: Pearson r item vs (uncorrected) total via np.corrcoef.
    total = df[ITEMS_X1].sum(axis=1)
    raw_r = float(np.corrcoef(df["X1.1"], total)[0, 1])
    assert raw_r == pytest.approx(0.7677193888651713, rel=1e-6)  # pinned golden
    assert rows["X1.1"][1] == pytest.approx(raw_r, abs=5e-4)

    # r tabel column comes from the t distribution (n=100 -> 0.1966).
    assert rows["X1.1"][2] == pytest.approx(0.1966, abs=1e-3)

    for item in ITEMS_X1:
        assert rows[item][4] == "Valid"
        assert rows[item][1] > rows[item][2]

    overall = next(d for d in result["decisions"] if d["id"] == "validitas_keseluruhan")
    assert overall["verdict"] == "lolos"
    per_item = next(d for d in result["decisions"] if d["id"] == "validitas_X1.1")
    assert per_item["verdict"] == "lolos"
    assert "valid" in per_item["interpretation"]
    assert "0,768" in per_item["interpretation"]  # Indonesian comma decimals


def test_reliabilitas_golden(df):
    result = ANALYSES["uji_reliabilitas"](df, {"items": ITEMS_X1})
    alpha_row = result["tables"][0]["rows"][0]

    # Independent cross-check: alpha = k/(k-1) * (1 - sum(s_i^2)/s_total^2), ddof=1.
    k = len(ITEMS_X1)
    item_vars = df[ITEMS_X1].var(ddof=1).sum()
    total_var = df[ITEMS_X1].sum(axis=1).var(ddof=1)
    raw_alpha = float(k / (k - 1) * (1 - item_vars / total_var))
    assert raw_alpha == pytest.approx(0.8142429131136206, rel=1e-6)  # pinned golden

    assert alpha_row[0] == pytest.approx(raw_alpha, abs=5e-4)
    assert alpha_row[1] == k

    # Item-Total Statistics golden row for X1.1 (SPSS formulas, ddof=1).
    it_rows = {row[0]: row for row in result["tables"][1]["rows"]}
    rest = df[ITEMS_X1].sum(axis=1) - df["X1.1"]
    assert it_rows["X1.1"][1] == pytest.approx(float(rest.mean()), abs=5e-4)
    assert it_rows["X1.1"][2] == pytest.approx(float(rest.var(ddof=1)), abs=5e-4)
    assert it_rows["X1.1"][3] == pytest.approx(float(np.corrcoef(df["X1.1"], rest)[0, 1]), abs=5e-4)
    others = [i for i in ITEMS_X1 if i != "X1.1"]
    alpha_deleted = float(
        3 / 2 * (1 - df[others].var(ddof=1).sum() / df[others].sum(axis=1).var(ddof=1))
    )
    assert it_rows["X1.1"][4] == pytest.approx(alpha_deleted, abs=5e-4)
    assert it_rows["X1.1"] == ["X1.1", 9.1, 6.495, 0.579, 0.792]  # pinned rounded goldens

    d = result["decisions"][0]
    assert d["verdict"] == "lolos"
    assert d["cutoff"] == 0.6
    assert "0,70" in d["interpretation"]  # secondary 0.70 note

import numpy as np
import pytest

from aqsha_stats.registry import ANALYSES

REG_ARGS = {"dependent": "Y", "independents": ["X1", "X2"]}


def test_multikolinearitas_golden(df):
    result = ANALYSES["uji_multikolinearitas"](df, REG_ARGS)
    rows = {row[0]: row for row in result["tables"][0]["rows"]}

    # Independent cross-check: VIF = 1/(1 - R^2) from a direct numpy lstsq.
    x1 = df["X1"].astype(float).to_numpy()
    x2 = df["X2"].astype(float).to_numpy()
    A = np.column_stack([np.ones(len(x2)), x2])
    coef, *_ = np.linalg.lstsq(A, x1, rcond=None)
    pred = A @ coef
    r2 = 1 - ((x1 - pred) ** 2).sum() / ((x1 - x1.mean()) ** 2).sum()
    raw_vif = float(1 / (1 - r2))
    assert raw_vif == pytest.approx(1.1124115274169506, rel=1e-6)  # pinned golden

    assert rows["X1"][2] == pytest.approx(raw_vif, abs=5e-4)
    assert rows["X1"][1] == pytest.approx(1 - r2, abs=5e-4)  # Tolerance
    # With two predictors both auxiliary R^2 are identical.
    assert rows["X2"][2] == pytest.approx(raw_vif, abs=5e-4)

    for d in result["decisions"]:
        assert d["verdict"] == "lolos"
        assert d["cutoff"] == 10


def test_heteroskedastisitas_glejser_golden(df):
    result = ANALYSES["uji_heteroskedastisitas"](df, REG_ARGS)
    rows = {row[0]: row for row in result["tables"][0]["rows"]}

    assert set(rows) == {"(Constant)", "X1", "X2"}
    assert rows["(Constant)"][3] is None  # no Beta for the constant
    # Pinned rounded goldens for the Glejser regression.
    assert rows["X1"][1] == pytest.approx(0.062, abs=1e-3)  # B
    assert rows["X1"][5] == pytest.approx(0.206, abs=1e-3)  # Sig.
    assert rows["X2"][5] == pytest.approx(0.863, abs=1e-3)

    # Independent cross-check: Glejser B via lstsq of |resid| on [1, X1, X2].
    x1 = df["X1"].astype(float).to_numpy()
    x2 = df["X2"].astype(float).to_numpy()
    y = df["Y"].astype(float).to_numpy()
    A = np.column_stack([np.ones(len(y)), x1, x2])
    b, *_ = np.linalg.lstsq(A, y, rcond=None)
    abs_resid = np.abs(y - A @ b)
    g, *_ = np.linalg.lstsq(A, abs_resid, rcond=None)
    assert rows["X1"][1] == pytest.approx(float(g[1]), abs=5e-4)

    for d in result["decisions"]:
        assert d["verdict"] == "lolos"  # sig > 0.05: no heteroscedasticity


def test_autokorelasi_golden(df):
    result = ANALYSES["uji_autokorelasi"](df, REG_ARGS)
    row = result["tables"][0]["rows"][0]
    n, k, dw, dl, du, four_du, four_dl = row

    # Independent cross-check: DW = sum((e_t - e_{t-1})^2) / sum(e^2).
    x1 = df["X1"].astype(float).to_numpy()
    x2 = df["X2"].astype(float).to_numpy()
    y = df["Y"].astype(float).to_numpy()
    A = np.column_stack([np.ones(len(y)), x1, x2])
    b, *_ = np.linalg.lstsq(A, y, rcond=None)
    e = y - A @ b
    raw_dw = float((np.diff(e) ** 2).sum() / (e**2).sum())
    assert raw_dw == pytest.approx(1.7769837629342775, rel=1e-6)  # pinned golden

    assert (n, k) == (100, 2)
    assert dw == pytest.approx(raw_dw, abs=5e-4)
    assert (dl, du) == (1.634, 1.715)  # Savin-White n=100, k=2
    assert four_du == pytest.approx(4 - 1.715, abs=1e-9)

    d = result["decisions"][0]
    assert d["verdict"] == "lolos"  # dU < 1.777 < 4 - dU
    assert "tidak terjadi gejala autokorelasi" in d["interpretation"]


def test_linearitas_golden(df):
    result = ANALYSES["uji_linearitas"](df, {"dependent": "Y", "independent": "X1"})
    rows = {row[0]: row for row in result["tables"][0]["rows"]}

    ss_combined = rows["Between Groups (Combined)"][1]
    ss_lin = rows["Linearity"][1]
    ss_dev = rows["Deviation from Linearity"][1]
    ss_within = rows["Within Groups"][1]
    ss_total = rows["Total"][1]

    # Sum-of-squares identities.
    assert ss_combined == pytest.approx(ss_lin + ss_dev, abs=2e-3)
    assert ss_total == pytest.approx(ss_combined + ss_within, abs=2e-3)

    # Independent cross-check of SS terms (numpy, not the analysis code path).
    x = df["X1"].astype(float).to_numpy()
    y = df["Y"].astype(float).to_numpy()
    raw_total = float(((y - y.mean()) ** 2).sum())
    raw_within = float(
        sum(((y[x == v] - y[x == v].mean()) ** 2).sum() for v in np.unique(x))
    )
    sxy = float(((x - x.mean()) * (y - y.mean())).sum())
    sxx = float(((x - x.mean()) ** 2).sum())
    raw_lin = sxy**2 / sxx
    assert ss_total == pytest.approx(raw_total, abs=5e-4)
    assert ss_within == pytest.approx(raw_within, abs=5e-4)
    assert ss_lin == pytest.approx(raw_lin, abs=5e-4)

    # Pinned goldens.
    assert rows["Deviation from Linearity"][4] == pytest.approx(1.019, abs=1e-3)  # F
    assert rows["Deviation from Linearity"][5] == pytest.approx(0.443, abs=1e-3)  # Sig.
    assert rows["Within Groups"][2] == 84  # df = n - g
    assert result["decisions"][0]["verdict"] == "lolos"

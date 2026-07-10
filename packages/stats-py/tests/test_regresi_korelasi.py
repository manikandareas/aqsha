import numpy as np
import pytest

from aqsha_stats.registry import ANALYSES

REG_ARGS = {"dependent": "Y", "independents": ["X1", "X2"]}


def _lstsq_fit(df):
    x1 = df["X1"].astype(float).to_numpy()
    x2 = df["X2"].astype(float).to_numpy()
    y = df["Y"].astype(float).to_numpy()
    A = np.column_stack([np.ones(len(y)), x1, x2])
    b, *_ = np.linalg.lstsq(A, y, rcond=None)
    pred = A @ b
    r2 = 1 - ((y - pred) ** 2).sum() / ((y - y.mean()) ** 2).sum()
    return b, float(r2), y


def test_regresi_linear_golden(df):
    result = ANALYSES["regresi_linear"](df, {**REG_ARGS, "durbin_watson": True})

    # Independent cross-check via numpy lstsq.
    b, r2, y = _lstsq_fit(df)
    assert r2 == pytest.approx(0.4784772413801054, rel=1e-6)  # pinned golden
    assert float(b[0]) == pytest.approx(2.2145902148894274, rel=1e-6)
    assert float(b[1]) == pytest.approx(0.4618650574068155, rel=1e-6)
    assert float(b[2]) == pytest.approx(0.35849410854086033, rel=1e-6)

    summary = result["tables"][0]
    assert summary["columns"] == [
        "R",
        "R Square",
        "Adjusted R Square",
        "Std. Error of the Estimate",
        "Durbin-Watson",
    ]
    r, r_square, adj_r, std_err, dw = summary["rows"][0]
    assert r_square == pytest.approx(r2, abs=5e-4)
    assert r == pytest.approx(np.sqrt(r2), abs=5e-4)
    n, k = 100, 2
    assert adj_r == pytest.approx(1 - (1 - r2) * (n - 1) / (n - k - 1), abs=5e-4)
    assert dw == pytest.approx(1.777, abs=1e-3)

    anova = {row[0]: row for row in result["tables"][1]["rows"]}
    assert anova["Regression"][2] == 2
    assert anova["Residual"][2] == 97
    assert anova["Total"][2] == 99
    assert anova["Regression"][4] == pytest.approx(44.49690032386223, abs=1e-3)  # F
    assert anova["Regression"][5] == 0  # p = 1.94e-14 rounds to 0.0 (",000" is FE concern)
    ss_total = float(((y - y.mean()) ** 2).sum())
    assert anova["Total"][1] == pytest.approx(ss_total, abs=5e-4)

    coef = {row[0]: row for row in result["tables"][2]["rows"]}
    assert coef["(Constant)"][1] == pytest.approx(float(b[0]), abs=5e-4)
    assert coef["X1"][1] == pytest.approx(float(b[1]), abs=5e-4)
    assert coef["X2"][1] == pytest.approx(float(b[2]), abs=5e-4)
    # Standardized Beta = b * sd_x / sd_y.
    beta_x1 = float(b[1]) * df["X1"].std(ddof=1) / df["Y"].std(ddof=1)
    assert coef["X1"][3] == pytest.approx(beta_x1, abs=5e-4)
    assert coef["(Constant)"][3] is None

    decisions = {d["id"]: d for d in result["decisions"]}
    assert decisions["uji_f"]["verdict"] == "lolos"
    assert decisions["uji_t_X1"]["verdict"] == "lolos"
    assert decisions["uji_t_X2"]["verdict"] == "lolos"
    assert result["meta"]["equation"] == "Y = 2,215 + 0,462X1 + 0,358X2"
    eq_decision = decisions["persamaan_regresi"]
    assert "Y = 2,215 + 0,462X1 + 0,358X2" in eq_decision["interpretation"]


def test_korelasi_golden(df):
    result = ANALYSES["korelasi"](df, {"variables": ["X1", "X2", "Y"]})
    rows = {(row[0], row[1]): row for row in result["tables"][0]["rows"]}

    raw_r = float(np.corrcoef(df["X1"], df["Y"])[0, 1])
    assert raw_r == pytest.approx(0.5865293605843995, rel=1e-6)  # pinned golden

    row = rows[("X1", "Y")]
    assert row[2] == pytest.approx(raw_r, abs=5e-4)
    assert row[4] == 100  # N
    assert "sedang" in row[5]  # 0.40-0.599 band
    assert row[5].endswith("**")  # significant at 0.01

    assert "lemah" in rows[("X1", "X2")][5]  # r = 0.318

    decisions = {d["id"]: d for d in result["decisions"]}
    assert decisions["korelasi_X1_Y"]["verdict"] == "lolos"
    assert "Korelasi terkuat" in decisions["korelasi_X1_Y"]["interpretation"]
    assert "0,587" in decisions["korelasi_X1_Y"]["interpretation"]


def test_korelasi_spearman_runs(df):
    result = ANALYSES["korelasi"](df, {"variables": ["X1", "Y"], "method": "spearman"})
    assert result["tables"][0]["rows"][0][2] == pytest.approx(
        float(__import__("scipy.stats", fromlist=["spearmanr"]).spearmanr(df["X1"], df["Y"]).statistic),
        abs=5e-4,
    )

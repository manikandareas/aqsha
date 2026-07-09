import numpy as np
import pytest
from scipy import stats

from aqsha_stats.registry import ANALYSES

REG_ARGS = {"mode": "residual", "dependent": "Y", "independents": ["X1", "X2"]}


def _residuals(df) -> np.ndarray:
    import statsmodels.api as sm

    X = sm.add_constant(df[["X1", "X2"]].astype(float))
    return np.asarray(sm.OLS(df["Y"].astype(float), X).fit().resid)


def test_normalitas_residual_golden(df):
    result = ANALYSES["uji_normalitas"](df, REG_ARGS)
    ks_rows = {row[0]: row[1] for row in result["tables"][0]["rows"]}

    assert ks_rows["N"] == 100
    assert ks_rows["Test Statistic"] == pytest.approx(0.09307731445651321, abs=5e-4)
    assert ks_rows["Asymp. Sig. (2-tailed)"] == pytest.approx(0.034661678105878106, abs=5e-4)

    ks_decision = next(d for d in result["decisions"] if d["id"] == "normalitas_residual_ks")
    assert ks_decision["verdict"] == "tidak_lolos"  # p = 0.035 < 0.05
    sw_decision = next(d for d in result["decisions"] if d["id"] == "normalitas_residual_shapiro")
    assert sw_decision["verdict"] == "lolos"  # Shapiro p = 0.105 > 0.05


def test_lilliefors_differs_from_naive_kstest(df):
    """Guard the K-S gotcha: SPSS parity requires the Lilliefors correction; a naive
    scipy.kstest against fitted parameters produces a very different p-value."""
    from statsmodels.stats.diagnostic import lilliefors

    resid = _residuals(df)
    _stat, lf_p = lilliefors(resid, dist="norm", pvalmethod="table")

    mu, sd = resid.mean(), resid.std(ddof=0)
    naive = stats.kstest(resid, lambda v: stats.norm.cdf(v, loc=mu, scale=sd))

    assert float(lf_p) == pytest.approx(0.034661678105878106, rel=1e-6)  # pinned golden
    assert float(naive.pvalue) == pytest.approx(0.34190377674012196, rel=1e-6)
    assert abs(float(lf_p) - float(naive.pvalue)) > 0.1


def test_normalitas_variables_mode(df):
    result = ANALYSES["uji_normalitas"](df, {"mode": "variables", "variables": ["X1", "Y"]})
    rows = {row[0]: row for row in result["tables"][0]["rows"]}
    assert set(rows) == {"X1", "Y"}
    assert rows["X1"][6] in ("Normal", "Tidak Normal")
    assert len(result["decisions"]) == 2

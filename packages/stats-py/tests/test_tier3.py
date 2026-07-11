"""Tier 3 (fase 6) — EFA, GLM (two-way/ANCOVA/MANOVA), CB-SEM, PLS-SEM.

Pola sama dengan tier 2: cross-check nilai uji terhadap statsmodels/referensi
independen + konsistensi verdict. KMO/Bartlett punya golden dari factor_analyzer
(dihitung sekali, package GPL tidak jadi dependency).
"""

from __future__ import annotations

import numpy as np
import pytest

from aqsha_stats.registry import ANALYSES

ITEMS_8 = ["X1.1", "X1.2", "X1.3", "X1.4", "X2.1", "X2.2", "X2.3", "X2.4"]


def _verdict(result, decision_id):
    return next(d["verdict"] for d in result["decisions"] if d["id"] == decision_id)


def _table(result, table_id):
    return next(t for t in result["tables"] if t["id"] == table_id)


def test_uji_anova_dua_arah_type3(df):
    result = ANALYSES["uji_anova_dua_arah"](df, {"dependent": "Y", "factor1": "JK", "factor2": "Usia"})
    import statsmodels.api as sm
    from statsmodels.formula.api import ols

    sub = df[["Y", "JK", "Usia"]].dropna()
    model = ols('Q("Y") ~ C(Q("JK"), Sum) * C(Q("Usia"), Sum)', data=sub).fit()
    anova = sm.stats.anova_lm(model, typ=3)
    effects = _table(result, "between_subjects")
    by_source = {row[0]: row for row in effects["rows"]}
    inter = anova.loc['C(Q("JK"), Sum):C(Q("Usia"), Sum)']
    assert by_source["JK * Usia"][1] == pytest.approx(float(inter["sum_sq"]), rel=1e-3)
    assert by_source["JK * Usia"][5] == pytest.approx(float(inter["PR(>F)"]), abs=5e-4)
    # Corrected Total = SS total (centered); Error df = df_resid.
    assert by_source["Corrected Total"][1] == pytest.approx(float(model.centered_tss), rel=1e-6)
    assert by_source["Error"][2] == int(model.df_resid)
    p_inter = float(inter["PR(>F)"])
    assert _verdict(result, "interaksi") == ("lolos" if p_inter < 0.05 else "tidak_lolos")


def test_uji_ancova_matches_pingouin(df):
    result = ANALYSES["uji_ancova"](df, {"dependent": "Y", "factor": "JK", "covariates": ["X1"]})
    import pingouin as pg

    ref = pg.ancova(data=df, dv="Y", covar="X1", between="JK")
    effects = _table(result, "between_subjects")
    by_source = {row[0]: row for row in effects["rows"]}
    p_factor = float(ref.loc[ref["Source"] == "JK", "p_unc"].iloc[0])
    p_covar = float(ref.loc[ref["Source"] == "X1", "p_unc"].iloc[0])
    assert by_source["JK"][5] == pytest.approx(p_factor, abs=5e-4)
    assert by_source["X1"][5] == pytest.approx(p_covar, abs=5e-4)
    assert _verdict(result, "efek_faktor") == ("lolos" if p_factor < 0.05 else "tidak_lolos")
    # EMM: satu baris per level faktor.
    emm = _table(result, "emmeans")
    assert sorted(r[0] for r in emm["rows"]) == sorted(df["JK"].astype(str).unique())


def test_uji_manova_wilks(df):
    result = ANALYSES["uji_manova"](df, {"dependents": ["X1", "Y"], "group": "Usia"})
    from statsmodels.multivariate.manova import MANOVA

    ref = MANOVA.from_formula('Q("X1") + Q("Y") ~ C(Q("Usia"))', data=df).mv_test()
    stat = ref.results['C(Q("Usia"))']["stat"]
    multivariate = _table(result, "multivariate")
    by_effect = {row[0]: row for row in multivariate["rows"]}
    wilks_p = float(stat.loc["Wilks' lambda", "Pr > F"])
    assert by_effect["Wilks' Lambda"][1] == pytest.approx(float(stat.loc["Wilks' lambda", "Value"]), abs=1e-3)
    assert by_effect["Wilks' Lambda"][5] == pytest.approx(wilks_p, abs=5e-4)
    assert set(by_effect) == {"Pillai's Trace", "Wilks' Lambda", "Hotelling's Trace", "Roy's Largest Root"}
    assert _verdict(result, "manova_wilks") == ("lolos" if wilks_p < 0.05 else "tidak_lolos")


def test_analisis_faktor_kmo_bartlett_golden(df):
    """Golden dari factor_analyzer 0.5.1 (referensi independen, dihitung 2026-07-10)."""
    result = ANALYSES["analisis_faktor"](df, {"items": ITEMS_8})
    kmo_tbl = {row[0]: row[1] for row in _table(result, "kmo_bartlett")["rows"]}
    assert kmo_tbl["Kaiser-Meyer-Olkin Measure of Sampling Adequacy"] == pytest.approx(0.814098, abs=1e-4)
    assert kmo_tbl["Bartlett's Test of Sphericity — Approx. Chi-Square"] == pytest.approx(333.813906, abs=1e-2)
    assert _verdict(result, "kmo") == "lolos"
    assert _verdict(result, "bartlett") == "lolos"


def test_analisis_faktor_structure(df):
    result = ANALYSES["analisis_faktor"](df, {"items": ITEMS_8})
    k = result["meta"]["n_factors"]
    assert k >= 1
    communalities = _table(result, "communalities")
    for row in communalities["rows"]:
        assert 0.0 <= row[2] <= 1.0 + 1e-9  # extraction
        assert 0.0 <= row[3] <= 1.0 + 1e-9  # MSA per item
    variance = _table(result, "variance")
    eigenvalues = [row[1] for row in variance["rows"]]
    assert sum(eigenvalues) == pytest.approx(len(ITEMS_8), abs=0.01)  # trace = p (tabel dibulatkan 3 desimal)
    assert eigenvalues == sorted(eigenvalues, reverse=True)
    matrix = _table(result, "component_matrix")
    assert len(matrix["columns"]) == 2 + k
    # Communality = jumlah kuadrat loading baris (invarian rotasi).
    for c_row, m_row in zip(communalities["rows"], matrix["rows"], strict=True):
        ss = sum(v * v for v in m_row[1 : 1 + k])
        assert ss == pytest.approx(c_row[2], abs=2e-3)


def test_analisis_faktor_fixed_n_factors(df):
    result = ANALYSES["analisis_faktor"](df, {"items": ITEMS_8, "n_factors": 3})
    assert result["meta"]["n_factors"] == 3
    assert len(_table(result, "component_matrix")["columns"]) == 5


def test_cb_sem_semopy(df):
    result = ANALYSES["cb_sem"](
        df,
        {
            "latents": {"X1": ["X1.1", "X1.2", "X1.3", "X1.4"], "Y": ["Y.1", "Y.2", "Y.3", "Y.4"]},
            "paths": ["X1 -> Y"],
        },
    )
    loadings = _table(result, "loadings")
    # 8 item, 2 di antaranya loading referensi (difiksasi 1, tanpa SE).
    assert len(loadings["rows"]) == 8
    structural = _table(result, "structural")
    assert len(structural["rows"]) == 1
    source, target, estimate, std, se, z, p = structural["rows"][0]
    assert (source, target) == ("X1", "Y")
    assert estimate is not None and std is not None
    # Structural path is estimated (not a fixed reference loading) → SE and z present too.
    # Split so a failure pinpoints which value is missing.
    assert se is not None
    assert z is not None
    fit = {row[0]: row[1] for row in _table(result, "fit")["rows"]}
    assert 0 <= fit["RMSEA"] <= 1
    assert fit["CFI"] <= 1.0 + 1e-9
    assert result["meta"]["semopy"]
    path_verdict = _verdict(result, "path_X1_Y")
    assert path_verdict == ("lolos" if (p is not None and p < 0.05) else "tidak_lolos")


def test_cb_sem_single_item_latent_as_observed(df):
    result = ANALYSES["cb_sem"](
        df,
        {
            "latents": {"X1tot": ["X1"], "Y": ["Y.1", "Y.2", "Y.3", "Y.4"]},
            "paths": ["X1tot -> Y"],
        },
    )
    structural = _table(result, "structural")
    assert structural["rows"][0][0] == "X1tot"
    assert "=~" not in result["meta"]["model"].split("\n")[-1]  # structural line only


def test_sem_pls_bootstrap_golden(df):
    """Golden t-stat dari openpls-engine 1.10.0, seed 42, bootstrap 500 (deterministik)."""
    pytest.importorskip("openpls")
    result = ANALYSES["sem_pls"](
        df,
        {
            "latents": {
                "X1": ["X1.1", "X1.2", "X1.3", "X1.4"],
                "X2": ["X2.1", "X2.2", "X2.3", "X2.4"],
                "Y": ["Y.1", "Y.2", "Y.3", "Y.4"],
            },
            "paths": ["X1 -> Y", "X2 -> Y"],
            "bootstrap": 500,
        },
    )
    paths = {row[0]: row for row in _table(result, "path_coefficients")["rows"]}
    assert paths["X1 -> Y"][1] == pytest.approx(0.470, abs=1e-3)  # original sample
    assert paths["X2 -> Y"][1] == pytest.approx(0.390, abs=1e-3)
    assert paths["X1 -> Y"][4] == pytest.approx(6.994, abs=1e-2)  # t, seed-deterministic
    assert paths["X2 -> Y"][4] == pytest.approx(5.898, abs=1e-2)
    assert _verdict(result, "path_X1 -> Y") == "lolos"
    reliability = _table(result, "reliability")
    for _lv, alpha, cr, ave in reliability["rows"]:
        assert 0 <= alpha <= 1 and 0 <= cr <= 1 and 0 <= ave <= 1
    fl = _table(result, "fornell_larcker")
    diag = {row[0]: row[1 + i] for i, row in enumerate(fl["rows"])}
    for lv, sqrt_ave in diag.items():
        ave = next(r[3] for r in reliability["rows"] if r[0] == lv)
        assert sqrt_ave == pytest.approx(np.sqrt(ave), abs=2e-3)
    assert result["meta"]["bootstrap"] == 500
    assert result["meta"]["openpls_engine"] != "unknown"


def test_sem_pls_invalid_path(df):
    pytest.importorskip("openpls")
    from aqsha_stats.contract import AnalysisError

    with pytest.raises(AnalysisError) as err:
        ANALYSES["sem_pls"](df, {"latents": {"X1": ["X1.1"]}, "paths": ["X1 -> Z"]})
    assert err.value.code == "invalid_args"

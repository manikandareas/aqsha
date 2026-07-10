"""Tier 2 (fase 5) — cross-check statistik terhadap scipy langsung + konsistensi verdict.

Bukan golden vs SPSS penuh (butuh output SPSS asli), tapi memverifikasi wiring kolom, nilai
statistik uji, dan aturan keputusan (verdict cocok dengan Sig. vs 0,05).
"""

from __future__ import annotations

import numpy as np
import pytest
from scipy import stats

from aqsha_stats.registry import ANALYSES


def _verdict(result, decision_id):
    return next(d["verdict"] for d in result["decisions"] if d["id"] == decision_id)


def test_uji_beda_t_independent(df):
    result = ANALYSES["uji_beda_t"](df, {"mode": "independent", "dependent": "Y", "group": "JK"})
    a = df.loc[df["JK"] == "Laki-laki", "Y"].astype(float)
    b = df.loc[df["JK"] == "Perempuan", "Y"].astype(float)
    _, lev_p = stats.levene(a, b, center="mean")
    _, t_p = stats.ttest_ind(a, b, equal_var=bool(lev_p > 0.05))
    test_row = result["tables"][1]["rows"][0]
    assert test_row[5] == pytest.approx(float(t_p), abs=5e-4)  # Sig. (2-tailed)
    assert _verdict(result, "uji_beda") == ("lolos" if t_p < 0.05 else "tidak_lolos")


def test_uji_beda_t_paired(df):
    result = ANALYSES["uji_beda_t"](df, {"mode": "paired", "pre": "X1", "post": "Y"})
    _, t_p = stats.ttest_rel(df["X1"].astype(float), df["Y"].astype(float))
    assert result["tables"][1]["rows"][0][6] == pytest.approx(float(t_p), abs=5e-4)


def test_uji_anova_and_tukey(df):
    result = ANALYSES["uji_anova"](df, {"dependent": "Y", "group": "Usia"})
    groups = [g["Y"].astype(float).to_numpy() for _, g in df.groupby("Usia")]
    f, p = stats.f_oneway(*groups)
    anova = next(t for t in result["tables"] if t["id"] == "anova")
    between = anova["rows"][0]
    assert between[4] == pytest.approx(float(f), abs=1e-3)  # F
    assert between[5] == pytest.approx(float(p), abs=5e-4)  # Sig.
    assert _verdict(result, "anova_f") == ("lolos" if p < 0.05 else "tidak_lolos")


def test_uji_mann_whitney(df):
    result = ANALYSES["uji_mann_whitney"](df, {"dependent": "Y", "group": "JK"})
    a = df.loc[df["JK"] == "Laki-laki", "Y"].astype(float)
    b = df.loc[df["JK"] == "Perempuan", "Y"].astype(float)
    u, p = stats.mannwhitneyu(a, b, alternative="two-sided")
    test_row = result["tables"][1]["rows"][0]
    assert test_row[0] == pytest.approx(float(u), abs=1e-6)
    assert test_row[2] == pytest.approx(float(p), abs=5e-4)


def test_uji_wilcoxon(df):
    result = ANALYSES["uji_wilcoxon"](df, {"pre": "X1", "post": "Y"})
    _, p = stats.wilcoxon(df["X1"].astype(float), df["Y"].astype(float))
    assert result["tables"][1]["rows"][0][2] == pytest.approx(float(p), abs=5e-4)


def test_uji_kruskal_wallis(df):
    result = ANALYSES["uji_kruskal_wallis"](df, {"dependent": "Y", "group": "Usia"})
    groups = [g["Y"].astype(float).to_numpy() for _, g in df.groupby("Usia")]
    h, p = stats.kruskal(*groups)
    test_row = result["tables"][1]["rows"][0]
    assert test_row[0] == pytest.approx(float(h), abs=1e-3)
    assert test_row[2] == pytest.approx(float(p), abs=5e-4)


def test_uji_chi_square(df):
    result = ANALYSES["uji_chi_square"](df, {"row": "JK", "col": "Usia"})
    import pandas as pd

    ct = pd.crosstab(df["JK"], df["Usia"])
    chi2, p, dof, _ = stats.chi2_contingency(ct.to_numpy())
    test_row = result["tables"][1]["rows"][0]
    assert test_row[1] == pytest.approx(float(chi2), abs=1e-3)
    assert test_row[2] == int(dof)
    assert test_row[3] == pytest.approx(float(p), abs=5e-4)


def test_transformasi_msi(df):
    result = ANALYSES["transformasi_msi"](df, {"items": ["X1.1", "X1.2"]})
    rows = result["tables"][0]["rows"]
    # Nilai terendah tiap item digeser ke 1,000; nilai naik monoton dengan kategori.
    by_item: dict[str, list] = {}
    for item, cat, val in rows:
        by_item.setdefault(item, []).append((cat, val))
    for item, pairs in by_item.items():
        pairs.sort()
        vals = [v for _, v in pairs]
        assert vals[0] == pytest.approx(1.0, abs=1e-6)
        assert vals == sorted(vals)  # monoton naik


def test_regresi_logistik(df):
    # Terikat biner sintetis: Y di atas median = 1.
    d = df.copy()
    d["Ybin"] = (d["Y"] > d["Y"].median()).astype(int)
    result = ANALYSES["regresi_logistik"](d, {"dependent": "Ybin", "independents": ["X1", "X2"]})
    var_tbl = next(t for t in result["tables"] if t["id"] == "variables_in_equation")
    assert var_tbl["rows"][0][0] == "(Constant)"
    # Omnibus verdict konsisten dengan Sig.
    omnibus_p = result["tables"][0]["rows"][0][3]
    assert _verdict(result, "omnibus") == ("lolos" if omnibus_p < 0.05 else "tidak_lolos")


def test_uji_moderasi(df):
    result = ANALYSES["uji_moderasi"](df, {"dependent": "Y", "independent": "X1", "moderator": "X2"})
    coef = next(t for t in result["tables"] if t["id"] == "coefficients")
    names = [r[0] for r in coef["rows"]]
    assert "Interaksi" in names
    p_inter = next(r[4] for r in coef["rows"] if r[0] == "Interaksi")
    assert _verdict(result, "moderasi") == ("lolos" if p_inter < 0.05 else "tidak_lolos")


def test_uji_mediasi_deterministic(df):
    # Seed di-set run_analysis; panggilan langsung ANASES memakai numpy global → set manual.
    np.random.seed(42)
    r1 = ANALYSES["uji_mediasi"](df, {"dependent": "Y", "independent": "X1", "mediator": "X2"})
    r2 = ANALYSES["uji_mediasi"](df, {"dependent": "Y", "independent": "X1", "mediator": "X2"})
    eff1 = r1["tables"][1]["rows"][0]
    eff2 = r2["tables"][1]["rows"][0]
    # Bootstrap CI reproducible (seed hash dataset tetap) → identik antar run.
    assert eff1[4] == pytest.approx(eff2[4], abs=1e-9)
    assert eff1[5] == pytest.approx(eff2[5], abs=1e-9)

"""Uji normalitas: One-Sample K-S dengan koreksi Lilliefors + Shapiro-Wilk (+ P-P plot)."""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from ..contract import (
    AnalysisError,
    VERDICT_LOLOS,
    VERDICT_TIDAK_LOLOS,
    build_result,
    decision,
    fmt_id,
    table,
)
from ..io import listwise, require_arg

# statsmodels' Lilliefors table p-values are clipped to this range.
LILLIEFORS_P_MIN = 0.001
LILLIEFORS_P_MAX = 0.2


def _lilliefors(values) -> tuple[float, float, list[str]]:
    from statsmodels.stats.diagnostic import lilliefors

    stat, p = lilliefors(values, dist="norm", pvalmethod="table")
    notes = []
    if p <= LILLIEFORS_P_MIN:
        notes.append(
            "Nilai signifikansi K-S merupakan batas bawah tabel Lilliefors (p <= 0,001)."
        )
    elif p >= LILLIEFORS_P_MAX:
        notes.append(
            "Nilai signifikansi K-S merupakan batas atas tabel Lilliefors (p >= 0,2)."
        )
    return float(stat), float(p), notes


def _ks_decision(decision_id: str, label: str, p: float, subject: str) -> dict:
    normal = bool(p > 0.05)
    return decision(
        decision_id,
        label,
        "Asymp. Sig. (2-tailed) > 0,05",
        p,
        0.05,
        VERDICT_LOLOS if normal else VERDICT_TIDAK_LOLOS,
        (
            f"Nilai Asymp. Sig. (2-tailed) sebesar {fmt_id(p)} > 0,05 sehingga {subject} "
            "berdistribusi normal."
            if normal
            else f"Nilai Asymp. Sig. (2-tailed) sebesar {fmt_id(p)} < 0,05 sehingga {subject} "
            "tidak berdistribusi normal."
        ),
    )


def _pp_plot(resid: np.ndarray) -> None:
    import matplotlib.pyplot as plt

    z = np.sort((resid - resid.mean()) / resid.std(ddof=0))
    n = len(z)
    observed = (np.arange(1, n + 1) - 0.5) / n
    expected = stats.norm.cdf(z)
    plt.figure(figsize=(5, 5))
    plt.plot([0, 1], [0, 1], color="#888888", linewidth=1)
    plt.scatter(expected, observed, s=12)
    plt.xlabel("Expected Cum Prob")
    plt.ylabel("Observed Cum Prob")
    plt.title("Normal P-P Plot of Regression Standardized Residual")
    plt.show()
    plt.close("all")


def run(df: pd.DataFrame, args: dict) -> dict:
    mode = args.get("mode", "residual")
    if mode == "residual":
        return _run_residual(df, args)
    if mode == "variables":
        return _run_variables(df, args)
    raise AnalysisError("invalid_args", "Argumen 'mode' harus 'residual' atau 'variables'.")


def _run_residual(df: pd.DataFrame, args: dict) -> dict:
    from ._ols import prepare_ols

    model, sub, dependent, independents, warnings = prepare_ols(df, args)
    resid = np.asarray(model.resid)
    n = len(resid)

    ks_stat, ks_p, ks_notes = _lilliefors(resid)
    sw_stat, sw_p = stats.shapiro(resid)

    ks_table = table(
        "one_sample_ks",
        "One-Sample Kolmogorov-Smirnov Test",
        ["", "Unstandardized Residual"],
        [
            ["N", n],
            ["Normal Parameters: Mean", float(resid.mean())],
            ["Normal Parameters: Std. Deviation", float(pd.Series(resid).std(ddof=1))],
            ["Test Statistic", ks_stat],
            ["Asymp. Sig. (2-tailed)", ks_p],
        ],
        notes=[
            "a. Test distribution is Normal.",
            "b. Signifikansi dengan koreksi Lilliefors (SPSS parity).",
            *ks_notes,
        ],
    )
    sw_table = table(
        "shapiro_wilk",
        "Shapiro-Wilk Test",
        ["", "Statistic", "df", "Sig."],
        [["Unstandardized Residual", float(sw_stat), n, float(sw_p)]],
    )

    decisions = [
        _ks_decision(
            "normalitas_residual_ks",
            "Normalitas residual (K-S Lilliefors)",
            ks_p,
            f"residual regresi {dependent} atas {', '.join(independents)}",
        ),
        _ks_decision(
            "normalitas_residual_shapiro",
            "Normalitas residual (Shapiro-Wilk)",
            float(sw_p),
            "residual (menurut Shapiro-Wilk)",
        ),
    ]

    _pp_plot(resid)
    return build_result(
        "uji_normalitas", [ks_table, sw_table], decisions, n=n, warnings=warnings
    )


def _run_variables(df: pd.DataFrame, args: dict) -> dict:
    variables: list[str] = list(require_arg(args, "variables"))
    sub, warnings = listwise(df, variables)
    n = len(sub)

    rows = []
    decisions = []
    all_notes: list[str] = []
    for var in variables:
        values = np.asarray(sub[var], dtype=float)
        ks_stat, ks_p, ks_notes = _lilliefors(values)
        sw_stat, sw_p = stats.shapiro(values)
        for note in ks_notes:
            tagged = f"{var}: {note}"
            if tagged not in all_notes:
                all_notes.append(tagged)
        rows.append(
            [var, n, ks_stat, ks_p, float(sw_stat), float(sw_p), "Normal" if ks_p > 0.05 else "Tidak Normal"]
        )
        decisions.append(
            _ks_decision(f"normalitas_{var}", f"Normalitas variabel {var}", ks_p, f"variabel {var}")
        )

    tbl = table(
        "tests_of_normality",
        "Tests of Normality",
        [
            "Variabel",
            "N",
            "K-S Statistic",
            "K-S Asymp. Sig.",
            "Shapiro-Wilk Statistic",
            "Shapiro-Wilk Sig.",
            "Keterangan",
        ],
        rows,
        notes=["Signifikansi K-S menggunakan koreksi Lilliefors.", *all_notes],
    )
    return build_result("uji_normalitas", [tbl], decisions, n=n, warnings=warnings)

"""Uji heteroskedastisitas: uji Glejser + scatterplot SRESID x ZPRED."""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..contract import (
    VERDICT_LOLOS,
    VERDICT_TIDAK_LOLOS,
    build_result,
    decision,
    fmt_id,
    table,
)
from ._ols import prepare_ols


def _scatter_sresid_zpred(model) -> None:
    import matplotlib.pyplot as plt
    from statsmodels.stats.outliers_influence import OLSInfluence

    fitted = np.asarray(model.fittedvalues)
    zpred = (fitted - fitted.mean()) / fitted.std(ddof=1)
    sresid = np.asarray(OLSInfluence(model).resid_studentized_internal)
    plt.figure(figsize=(6, 5))
    plt.axhline(0, color="#888888", linewidth=1)
    plt.scatter(zpred, sresid, s=12)
    plt.xlabel("Regression Standardized Predicted Value (ZPRED)")
    plt.ylabel("Regression Studentized Residual (SRESID)")
    plt.title("Scatterplot")
    plt.show()
    plt.close("all")


def run(df: pd.DataFrame, args: dict) -> dict:
    import statsmodels.api as sm

    model, sub, dependent, independents, warnings = prepare_ols(df, args)
    n = len(sub)

    abs_resid = np.abs(np.asarray(model.resid))
    X = sm.add_constant(sub[independents].astype(float))
    glejser = sm.OLS(abs_resid, X).fit()

    sd_y = float(pd.Series(abs_resid).std(ddof=1))
    rows = [
        [
            "(Constant)",
            glejser.params["const"],
            glejser.bse["const"],
            None,
            glejser.tvalues["const"],
            glejser.pvalues["const"],
        ]
    ]
    decisions = []
    for var in independents:
        beta = float(glejser.params[var]) * float(sub[var].astype(float).std(ddof=1)) / sd_y
        p = float(glejser.pvalues[var])
        rows.append(
            [var, glejser.params[var], glejser.bse[var], beta, glejser.tvalues[var], p]
        )
        ok = bool(p > 0.05)
        decisions.append(
            decision(
                f"glejser_{var}",
                f"Heteroskedastisitas {var} (Glejser)",
                "Sig. > 0,05",
                p,
                0.05,
                VERDICT_LOLOS if ok else VERDICT_TIDAK_LOLOS,
                (
                    f"Nilai signifikansi variabel {var} pada uji Glejser sebesar {fmt_id(p)} > 0,05, "
                    "sehingga tidak terjadi gejala heteroskedastisitas."
                    if ok
                    else f"Nilai signifikansi variabel {var} pada uji Glejser sebesar {fmt_id(p)} < 0,05, "
                    "sehingga terjadi gejala heteroskedastisitas."
                ),
            )
        )

    tbl = table(
        "glejser_coefficients",
        "Uji Glejser (Coefficients)",
        ["Model", "B", "Std. Error", "Beta", "t", "Sig."],
        rows,
        notes=[f"a. Dependent Variable: ABS_RES (|residual| dari regresi {dependent})"],
    )

    _scatter_sresid_zpred(model)
    return build_result("uji_heteroskedastisitas", [tbl], decisions, n=n, warnings=warnings)

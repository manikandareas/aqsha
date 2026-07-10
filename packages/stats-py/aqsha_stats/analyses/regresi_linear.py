"""Regresi linear (SPSS parity): Model Summary, ANOVA, Coefficients + uji F/uji t."""

from __future__ import annotations

import math

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


def run(df: pd.DataFrame, args: dict) -> dict:
    model, sub, dependent, independents, warnings = prepare_ols(df, args)
    n = len(sub)
    k = len(independents)

    # Model Summary
    r = math.sqrt(float(model.rsquared))
    std_error = math.sqrt(float(model.mse_resid))
    summary_columns = ["R", "R Square", "Adjusted R Square", "Std. Error of the Estimate"]
    summary_row = [r, float(model.rsquared), float(model.rsquared_adj), std_error]
    if args.get("durbin_watson"):
        from statsmodels.stats.stattools import durbin_watson

        summary_columns.append("Durbin-Watson")
        summary_row.append(float(durbin_watson(model.resid)))
    model_summary = table(
        "model_summary",
        "Model Summary",
        summary_columns,
        [summary_row],
        notes=[
            f"a. Predictors: (Constant), {', '.join(independents)}",
            f"b. Dependent Variable: {dependent}",
        ],
    )

    # ANOVA
    f_stat = float(model.fvalue)
    f_sig = float(model.f_pvalue)
    anova = table(
        "anova",
        "ANOVA",
        ["Model", "Sum of Squares", "df", "Mean Square", "F", "Sig."],
        [
            ["Regression", float(model.ess), int(model.df_model), float(model.mse_model), f_stat, f_sig],
            ["Residual", float(model.ssr), int(model.df_resid), float(model.mse_resid), None, None],
            ["Total", float(model.centered_tss), n - 1, None, None, None],
        ],
        notes=[
            f"a. Dependent Variable: {dependent}",
            f"b. Predictors: (Constant), {', '.join(independents)}",
        ],
    )

    # Coefficients
    sd_y = float(sub[dependent].astype(float).std(ddof=1))
    coef_rows = [
        [
            "(Constant)",
            float(model.params["const"]),
            float(model.bse["const"]),
            None,
            float(model.tvalues["const"]),
            float(model.pvalues["const"]),
        ]
    ]
    decisions = [
        decision(
            "uji_f",
            "Uji F (simultan)",
            "Sig. < 0,05",
            f_sig,
            0.05,
            VERDICT_LOLOS if f_sig < 0.05 else VERDICT_TIDAK_LOLOS,
            (
                f"Nilai F hitung sebesar {fmt_id(f_stat)} dengan Sig. {fmt_id(f_sig)} < 0,05, "
                f"sehingga {', '.join(independents)} secara simultan berpengaruh signifikan "
                f"terhadap {dependent}."
                if f_sig < 0.05
                else f"Nilai F hitung sebesar {fmt_id(f_stat)} dengan Sig. {fmt_id(f_sig)} > 0,05, "
                f"sehingga {', '.join(independents)} secara simultan tidak berpengaruh signifikan "
                f"terhadap {dependent}."
            ),
        )
    ]
    for var in independents:
        b = float(model.params[var])
        beta = b * float(sub[var].astype(float).std(ddof=1)) / sd_y
        p = float(model.pvalues[var])
        coef_rows.append([var, b, float(model.bse[var]), beta, float(model.tvalues[var]), p])
        sig = bool(p < 0.05)
        decisions.append(
            decision(
                f"uji_t_{var}",
                f"Uji t (parsial) {var}",
                "Sig. < 0,05",
                p,
                0.05,
                VERDICT_LOLOS if sig else VERDICT_TIDAK_LOLOS,
                (
                    f"Variabel {var} memiliki nilai t hitung {fmt_id(float(model.tvalues[var]))} "
                    f"dengan Sig. {fmt_id(p)} < 0,05, sehingga {var} secara parsial berpengaruh "
                    f"signifikan terhadap {dependent}."
                    if sig
                    else f"Variabel {var} memiliki nilai t hitung {fmt_id(float(model.tvalues[var]))} "
                    f"dengan Sig. {fmt_id(p)} > 0,05, sehingga {var} secara parsial tidak "
                    f"berpengaruh signifikan terhadap {dependent}."
                ),
            )
        )
    coefficients = table(
        "coefficients",
        "Coefficients",
        ["Model", "B", "Std. Error", "Beta", "t", "Sig."],
        coef_rows,
        notes=[f"a. Dependent Variable: {dependent}"],
    )

    const = float(model.params["const"])
    terms = " ".join(
        f"{'+' if float(model.params[v]) >= 0 else '-'} {fmt_id(abs(float(model.params[v])))}{v}"
        for v in independents
    )
    equation = f"{dependent} = {fmt_id(const)} {terms}"
    decisions.append(
        decision(
            "persamaan_regresi",
            "Persamaan regresi",
            "Y = a + b1X1 + ... + bkXk",
            None,
            None,
            VERDICT_LOLOS,
            f"Persamaan regresi yang diperoleh adalah {equation}.",
        )
    )

    return build_result(
        "regresi_linear",
        [model_summary, anova, coefficients],
        decisions,
        n=n,
        warnings=warnings,
        extra_meta={"equation": equation, "k": k},
    )

"""Uji moderasi (MRA — Moderated Regression Analysis): Y ~ X + M + X*M (mean-centered)."""

from __future__ import annotations

import pandas as pd

from ..contract import (
    VERDICT_LOLOS,
    VERDICT_TIDAK_LOLOS,
    build_result,
    decision,
    fmt_id,
    table,
)
from ..io import listwise, require_arg


def run(df: pd.DataFrame, args: dict) -> dict:
    import statsmodels.api as sm

    dependent = str(require_arg(args, "dependent"))
    independent = str(require_arg(args, "independent"))
    moderator = str(require_arg(args, "moderator"))
    sub, warnings = listwise(df, [dependent, independent, moderator])
    y = sub[dependent].astype(float)
    xc = sub[independent].astype(float) - sub[independent].astype(float).mean()
    mc = sub[moderator].astype(float) - sub[moderator].astype(float).mean()
    inter = xc * mc
    n = len(sub)

    # Model 1: efek utama (X, M). Model 2: + interaksi.
    x1 = sm.add_constant(pd.DataFrame({independent: xc, moderator: mc}))
    m1 = sm.OLS(y, x1).fit()
    x2 = sm.add_constant(
        pd.DataFrame({independent: xc, moderator: mc, "Interaksi": inter})
    )
    m2 = sm.OLS(y, x2).fit()

    r2_change = float(m2.rsquared) - float(m1.rsquared)
    summary = table(
        "model_summary",
        "Model Summary",
        ["Model", "R", "R Square", "Adjusted R Square", "R Square Change"],
        [
            ["1 (efek utama)", float(m1.rsquared) ** 0.5, float(m1.rsquared), float(m1.rsquared_adj), None],
            ["2 (+ interaksi)", float(m2.rsquared) ** 0.5, float(m2.rsquared), float(m2.rsquared_adj), r2_change],
        ],
        notes=[
            "Model 1 = X + M (mean-centered). Model 2 menambah suku interaksi X*M.",
            f"a. Dependent Variable: {dependent}",
        ],
    )
    coef_rows = []
    for name in ["const", independent, moderator, "Interaksi"]:
        coef_rows.append(
            [
                "(Constant)" if name == "const" else name,
                float(m2.params[name]),
                float(m2.bse[name]),
                float(m2.tvalues[name]),
                float(m2.pvalues[name]),
            ]
        )
    coefficients = table(
        "coefficients",
        "Coefficients (Model 2)",
        ["Model", "B", "Std. Error", "t", "Sig."],
        coef_rows,
        notes=[f"a. Dependent Variable: {dependent}"],
    )

    p_inter = float(m2.pvalues["Interaksi"])
    sig = bool(p_inter < 0.05)
    decisions = [
        decision(
            "moderasi",
            f"Efek moderasi {moderator} pada {independent} → {dependent}",
            "Sig. interaksi < 0,05",
            p_inter,
            0.05,
            VERDICT_LOLOS if sig else VERDICT_TIDAK_LOLOS,
            (
                f"Suku interaksi (X*M) memiliki Sig. {fmt_id(p_inter)} < 0,05 dan R Square meningkat "
                f"{fmt_id(r2_change)} pada Model 2, sehingga {moderator} MEMODERASI pengaruh {independent} "
                f"terhadap {dependent}."
                if sig
                else f"Suku interaksi (X*M) memiliki Sig. {fmt_id(p_inter)} > 0,05, sehingga {moderator} "
                f"TIDAK memoderasi pengaruh {independent} terhadap {dependent}."
            ),
        )
    ]
    return build_result("uji_moderasi", [summary, coefficients], decisions, n=n, warnings=warnings)

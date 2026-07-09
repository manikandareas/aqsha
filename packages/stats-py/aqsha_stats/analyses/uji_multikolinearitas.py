"""Uji multikolinearitas: Tolerance dan VIF dari regresi auxiliary."""

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
from ._ols import prepare_ols


def run(df: pd.DataFrame, args: dict) -> dict:
    import statsmodels.api as sm

    _model, sub, dependent, independents, warnings = prepare_ols(df, args)
    n = len(sub)

    rows = []
    decisions = []
    for var in independents:
        others = [v for v in independents if v != var]
        if others:
            aux = sm.OLS(
                sub[var].astype(float), sm.add_constant(sub[others].astype(float))
            ).fit()
            r2 = float(aux.rsquared)
        else:
            r2 = 0.0
        tolerance = 1.0 - r2
        vif = 1.0 / tolerance if tolerance > 0 else float("inf")
        ok = bool(tolerance > 0.10 and vif < 10)
        rows.append([var, tolerance, vif])
        decisions.append(
            decision(
                f"vif_{var}",
                f"Multikolinearitas {var}",
                "Tolerance > 0,10 dan VIF < 10",
                vif,
                10,
                VERDICT_LOLOS if ok else VERDICT_TIDAK_LOLOS,
                (
                    f"Nilai Tolerance variabel {var} sebesar {fmt_id(tolerance)} > 0,10 dan VIF "
                    f"sebesar {fmt_id(vif)} < 10, sehingga tidak terjadi gejala multikolinearitas."
                    if ok
                    else f"Nilai Tolerance variabel {var} sebesar {fmt_id(tolerance)} dan VIF "
                    f"sebesar {fmt_id(vif)} melampaui ambang, sehingga terjadi gejala "
                    "multikolinearitas."
                ),
            )
        )
    if len(independents) == 1:
        warnings = warnings + [
            "Hanya satu variabel independen; multikolinearitas tidak relevan (VIF = 1)."
        ]

    tbl = table(
        "collinearity_statistics",
        "Uji Multikolinearitas (Collinearity Statistics)",
        ["Variabel", "Tolerance", "VIF"],
        rows,
        notes=[f"a. Dependent Variable: {dependent}"],
    )
    return build_result("uji_multikolinearitas", [tbl], decisions, n=n, warnings=warnings)

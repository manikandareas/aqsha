"""Uji autokorelasi: Durbin-Watson vs tabel Savin-White (alpha 0,05)."""

from __future__ import annotations

import pandas as pd

from ..contract import (
    VERDICT_LOLOS,
    VERDICT_PERHATIAN,
    VERDICT_TIDAK_LOLOS,
    build_result,
    decision,
    fmt_id,
    table,
)
from ..tables import dw_bounds
from ._ols import prepare_ols


def run(df: pd.DataFrame, args: dict) -> dict:
    from statsmodels.stats.stattools import durbin_watson

    alpha = float(args.get("alpha", 0.05))
    model, sub, dependent, independents, warnings = prepare_ols(df, args)
    n = len(sub)
    k = len(independents)

    dw = float(durbin_watson(model.resid))
    dl, du, table_notes = dw_bounds(n, k, alpha)
    warnings = warnings + table_notes

    if du < dw < 4 - du:
        verdict = VERDICT_LOLOS
        interp = (
            f"Nilai Durbin-Watson sebesar {fmt_id(dw)} berada di antara dU ({fmt_id(du)}) dan "
            f"4-dU ({fmt_id(4 - du)}), sehingga tidak terjadi gejala autokorelasi."
        )
    elif dw < dl:
        verdict = VERDICT_TIDAK_LOLOS
        interp = (
            f"Nilai Durbin-Watson sebesar {fmt_id(dw)} lebih kecil dari dL ({fmt_id(dl)}), "
            "sehingga terdapat autokorelasi positif."
        )
    elif dw > 4 - dl:
        verdict = VERDICT_TIDAK_LOLOS
        interp = (
            f"Nilai Durbin-Watson sebesar {fmt_id(dw)} lebih besar dari 4-dL ({fmt_id(4 - dl)}), "
            "sehingga terdapat autokorelasi negatif."
        )
    else:
        verdict = VERDICT_PERHATIAN
        interp = (
            f"Nilai Durbin-Watson sebesar {fmt_id(dw)} berada pada zona ragu-ragu, sehingga "
            "hasil uji autokorelasi tidak dapat disimpulkan."
        )

    tbl = table(
        "durbin_watson",
        "Uji Autokorelasi (Durbin-Watson)",
        ["n", "k", "Durbin-Watson", "dL", "dU", "4-dU", "4-dL"],
        [[n, k, dw, dl, du, 4 - du, 4 - dl]],
        notes=[
            f"a. Dependent Variable: {dependent}",
            "b. dL/dU dari tabel Savin-White, taraf signifikansi 0,05.",
        ],
    )
    decisions = [
        decision(
            "autokorelasi",
            "Autokorelasi (Durbin-Watson)",
            "dU < DW < 4 - dU",
            dw,
            du,
            verdict,
            interp,
        )
    ]
    return build_result("uji_autokorelasi", [tbl], decisions, n=n, warnings=warnings)

"""Uji reliabilitas: Cronbach's alpha + SPSS Item-Total Statistics."""

from __future__ import annotations

import pandas as pd
from scipy import stats

from ..contract import (
    VERDICT_LOLOS,
    VERDICT_TIDAK_LOLOS,
    build_result,
    decision,
    fmt_id,
    table,
)
from ..io import listwise, require_arg


def _cronbach(frame: pd.DataFrame) -> float:
    k = frame.shape[1]
    item_vars = frame.var(axis=0, ddof=1).sum()
    total_var = frame.sum(axis=1).var(ddof=1)
    return k / (k - 1) * (1 - item_vars / total_var)


def run(df: pd.DataFrame, args: dict) -> dict:
    items: list[str] = list(require_arg(args, "items"))
    if len(items) < 2:
        from ..contract import AnalysisError

        raise AnalysisError("invalid_args", "Uji reliabilitas membutuhkan minimal 2 item.")
    sub, warnings = listwise(df, items)
    n = len(sub)

    import pingouin as pg

    alpha_val, ci = pg.cronbach_alpha(data=sub[items])
    total = sub[items].sum(axis=1)

    item_rows = []
    for item in items:
        rest_items = [i for i in items if i != item]
        rest = total - sub[item]
        r_corrected, _ = stats.pearsonr(sub[item], rest)
        alpha_if_deleted = _cronbach(sub[rest_items]) if len(rest_items) >= 2 else None
        item_rows.append(
            [item, rest.mean(), rest.var(ddof=1), r_corrected, alpha_if_deleted]
        )

    reliability_table = table(
        "reliability_statistics",
        "Reliability Statistics",
        ["Cronbach's Alpha", "N of Items"],
        [[alpha_val, len(items)]],
        notes=[f"95% CI Cronbach's Alpha: [{fmt_id(ci[0])}; {fmt_id(ci[1])}]."],
    )
    item_total_table = table(
        "item_total_statistics",
        "Item-Total Statistics",
        [
            "Item",
            "Scale Mean if Item Deleted",
            "Scale Variance if Item Deleted",
            "Corrected Item-Total Correlation",
            "Cronbach's Alpha if Item Deleted",
        ],
        item_rows,
    )

    reliable = bool(alpha_val >= 0.60)
    note_070 = (
        "juga memenuhi ambang 0,70"
        if alpha_val >= 0.70
        else "namun belum memenuhi ambang yang lebih ketat 0,70"
    )
    decisions = [
        decision(
            "reliabilitas",
            "Reliabilitas instrumen (Cronbach's Alpha)",
            "Cronbach's Alpha >= 0,60",
            alpha_val,
            0.60,
            VERDICT_LOLOS if reliable else VERDICT_TIDAK_LOLOS,
            (
                f"Nilai Cronbach's Alpha sebesar {fmt_id(alpha_val)} > 0,60 sehingga instrumen "
                f"dinyatakan reliabel ({note_070})."
                if reliable
                else f"Nilai Cronbach's Alpha sebesar {fmt_id(alpha_val)} < 0,60 sehingga instrumen "
                "dinyatakan tidak reliabel."
            ),
        )
    ]
    return build_result(
        "uji_reliabilitas",
        [reliability_table, item_total_table],
        decisions,
        n=n,
        warnings=warnings,
    )

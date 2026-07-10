"""Uji Kruskal-Wallis H (non-parametrik, ≥3 kelompok independen — pengganti one-way ANOVA)."""

from __future__ import annotations

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
from ._groups import numeric_by_group


def run(df: pd.DataFrame, args: dict) -> dict:
    dependent = str(args.get("dependent") or "")
    group = str(args.get("group") or "")
    if not dependent or not group:
        raise AnalysisError("invalid_args", "uji_kruskal_wallis butuh 'dependent' dan 'group'.")
    levels, series, n, warnings = numeric_by_group(df, dependent, group, min_groups=2)

    combined = pd.concat(series)
    ranks = combined.rank()
    mean_ranks = []
    start = 0
    for lvl, s in zip(levels, series):
        r = ranks.iloc[start : start + len(s)]
        mean_ranks.append([lvl, len(s), float(r.mean())])
        start += len(s)

    h_stat, p = stats.kruskal(*series)
    ranks_tbl = table("ranks", "Ranks", [group, "N", "Mean Rank"], mean_ranks)
    test_tbl = table(
        "test_statistics",
        "Test Statistics",
        ["Kruskal-Wallis H", "df", "Asymp. Sig."],
        [[float(h_stat), len(levels) - 1, float(p)]],
        notes=[f"a. Grouping Variable: {group}"],
    )
    sig = bool(p < 0.05)
    decisions = [
        decision(
            "kruskal_wallis",
            f"Perbedaan {dependent} antar {group}",
            "Asymp. Sig. < 0,05",
            float(p),
            0.05,
            VERDICT_LOLOS if sig else VERDICT_TIDAK_LOLOS,
            (
                f"Nilai Chi-Square (H) {fmt_id(float(h_stat))} dengan Asymp. Sig. {fmt_id(float(p))} < 0,05, "
                f"sehingga terdapat perbedaan {dependent} yang signifikan antar kategori {group}."
                if sig
                else f"Nilai Chi-Square (H) {fmt_id(float(h_stat))} dengan Asymp. Sig. {fmt_id(float(p))} > 0,05, "
                f"sehingga tidak terdapat perbedaan {dependent} yang signifikan antar kategori {group}."
            ),
        )
    ]
    return build_result("uji_kruskal_wallis", [ranks_tbl, test_tbl], decisions, n=n, warnings=warnings)

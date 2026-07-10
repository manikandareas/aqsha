"""One-Way ANOVA + uji homogenitas (Levene) + post-hoc Tukey HSD."""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from ..contract import (
    VERDICT_LOLOS,
    VERDICT_PERHATIAN,
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
        from ..contract import AnalysisError

        raise AnalysisError("invalid_args", "uji_anova butuh 'dependent' dan 'group'.")
    levels, series, n, warnings = numeric_by_group(df, dependent, group, min_groups=2)

    # Descriptives per grup.
    desc = table(
        "descriptives",
        "Descriptives",
        [group, "N", "Mean", "Std. Deviation"],
        [[lvl, len(s), float(s.mean()), float(s.std(ddof=1))] for lvl, s in zip(levels, series)],
    )

    lev_stat, lev_p = stats.levene(*series, center="mean")
    homogeneity = table(
        "levene",
        "Test of Homogeneity of Variances",
        ["Levene Statistic", "df1", "df2", "Sig."],
        [[float(lev_stat), len(levels) - 1, n - len(levels), float(lev_p)]],
    )

    # ANOVA table (between/within/total).
    grand = np.concatenate([s.to_numpy() for s in series])
    grand_mean = grand.mean()
    ss_between = sum(len(s) * (float(s.mean()) - grand_mean) ** 2 for s in series)
    ss_within = sum(float(((s - s.mean()) ** 2).sum()) for s in series)
    df_between = len(levels) - 1
    df_within = n - len(levels)
    ms_between = ss_between / df_between
    ms_within = ss_within / df_within if df_within > 0 else float("nan")
    f_stat, f_p = stats.f_oneway(*series)
    anova = table(
        "anova",
        "ANOVA",
        ["Sumber", "Sum of Squares", "df", "Mean Square", "F", "Sig."],
        [
            ["Between Groups", ss_between, df_between, ms_between, float(f_stat), float(f_p)],
            ["Within Groups", ss_within, df_within, ms_within, None, None],
            ["Total", ss_between + ss_within, n - 1, None, None, None],
        ],
        notes=[f"a. Dependent Variable: {dependent}"],
    )

    tables = [desc, homogeneity, anova]
    decisions = [
        decision(
            "homogenitas",
            "Homogenitas varian (Levene)",
            "Sig. > 0,05",
            float(lev_p),
            0.05,
            VERDICT_LOLOS if lev_p > 0.05 else VERDICT_PERHATIAN,
            (
                f"Uji Levene Sig. {fmt_id(float(lev_p))} > 0,05 → varian antar kelompok homogen "
                "(asumsi ANOVA terpenuhi)."
                if lev_p > 0.05
                else f"Uji Levene Sig. {fmt_id(float(lev_p))} < 0,05 → varian tidak homogen; "
                "pertimbangkan uji Welch/Games-Howell atau non-parametrik (Kruskal-Wallis)."
            ),
        ),
        decision(
            "anova_f",
            f"Perbedaan {dependent} antar {group}",
            "Sig. < 0,05",
            float(f_p),
            0.05,
            VERDICT_LOLOS if f_p < 0.05 else VERDICT_TIDAK_LOLOS,
            (
                f"Nilai F sebesar {fmt_id(float(f_stat))} dengan Sig. {fmt_id(float(f_p))} < 0,05, "
                f"sehingga terdapat perbedaan {dependent} yang signifikan antar kategori {group}."
                if f_p < 0.05
                else f"Nilai F sebesar {fmt_id(float(f_stat))} dengan Sig. {fmt_id(float(f_p))} > 0,05, "
                f"sehingga tidak terdapat perbedaan {dependent} yang signifikan antar kategori {group}."
            ),
        ),
    ]

    # Post-hoc Tukey HSD hanya bila ANOVA signifikan (konvensi).
    if f_p < 0.05 and n - len(levels) > 0:
        tukey = _tukey(series, levels)
        if tukey is not None:
            tables.append(tukey)

    return build_result("uji_anova", tables, decisions, n=n, warnings=warnings)


def _tukey(series: list[pd.Series], levels: list[str]):
    from statsmodels.stats.multicomp import pairwise_tukeyhsd

    values = np.concatenate([s.to_numpy() for s in series])
    labels = np.concatenate([[lvl] * len(s) for lvl, s in zip(levels, series)])
    res = pairwise_tukeyhsd(values, labels, alpha=0.05)
    rows = []
    for row in res.summary().data[1:]:
        g1, g2, meandiff, p_adj, lower, upper, reject = row
        rows.append([str(g1), str(g2), float(meandiff), float(p_adj), float(lower), float(upper),
                     "Ya" if bool(reject) else "Tidak"])
    return table(
        "tukey",
        "Multiple Comparisons (Tukey HSD)",
        ["Grup 1", "Grup 2", "Mean Difference", "Sig.", "Lower", "Upper", "Berbeda signifikan"],
        rows,
        notes=["Berbeda signifikan = Ya bila Sig. < 0,05 (pasangan berbeda nyata)."],
    )

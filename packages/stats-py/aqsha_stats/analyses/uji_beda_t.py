"""Uji beda rata-rata t: Independent-Samples t Test (+ Levene) atau Paired-Samples t Test."""

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
from ._groups import numeric_by_group, paired_columns


def _independent(df: pd.DataFrame, args: dict) -> dict:
    dependent = str(args.get("dependent") or "")
    group = str(args.get("group") or "")
    if not dependent or not group:
        raise AnalysisError("invalid_args", "Mode independent butuh 'dependent' dan 'group'.")
    levels, series, n, warnings = numeric_by_group(df, dependent, group, min_groups=2)
    if len(levels) != 2:
        raise AnalysisError(
            "invalid_args",
            f"Independent-samples t test butuh TEPAT 2 kategori grup; ditemukan {len(levels)} "
            f"({', '.join(levels)}). Untuk >2 grup gunakan uji_anova.",
        )
    a, b = series
    lev_stat, lev_p = stats.levene(a, b, center="mean")
    equal_var = bool(lev_p > 0.05)
    t_stat, t_p = stats.ttest_ind(a, b, equal_var=equal_var)
    mean_diff = float(a.mean() - b.mean())

    group_stats = table(
        "group_statistics",
        "Group Statistics",
        [group, "N", "Mean", "Std. Deviation", "Std. Error Mean"],
        [
            [lvl, len(s), float(s.mean()), float(s.std(ddof=1)), float(s.sem())]
            for lvl, s in zip(levels, series)
        ],
    )
    row_label = "Equal variances assumed" if equal_var else "Equal variances not assumed"
    test_tbl = table(
        "independent_samples_test",
        "Independent Samples Test",
        ["", "Levene F", "Levene Sig.", "t", "df", "Sig. (2-tailed)", "Mean Difference"],
        [[row_label, float(lev_stat), float(lev_p), float(t_stat), _welch_df(a, b, equal_var),
          float(t_p), mean_diff]],
        notes=[f"a. Levene Sig. {fmt_id(float(lev_p))} → varian {'homogen' if equal_var else 'tidak homogen'}; baris '{row_label}' dipakai."],
    )

    sig = bool(t_p < 0.05)
    decisions = [
        decision(
            "levene",
            "Homogenitas varian (Levene)",
            "Sig. > 0,05",
            float(lev_p),
            0.05,
            VERDICT_LOLOS if equal_var else VERDICT_TIDAK_LOLOS,
            (
                f"Uji Levene menghasilkan Sig. {fmt_id(float(lev_p))} > 0,05 sehingga varian kedua "
                "kelompok homogen (asumsi equal variances terpenuhi)."
                if equal_var
                else f"Uji Levene menghasilkan Sig. {fmt_id(float(lev_p))} < 0,05 sehingga varian tidak "
                "homogen; dipakai hasil equal variances not assumed."
            ),
        ),
        decision(
            "uji_beda",
            f"Perbedaan {dependent} antar {group}",
            "Sig. (2-tailed) < 0,05",
            float(t_p),
            0.05,
            VERDICT_LOLOS if sig else VERDICT_TIDAK_LOLOS,
            (
                f"Nilai t sebesar {fmt_id(float(t_stat))} dengan Sig. {fmt_id(float(t_p))} < 0,05, "
                f"sehingga terdapat perbedaan {dependent} yang signifikan antara {levels[0]} dan {levels[1]} "
                f"(selisih rata-rata {fmt_id(mean_diff)})."
                if sig
                else f"Nilai t sebesar {fmt_id(float(t_stat))} dengan Sig. {fmt_id(float(t_p))} > 0,05, "
                f"sehingga tidak terdapat perbedaan {dependent} yang signifikan antara {levels[0]} dan {levels[1]}."
            ),
        ),
    ]
    return build_result("uji_beda_t", [group_stats, test_tbl], decisions, n=n, warnings=warnings)


def _welch_df(a: pd.Series, b: pd.Series, equal_var: bool) -> float:
    n1, n2 = len(a), len(b)
    if equal_var:
        return float(n1 + n2 - 2)
    v1, v2 = a.var(ddof=1), b.var(ddof=1)
    num = (v1 / n1 + v2 / n2) ** 2
    den = (v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1)
    return float(num / den) if den > 0 else float(n1 + n2 - 2)


def _paired(df: pd.DataFrame, args: dict) -> dict:
    pre, post, a, b, n, warnings = paired_columns(df, args)
    diff = a - b
    t_stat, t_p = stats.ttest_rel(a, b)
    r, _ = stats.pearsonr(a, b)

    stats_tbl = table(
        "paired_statistics",
        "Paired Samples Statistics",
        ["", "Mean", "N", "Std. Deviation", "Std. Error Mean"],
        [
            [pre, float(a.mean()), n, float(a.std(ddof=1)), float(a.sem())],
            [post, float(b.mean()), n, float(b.std(ddof=1)), float(b.sem())],
        ],
    )
    test_tbl = table(
        "paired_samples_test",
        "Paired Samples Test",
        ["", "Mean", "Std. Deviation", "Korelasi", "t", "df", "Sig. (2-tailed)"],
        [[f"{pre} - {post}", float(diff.mean()), float(diff.std(ddof=1)), float(r),
          float(t_stat), n - 1, float(t_p)]],
    )
    sig = bool(t_p < 0.05)
    decisions = [
        decision(
            "uji_beda_paired",
            f"Perbedaan {pre} dan {post}",
            "Sig. (2-tailed) < 0,05",
            float(t_p),
            0.05,
            VERDICT_LOLOS if sig else VERDICT_TIDAK_LOLOS,
            (
                f"Nilai t sebesar {fmt_id(float(t_stat))} dengan Sig. {fmt_id(float(t_p))} < 0,05, "
                f"sehingga terdapat perbedaan yang signifikan antara {pre} dan {post} "
                f"(selisih rata-rata {fmt_id(float(diff.mean()))})."
                if sig
                else f"Nilai t sebesar {fmt_id(float(t_stat))} dengan Sig. {fmt_id(float(t_p))} > 0,05, "
                f"sehingga tidak terdapat perbedaan yang signifikan antara {pre} dan {post}."
            ),
        )
    ]
    return build_result("uji_beda_t", [stats_tbl, test_tbl], decisions, n=n, warnings=warnings)


def run(df: pd.DataFrame, args: dict) -> dict:
    mode = args.get("mode", "independent")
    if mode == "paired":
        return _paired(df, args)
    if mode == "independent":
        return _independent(df, args)
    raise AnalysisError("invalid_args", "Argumen 'mode' harus 'independent' atau 'paired'.")

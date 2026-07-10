"""Uji Mann-Whitney U (non-parametrik, 2 kelompok independen — pengganti t independent)."""

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
from ._groups import numeric_by_group


def run(df: pd.DataFrame, args: dict) -> dict:
    dependent = str(args.get("dependent") or "")
    group = str(args.get("group") or "")
    if not dependent or not group:
        raise AnalysisError("invalid_args", "uji_mann_whitney butuh 'dependent' dan 'group'.")
    levels, series, n, warnings = numeric_by_group(df, dependent, group, min_groups=2)
    if len(levels) != 2:
        raise AnalysisError(
            "invalid_args",
            f"Mann-Whitney butuh TEPAT 2 kategori grup; ditemukan {len(levels)}. Untuk >2 grup pakai uji_kruskal_wallis.",
        )
    a, b = series
    # Mean rank (gaya SPSS Ranks table).
    combined = pd.concat([a, b])
    ranks = combined.rank()
    ra = ranks.iloc[: len(a)]
    rb = ranks.iloc[len(a) :]
    u_stat, p = stats.mannwhitneyu(a, b, alternative="two-sided")

    ranks_tbl = table(
        "ranks",
        "Ranks",
        [group, "N", "Mean Rank", "Sum of Ranks"],
        [
            [levels[0], len(a), float(ra.mean()), float(ra.sum())],
            [levels[1], len(b), float(rb.mean()), float(rb.sum())],
        ],
    )
    # Z aproksimasi normal (SPSS menampilkan Z).
    n1, n2 = len(a), len(b)
    mu = n1 * n2 / 2
    sigma = np.sqrt(n1 * n2 * (n1 + n2 + 1) / 12)
    z = (float(u_stat) - mu) / sigma if sigma > 0 else float("nan")
    test_tbl = table(
        "test_statistics",
        "Test Statistics",
        ["Mann-Whitney U", "Z", "Asymp. Sig. (2-tailed)"],
        [[float(u_stat), z, float(p)]],
        notes=[f"a. Grouping Variable: {group}"],
    )
    sig = bool(p < 0.05)
    decisions = [
        decision(
            "mann_whitney",
            f"Perbedaan {dependent} antar {group}",
            "Asymp. Sig. < 0,05",
            float(p),
            0.05,
            VERDICT_LOLOS if sig else VERDICT_TIDAK_LOLOS,
            (
                f"Nilai Asymp. Sig. {fmt_id(float(p))} < 0,05, sehingga terdapat perbedaan {dependent} "
                f"yang signifikan antara {levels[0]} dan {levels[1]} (mean rank {fmt_id(float(ra.mean()))} vs {fmt_id(float(rb.mean()))})."
                if sig
                else f"Nilai Asymp. Sig. {fmt_id(float(p))} > 0,05, sehingga tidak terdapat perbedaan {dependent} "
                f"yang signifikan antara {levels[0]} dan {levels[1]}."
            ),
        )
    ]
    return build_result("uji_mann_whitney", [ranks_tbl, test_tbl], decisions, n=n, warnings=warnings)

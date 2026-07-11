"""Uji linearitas: SPSS Means -> Test for Linearity (ANOVA table)."""

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
from ..io import listwise, require_arg


def run(df: pd.DataFrame, args: dict) -> dict:
    dependent: str = require_arg(args, "dependent")
    independent: str = require_arg(args, "independent")
    sub, warnings = listwise(df, [dependent, independent])
    n = len(sub)

    y = sub[dependent].astype(float)
    x = sub[independent].astype(float)
    groups = y.groupby(x)
    g = groups.ngroups
    if g < 3:
        raise AnalysisError(
            "insufficient_groups",
            f"Uji linearitas membutuhkan minimal 3 nilai unik pada {independent}; ditemukan {g}.",
        )
    # Within df = n - g. Bila setiap nilai X unik (X kontinu), g == n → df_within = 0 →
    # ms_within = 0/0 (ZeroDivisionError). Uji linearitas menuntut X ordinal/kategorik
    # dengan pengulangan; tolak X kontinu secara rapi.
    if n - g < 1:
        raise AnalysisError(
            "insufficient_data",
            f"Uji linearitas butuh nilai {independent} yang berulang (within df = {n - g}); "
            f"{independent} tampak kontinu/nyaris unik. Gunakan variabel ordinal/kategorik.",
        )

    ss_total = float(((y - y.mean()) ** 2).sum())
    ss_within = float(sum(((vals - vals.mean()) ** 2).sum() for _, vals in groups))
    ss_combined = ss_total - ss_within
    # Tak ada variasi Y di dalam kelompok nilai X (mis. Y deterministik per X) → ms_within = 0 →
    # pembagian F meledak (ZeroDivisionError float native). Tolak rapi alih-alih error "internal".
    if ss_within == 0:
        raise AnalysisError(
            "insufficient_variance",
            f"Tidak ada variasi {dependent} di dalam kelompok nilai {independent} "
            "(within-group Sum of Squares = 0), sehingga uji F linearitas tak dapat dihitung.",
        )

    # SS linearity = regression sum of squares of y ~ x.
    sxx = float(((x - x.mean()) ** 2).sum())
    sxy = float(((x - x.mean()) * (y - y.mean())).sum())
    ss_linearity = sxy**2 / sxx
    ss_deviation = ss_combined - ss_linearity

    df_combined, df_lin, df_dev, df_within = g - 1, 1, g - 2, n - g
    ms_within = ss_within / df_within
    ms_combined = ss_combined / df_combined
    ms_lin = ss_linearity / df_lin
    ms_dev = ss_deviation / df_dev

    f_combined = ms_combined / ms_within
    f_lin = ms_lin / ms_within
    f_dev = ms_dev / ms_within
    sig_combined = float(stats.f.sf(f_combined, df_combined, df_within))
    sig_lin = float(stats.f.sf(f_lin, df_lin, df_within))
    sig_dev = float(stats.f.sf(f_dev, df_dev, df_within))

    tbl = table(
        "anova_linearity",
        f"ANOVA Table ({dependent} * {independent})",
        ["Sumber", "Sum of Squares", "df", "Mean Square", "F", "Sig."],
        [
            ["Between Groups (Combined)", ss_combined, df_combined, ms_combined, f_combined, sig_combined],
            ["Linearity", ss_linearity, df_lin, ms_lin, f_lin, sig_lin],
            ["Deviation from Linearity", ss_deviation, df_dev, ms_dev, f_dev, sig_dev],
            ["Within Groups", ss_within, df_within, ms_within, None, None],
            ["Total", ss_total, n - 1, None, None, None],
        ],
    )

    linear = bool(sig_dev > 0.05)
    decisions = [
        decision(
            "linearitas",
            f"Linearitas {dependent} * {independent}",
            "Sig. Deviation from Linearity > 0,05",
            sig_dev,
            0.05,
            VERDICT_LOLOS if linear else VERDICT_TIDAK_LOLOS,
            (
                f"Nilai Sig. Deviation from Linearity sebesar {fmt_id(sig_dev)} > 0,05, sehingga "
                f"terdapat hubungan yang linear antara {independent} dan {dependent}."
                if linear
                else f"Nilai Sig. Deviation from Linearity sebesar {fmt_id(sig_dev)} < 0,05, "
                f"sehingga hubungan antara {independent} dan {dependent} tidak linear."
            ),
        )
    ]
    return build_result("uji_linearitas", [tbl], decisions, n=n, warnings=warnings)

"""Shared helpers for group-comparison analyses (t-test, ANOVA, non-parametric)."""

from __future__ import annotations

import pandas as pd

from ..contract import AnalysisError
from ..io import require_arg, require_columns


def numeric_by_group(
    df: pd.DataFrame, dependent: str, group: str, min_groups: int = 2
) -> tuple[list[str], list[pd.Series], int, list[str]]:
    """Split `dependent` (numeric) by levels of `group` (categorical).

    Returns (level_labels, level_series, n_valid, warnings). Drops rows with missing
    dependent/group (listwise on the two columns), sorts levels by label for stable output.
    """
    require_columns(df, [dependent, group])
    sub = df[[dependent, group]].dropna()
    dropped = len(df) - len(sub)
    warnings: list[str] = []
    if dropped > 0:
        warnings.append(f"{dropped} baris dengan data kosong dikeluarkan (listwise deletion).")

    values = pd.to_numeric(sub[dependent], errors="coerce")
    sub = sub.assign(**{dependent: values}).dropna(subset=[dependent])

    levels = sorted(str(v) for v in sub[group].unique())
    if len(levels) < min_groups:
        raise AnalysisError(
            "invalid_args",
            f"Kolom grup '{group}' hanya punya {len(levels)} kategori; "
            f"analisis membutuhkan minimal {min_groups} kategori.",
        )
    series = [sub.loc[sub[group].astype(str) == lvl, dependent].astype(float) for lvl in levels]
    for lvl, s in zip(levels, series):
        if len(s) < 2:
            raise AnalysisError(
                "insufficient_data",
                f"Kategori '{lvl}' pada '{group}' hanya punya {len(s)} data; tidak cukup untuk diuji.",
            )
    return levels, series, len(sub), warnings


def paired_columns(df: pd.DataFrame, args: dict) -> tuple[str, str, pd.Series, pd.Series, int, list[str]]:
    """Two paired numeric columns (`pre`, `post`) with listwise deletion."""
    pre = str(require_arg(args, "pre"))
    post = str(require_arg(args, "post"))
    require_columns(df, [pre, post])
    sub = df[[pre, post]].apply(pd.to_numeric, errors="coerce").dropna()
    dropped = len(df) - len(sub)
    warnings: list[str] = []
    if dropped > 0:
        warnings.append(f"{dropped} baris dengan data kosong dikeluarkan (listwise deletion).")
    if len(sub) < 3:
        raise AnalysisError(
            "insufficient_data", f"Data berpasangan valid hanya {len(sub)}; tidak cukup untuk diuji."
        )
    return pre, post, sub[pre].astype(float), sub[post].astype(float), len(sub), warnings

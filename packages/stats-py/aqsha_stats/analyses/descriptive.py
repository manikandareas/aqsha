"""SPSS-style Descriptive Statistics + frequency tables."""

from __future__ import annotations

import pandas as pd

from ..contract import build_result, table
from ..io import listwise, require_columns

FREQ_MAX_DISTINCT = 12


def run(df: pd.DataFrame, args: dict) -> dict:
    work = df.copy()
    groups: dict[str, list[str]] = args.get("groups") or {}
    for name, items in groups.items():
        require_columns(work, list(items))
        # skipna=False: a row missing any item gets NaN and is listwise-dropped.
        work[name] = work[list(items)].sum(axis=1, skipna=False)

    variables: list[str] = args.get("variables") or []
    if not variables:
        if groups:
            variables = list(groups)
        else:
            variables = [c for c in work.columns if pd.api.types.is_numeric_dtype(work[c])]
    require_columns(work, variables)
    for var in variables:
        if not pd.api.types.is_numeric_dtype(work[var]):
            from ..contract import AnalysisError

            raise AnalysisError(
                "invalid_args",
                f"Variabel '{var}' bukan numerik sehingga tidak dapat dianalisis deskriptif.",
            )

    sub, warnings = listwise(work, variables)

    desc_rows = [
        [var, len(sub), sub[var].min(), sub[var].max(), sub[var].mean(), sub[var].std(ddof=1)]
        for var in variables
    ]
    tables = [
        table(
            "descriptive_statistics",
            "Descriptive Statistics",
            ["Variabel", "N", "Minimum", "Maximum", "Mean", "Std. Deviation"],
            desc_rows,
            notes=[f"Valid N (listwise) = {len(sub)}."],
        )
    ]

    for var in variables:
        if sub[var].nunique() > FREQ_MAX_DISTINCT:
            continue
        counts = sub[var].value_counts().sort_index()
        total = int(counts.sum())
        cum = 0.0
        freq_rows = []
        for value, freq in counts.items():
            pct = 100.0 * freq / total
            cum += pct
            freq_rows.append([value, int(freq), pct, pct, cum])
        tables.append(
            table(
                f"freq_{var}",
                f"Tabel Frekuensi {var}",
                ["Nilai", "Frequency", "Percent", "Valid Percent", "Cumulative Percent"],
                freq_rows,
            )
        )

    return build_result("descriptive", tables, [], n=len(sub), warnings=warnings)

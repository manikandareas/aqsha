"""Transformasi MSI (Method of Successive Interval): ordinal Likert → skala interval.

Konvensi skripsi Indonesia (sering diminta sebelum regresi/path atas data Likert): tiap
kategori ordinal dipetakan ke scale value berbasis distribusi normal, lalu digeser agar
kategori terendah = 1. Hasil = tabel nilai transformasi per item×kategori.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from ..contract import AnalysisError, build_result, decision, fmt_id, table, VERDICT_LOLOS
from ..io import require_arg, require_columns


def _scale_values(col: pd.Series) -> dict[float, float]:
    values = pd.to_numeric(col, errors="coerce").dropna()
    n = len(values)
    if n < 3:
        raise AnalysisError("insufficient_data", "MSI membutuhkan data ordinal yang cukup.")
    categories = sorted(values.unique())
    counts = values.value_counts()
    cum = 0.0
    svs: dict[float, float] = {}
    for cat in categories:
        p = float(counts.get(cat, 0)) / n
        lower_cum = cum
        upper_cum = cum + p
        z_lower = stats.norm.ppf(lower_cum) if lower_cum > 0 else -np.inf
        z_upper = stats.norm.ppf(upper_cum) if upper_cum < 1 else np.inf
        dens_lower = float(stats.norm.pdf(z_lower)) if np.isfinite(z_lower) else 0.0
        dens_upper = float(stats.norm.pdf(z_upper)) if np.isfinite(z_upper) else 0.0
        sv = (dens_lower - dens_upper) / p if p > 0 else 0.0
        svs[float(cat)] = sv
        cum = upper_cum
    # Geser agar scale value minimum = 1 (konvensi MSI).
    min_sv = min(svs.values())
    shift = 1.0 - min_sv
    return {cat: sv + shift for cat, sv in svs.items()}


def run(df: pd.DataFrame, args: dict) -> dict:
    items: list[str] = list(require_arg(args, "items"))
    if len(items) < 1:
        raise AnalysisError("invalid_args", "Argumen 'items' minimal 1 kolom.")
    require_columns(df, items)

    rows = []
    for item in items:
        svs = _scale_values(df[item])
        for cat in sorted(svs):
            rows.append([item, cat, svs[cat]])

    tbl = table(
        "msi_scale_values",
        "Nilai Transformasi MSI (per kategori)",
        ["Item", "Kategori Ordinal", "Nilai Interval (MSI)"],
        rows,
        notes=[
            "Setiap respons ordinal diganti dengan nilai interval di kolom kanan.",
            "Kategori terendah digeser menjadi 1,000; jarak antar kategori mengikuti sebaran normal.",
        ],
    )
    decisions = [
        decision(
            "msi",
            "Transformasi MSI",
            "Ordinal → interval per item",
            None,
            None,
            VERDICT_LOLOS,
            f"Transformasi MSI menghasilkan nilai interval untuk {len(items)} item. "
            "Gunakan nilai interval ini sebagai pengganti skor ordinal pada uji parametrik "
            "(mis. regresi/path). Ekspor dataset terolah untuk memakainya di SPSS.",
        )
    ]
    return build_result("transformasi_msi", [tbl], decisions, n=len(df), warnings=[])

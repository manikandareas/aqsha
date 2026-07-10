"""Dataset profile: column types, missingness, Likert detection, preview."""

from __future__ import annotations

import pandas as pd

from ..contract import build_result, table


def _preview_cell(v):
    """JSON-safe preview value. Angka (termasuk numpy) diteruskan apa adanya supaya
    r3() di table() membulatkannya; nilai non-primitif yang tak bisa di-float
    (Timestamp — mis. kolom pertama ekspor Google Forms — Decimal, bytes) dijadikan
    teks, jika tidak json.dumps meledak dan seluruh profil gagal."""
    if pd.isna(v):
        return None
    if isinstance(v, (str, bool)):
        return v
    try:
        float(v)  # numeric (incl. numpy) → biarkan r3 yang membulatkan
        return v
    except (TypeError, ValueError):
        return str(v)


def _likert_range(series: pd.Series) -> str:
    vals = series.dropna()
    if len(vals) == 0 or vals.nunique() < 3:
        return "-"
    if not (vals == vals.round()).all():
        return "-"
    lo, hi = vals.min(), vals.max()
    if lo >= 1 and hi <= 5:
        return "1-5"
    if lo >= 1 and hi <= 7:
        return "1-7"
    return "-"


def run(df: pd.DataFrame, args: dict) -> dict:
    rows = []
    for col in df.columns:
        s = df[col]
        n_valid = int(s.notna().sum())
        n_missing = int(s.isna().sum())
        n_unique = int(s.nunique(dropna=True))
        if pd.api.types.is_numeric_dtype(s):
            rows.append(
                [
                    str(col),
                    "numeric",
                    n_valid,
                    n_missing,
                    n_unique,
                    s.min(),
                    s.max(),
                    s.mean(),
                    s.std(ddof=1),
                    _likert_range(s),
                    "",
                ]
            )
        else:
            dtype = "categorical" if n_unique <= 20 else "text"
            sample = ", ".join(str(v) for v in s.dropna().unique()[:5])
            rows.append(
                [str(col), dtype, n_valid, n_missing, n_unique, None, None, None, None, "-", sample]
            )

    profile_table = table(
        "profile",
        "Profil Dataset",
        [
            "Kolom",
            "Tipe",
            "N Valid",
            "Missing",
            "Unik",
            "Min",
            "Max",
            "Mean",
            "Std. Deviation",
            "Likert",
            "Contoh Nilai",
        ],
        rows,
        notes=[f"Jumlah baris: {len(df)}. Likert terdeteksi bila nilai bulat dalam rentang 1-5 atau 1-7."],
    )

    preview_rows = []
    for _, row in df.head(5).iterrows():
        preview_rows.append([_preview_cell(v) for v in row])
    preview_table = table(
        "preview",
        "Pratinjau Data (5 baris pertama)",
        [str(c) for c in df.columns],
        preview_rows,
    )

    return build_result("profile", [profile_table, preview_table], [], n=len(df))

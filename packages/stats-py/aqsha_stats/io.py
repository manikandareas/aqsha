"""Dataset loading (.csv/.xlsx/.sav) + shared column/missing-data helpers."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from .contract import AnalysisError


def load_dataset(path: str | Path) -> pd.DataFrame:
    p = Path(path)
    if not p.exists():
        raise AnalysisError("file_not_found", f"File data '{p}' tidak ditemukan.")
    ext = p.suffix.lower()
    if ext == ".csv":
        with open(p, encoding="utf-8-sig") as f:
            first_line = f.readline()
        # Locale ID: Excel memakai ';' sebagai pemisah JUSTRU karena ',' dipakai
        # sebagai desimal. Pasangkan sep ';' dengan decimal ',' supaya "4,25" terbaca
        # 4.25 (bukan string yang meledak saat astype(float) di regresi/validitas).
        semicolon = first_line.count(";") > first_line.count(",")
        sep = ";" if semicolon else ","
        return pd.read_csv(
            p, sep=sep, encoding="utf-8-sig", decimal="," if semicolon else "."
        )
    if ext in (".xlsx", ".xls"):
        return pd.read_excel(p, sheet_name=0)
    if ext == ".sav":
        import pyreadstat

        df, _meta = pyreadstat.read_sav(str(p))
        return df
    if ext == ".dta":
        import pyreadstat

        df, _meta = pyreadstat.read_dta(str(p))
        return df
    raise AnalysisError(
        "unsupported_format",
        f"Format file '{ext}' tidak didukung. Gunakan .csv, .xlsx, .sav, atau .dta.",
    )


def require_columns(df: pd.DataFrame, columns: list[str]) -> None:
    missing = [c for c in columns if c not in df.columns]
    if missing:
        available = ", ".join(str(c) for c in df.columns)
        raise AnalysisError(
            "column_not_found",
            f"Kolom '{missing[0]}' tidak ditemukan. Kolom tersedia: {available}",
        )


def require_arg(args: dict, key: str):
    value = args.get(key)
    if value is None or (isinstance(value, (list, str)) and len(value) == 0):
        raise AnalysisError("invalid_args", f"Argumen '{key}' wajib diisi untuk analisis ini.")
    return value


def listwise(df: pd.DataFrame, columns: list[str]) -> tuple[pd.DataFrame, list[str]]:
    """Listwise-drop rows with missing values in `columns`; report dropped count."""
    require_columns(df, columns)
    sub = df[columns].dropna()
    dropped = len(df) - len(sub)
    warnings = []
    if dropped > 0:
        warnings.append(
            f"{dropped} baris dengan data kosong dikeluarkan dari analisis (listwise deletion)."
        )
    if len(sub) < 3:
        raise AnalysisError(
            "insufficient_data",
            f"Data valid hanya {len(sub)} baris setelah menghapus data kosong; analisis membutuhkan lebih banyak data.",
        )
    return sub, warnings


def listwise_numeric(
    df: pd.DataFrame, columns: list[str], numeric: list[str] | None = None
) -> tuple[pd.DataFrame, list[str]]:
    """`listwise` + koersi kolom `numeric` (default: semua) ke angka.

    Baris dengan nilai non-numerik ikut dibuang (dilaporkan di warnings), lalu
    jumlah baris dicek ulang — kolom teks penuh (mis. label Likert) gagal dengan
    AnalysisError yang jelas, bukan error internal di hilir.
    """
    sub, warnings = listwise(df, columns)
    targets = columns if numeric is None else numeric
    coerced = sub.assign(**{c: pd.to_numeric(sub[c], errors="coerce") for c in targets}).dropna()
    dropped = len(sub) - len(coerced)
    if dropped > 0:
        warnings.append(f"{dropped} baris dengan nilai non-numerik dikeluarkan dari analisis.")
    if len(coerced) < 3:
        raise AnalysisError(
            "insufficient_data",
            f"Data numerik valid hanya {len(coerced)} baris; pastikan kolom analisis berisi angka.",
        )
    return coerced, warnings

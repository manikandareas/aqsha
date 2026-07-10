"""Uji Chi-Square (Pearson) untuk asosiasi dua variabel kategorik + Cramer's V."""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from ..contract import (
    VERDICT_LOLOS,
    VERDICT_TIDAK_LOLOS,
    build_result,
    decision,
    fmt_id,
    table,
)
from ..io import require_arg, require_columns


def run(df: pd.DataFrame, args: dict) -> dict:
    row_var = str(require_arg(args, "row"))
    col_var = str(require_arg(args, "col"))
    require_columns(df, [row_var, col_var])
    sub = df[[row_var, col_var]].dropna()
    dropped = len(df) - len(sub)
    warnings: list[str] = []
    if dropped > 0:
        warnings.append(f"{dropped} baris dengan data kosong dikeluarkan (listwise deletion).")

    ct = pd.crosstab(sub[row_var].astype(str), sub[col_var].astype(str))
    chi2, p, dof, expected = stats.chi2_contingency(ct.to_numpy())
    n = int(ct.to_numpy().sum())

    # Crosstab (Count) gaya SPSS: baris = kategori row, kolom = kategori col + Total.
    col_labels = list(ct.columns)
    header = [f"{row_var} \\ {col_var}", *col_labels, "Total"]
    ct_rows = []
    for idx, series in ct.iterrows():
        ct_rows.append([str(idx), *[int(v) for v in series.to_numpy()], int(series.sum())])
    ct_rows.append(["Total", *[int(v) for v in ct.sum(axis=0).to_numpy()], n])
    crosstab_tbl = table("crosstab", "Crosstabulation (Count)", header, ct_rows)

    min_expected = float(np.min(expected))
    low_cells = int((expected < 5).sum())
    test_tbl = table(
        "chi_square_tests",
        "Chi-Square Tests",
        ["", "Value", "df", "Asymp. Sig. (2-sided)"],
        [["Pearson Chi-Square", float(chi2), int(dof), float(p)],
         ["N of Valid Cases", n, None, None]],
        notes=[
            f"a. {low_cells} sel memiliki expected count < 5. Expected count minimum {fmt_id(min_expected)}."
        ],
    )
    # Cramer's V (ukuran asosiasi).
    k = min(ct.shape) - 1
    cramers_v = float(np.sqrt(chi2 / (n * k))) if n > 0 and k > 0 else float("nan")

    sig = bool(p < 0.05)
    decisions = [
        decision(
            "chi_square",
            f"Asosiasi {row_var} dan {col_var}",
            "Asymp. Sig. < 0,05",
            float(p),
            0.05,
            VERDICT_LOLOS if sig else VERDICT_TIDAK_LOLOS,
            (
                f"Nilai Pearson Chi-Square {fmt_id(float(chi2))} (df {int(dof)}) dengan Asymp. Sig. "
                f"{fmt_id(float(p))} < 0,05, sehingga terdapat hubungan/asosiasi yang signifikan antara "
                f"{row_var} dan {col_var} (Cramer's V = {fmt_id(cramers_v)})."
                if sig
                else f"Nilai Pearson Chi-Square {fmt_id(float(chi2))} (df {int(dof)}) dengan Asymp. Sig. "
                f"{fmt_id(float(p))} > 0,05, sehingga tidak terdapat hubungan yang signifikan antara "
                f"{row_var} dan {col_var}."
            ),
        )
    ]
    if low_cells > 0:
        from ..contract import VERDICT_PERHATIAN

        decisions.append(
            decision(
                "expected_count",
                "Syarat expected count",
                "Semua sel expected ≥ 5",
                min_expected,
                5,
                VERDICT_PERHATIAN,
                f"Terdapat {low_cells} sel dengan expected count < 5 (minimum {fmt_id(min_expected)}); "
                "hasil chi-square perlu ditafsirkan hati-hati (pertimbangkan Fisher's Exact untuk tabel 2×2).",
            )
        )
    return build_result("uji_chi_square", [crosstab_tbl, test_tbl], decisions, n=n, warnings=warnings)

"""Uji validitas item: Pearson item vs skor total (uncorrected item-total), r hitung vs r tabel."""

from __future__ import annotations

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
from ..io import listwise, require_arg
from ..tables import r_tabel


def run(df: pd.DataFrame, args: dict) -> dict:
    items: list[str] = list(require_arg(args, "items"))
    alpha = float(args.get("alpha", 0.05))
    total_col: str | None = args.get("total")

    cols = items + ([total_col] if total_col and total_col not in items else [])
    sub, warnings = listwise(df, cols)

    total = sub[total_col] if total_col else sub[items].sum(axis=1)
    n = len(sub)
    rt = r_tabel(n, alpha)

    rows = []
    decisions = []
    n_valid = 0
    for item in items:
        r, p = stats.pearsonr(sub[item], total)
        valid = bool(r >= rt and r > 0)
        n_valid += int(valid)
        rows.append([item, r, rt, p, "Valid" if valid else "Tidak Valid"])
        if valid:
            interp = (
                f"Nilai r hitung item {item} sebesar {fmt_id(r)} > r tabel {fmt_id(rt)} "
                f"dengan Sig. (2-tailed) {fmt_id(p)}, sehingga item {item} dinyatakan valid."
            )
        else:
            interp = (
                f"Nilai r hitung item {item} sebesar {fmt_id(r)} tidak melebihi r tabel {fmt_id(rt)}, "
                f"sehingga item {item} dinyatakan tidak valid."
            )
        decisions.append(
            decision(
                f"validitas_{item}",
                f"Validitas item {item}",
                "r hitung >= r tabel (dan positif)",
                r,
                rt,
                VERDICT_LOLOS if valid else VERDICT_TIDAK_LOLOS,
                interp,
            )
        )

    all_valid = n_valid == len(items)
    decisions.insert(
        0,
        decision(
            "validitas_keseluruhan",
            "Validitas seluruh item",
            "semua item: r hitung >= r tabel",
            n_valid,
            len(items),
            VERDICT_LOLOS if all_valid else VERDICT_TIDAK_LOLOS,
            (
                f"Seluruh {len(items)} item memiliki r hitung > r tabel ({fmt_id(rt)}), "
                "sehingga seluruh item dinyatakan valid."
                if all_valid
                else f"Hanya {n_valid} dari {len(items)} item yang valid; item tidak valid perlu "
                "diperbaiki atau digugurkan."
            ),
        ),
    )

    tbl = table(
        "item_total_correlations",
        "Uji Validitas (Korelasi Item-Total)",
        ["Item", "r hitung", "r tabel", "Sig. (2-tailed)", "Keterangan"],
        rows,
        notes=[
            f"r tabel untuk n={n} (df={n - 2}) pada taraf signifikansi {fmt_id(alpha, 2)} (two-tailed).",
            "Skor total = jumlah seluruh item (item-total tanpa koreksi, konvensi skripsi).",
        ],
    )
    return build_result("uji_validitas", [tbl], decisions, n=n, warnings=warnings)

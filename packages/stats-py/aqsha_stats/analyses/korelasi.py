"""Korelasi Pearson/Spearman antar variabel dengan tanda signifikansi SPSS."""

from __future__ import annotations

from itertools import combinations

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
from ..io import require_arg, require_columns

STRENGTH_BANDS = [
    (0.20, "sangat lemah"),
    (0.40, "lemah"),
    (0.60, "sedang"),
    (0.80, "kuat"),
    (1.01, "sangat kuat"),
]


def strength_label(r: float) -> str:
    a = abs(r)
    for upper, label in STRENGTH_BANDS:
        if a < upper:
            return label
    return "sangat kuat"


def run(df: pd.DataFrame, args: dict) -> dict:
    variables: list[str] = list(require_arg(args, "variables"))
    if len(variables) < 2:
        raise AnalysisError("invalid_args", "Analisis korelasi membutuhkan minimal 2 variabel.")
    method = args.get("method", "pearson")
    if method not in ("pearson", "spearman"):
        raise AnalysisError("invalid_args", "Argumen 'method' harus 'pearson' atau 'spearman'.")

    require_columns(df, variables)
    # SPSS Correlations (Analyze → Correlate → Bivariate) memakai PAIRWISE deletion
    # secara default — tiap pasangan dihitung atas kasus lengkap pasangan itu, dengan
    # N-nya sendiri. Listwise (drop baris yang kosong di variabel MANA PUN) menghasilkan
    # r/Sig/N berbeda dari SPSS saat ada data hilang → parity break. Pakai per-pasangan.
    warnings: list[str] = []
    rows = []
    pairs = []
    for a, b in combinations(variables, 2):
        pair = df[[a, b]].dropna()
        n_pair = len(pair)
        if n_pair < 3:
            warnings.append(
                f"Pasangan {a}–{b} hanya memiliki {n_pair} kasus lengkap; korelasi dilewati."
            )
            continue
        if method == "pearson":
            r, p = stats.pearsonr(pair[a].astype(float), pair[b].astype(float))
        else:
            r, p = stats.spearmanr(pair[a].astype(float), pair[b].astype(float))
        r, p = float(r), float(p)
        stars = "**" if p < 0.01 else ("*" if p < 0.05 else "")
        label = strength_label(r)
        arah = "positif" if r >= 0 else "negatif"
        rows.append([a, b, r, p, n_pair, f"{label} ({arah}){stars}"])
        pairs.append((a, b, r, p, label, arah))

    if not pairs:
        raise AnalysisError(
            "insufficient_data",
            "Tidak ada pasangan variabel dengan cukup kasus lengkap untuk dikorelasikan.",
        )
    n = len(df.dropna(subset=variables))

    tbl = table(
        "correlations",
        f"Correlations ({'Pearson' if method == 'pearson' else 'Spearman'})",
        ["Variabel 1", "Variabel 2", "r", "Sig. (2-tailed)", "N", "Keterangan"],
        rows,
        notes=[
            "*. Korelasi signifikan pada taraf 0,05 (2-tailed).",
            "**. Korelasi signifikan pada taraf 0,01 (2-tailed).",
            "Interpretasi kekuatan: 0,00-0,199 sangat lemah; 0,20-0,399 lemah; "
            "0,40-0,599 sedang; 0,60-0,799 kuat; 0,80-1,000 sangat kuat.",
        ],
    )

    decisions = []
    strongest = max(pairs, key=lambda pr: abs(pr[2]))
    for a, b, r, p, label, arah in sorted(pairs, key=lambda pr: -abs(pr[2])):
        sig = bool(p < 0.05)
        prefix = "Korelasi terkuat: " if (a, b) == (strongest[0], strongest[1]) else ""
        decisions.append(
            decision(
                f"korelasi_{a}_{b}",
                f"Korelasi {a} - {b}",
                "Sig. (2-tailed) < 0,05",
                # value = p (bukan r) agar selaras dgn rule/cutoff 0,05; verdict dari p (baris atas).
                p,
                0.05,
                VERDICT_LOLOS if sig else VERDICT_TIDAK_LOLOS,
                (
                    f"{prefix}Terdapat hubungan {arah} yang signifikan antara {a} dan {b} "
                    f"(r = {fmt_id(r)}; Sig. {fmt_id(p)} < 0,05) dengan kekuatan hubungan {label}."
                    if sig
                    else f"{prefix}Tidak terdapat hubungan yang signifikan antara {a} dan {b} "
                    f"(r = {fmt_id(r)}; Sig. {fmt_id(p)} > 0,05)."
                ),
            )
        )

    return build_result("korelasi", [tbl], decisions, n=n, warnings=warnings)

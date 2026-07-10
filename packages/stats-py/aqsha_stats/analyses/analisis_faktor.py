"""Analisis faktor eksploratori (EFA) ala SPSS: KMO & Bartlett + PCA + varimax.

Implementasi sendiri (BUKAN factor-analyzer yang GPL & tak kompatibel sklearn
baru): ekstraksi principal components dari matriks korelasi (default SPSS)
+ rotasi varimax via statsmodels (BSD). KMO/Bartlett dihitung dari rumus baku
— tervalidasi identik dengan referensi factor_analyzer (lihat tests).
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from ..contract import (
    VERDICT_LOLOS,
    VERDICT_PERHATIAN,
    VERDICT_TIDAK_LOLOS,
    AnalysisError,
    build_result,
    decision,
    fmt_id,
    table,
)
from ..io import listwise_numeric, require_arg

LOADING_CUTOFF = 0.5


def run(df: pd.DataFrame, args: dict) -> dict:
    items = [str(c) for c in require_arg(args, "items")]
    if len(items) < 3:
        raise AnalysisError("invalid_args", "Analisis faktor membutuhkan minimal 3 item.")
    rotation = str(args.get("rotation") or "varimax").lower()
    if rotation not in ("varimax", "none"):
        raise AnalysisError("invalid_args", "Rotasi hanya mendukung 'varimax' atau 'none'.")

    sub, warnings = listwise_numeric(df, items)
    n = len(sub)
    p = len(items)
    if n <= p:
        warnings.append(f"Jumlah data ({n}) hampir/kurang dari jumlah item ({p}) — hasil kurang stabil.")

    corr = sub.corr().to_numpy()
    det = float(np.linalg.det(corr))
    if not np.isfinite(det) or det <= 1e-12:
        raise AnalysisError(
            "singular_matrix",
            "Matriks korelasi singular (ada item duplikat/kombinasi linear) — "
            "keluarkan item yang identik lalu ulangi.",
        )

    # KMO (MSA): rasio korelasi vs korelasi parsial (dari invers matriks korelasi).
    inv = np.linalg.inv(corr)
    d = np.diag(1.0 / np.sqrt(np.diag(inv)))
    partial = -d @ inv @ d
    np.fill_diagonal(partial, 0.0)
    off = corr - np.eye(p)
    r2_sum, a2_sum = float((off**2).sum()), float((partial**2).sum())
    r2_cols, a2_cols = (off**2).sum(axis=0), (partial**2).sum(axis=0)
    kmo = r2_sum / (r2_sum + a2_sum)
    msa_items = r2_cols / (r2_cols + a2_cols)

    # Bartlett's Test of Sphericity.
    chi2 = -(n - 1 - (2 * p + 5) / 6) * np.log(det)
    bartlett_df = p * (p - 1) / 2
    bartlett_p = float(stats.chi2.sf(chi2, bartlett_df))

    kmo_bartlett = table(
        "kmo_bartlett",
        "KMO and Bartlett's Test",
        ["Ukuran", "Nilai"],
        [
            ["Kaiser-Meyer-Olkin Measure of Sampling Adequacy", float(kmo)],
            ["Bartlett's Test of Sphericity — Approx. Chi-Square", float(chi2)],
            ["Bartlett's Test of Sphericity — df", int(bartlett_df)],
            ["Bartlett's Test of Sphericity — Sig.", bartlett_p],
        ],
    )

    # Ekstraksi PCA: eigendecomposition matriks korelasi (default SPSS).
    eigenvalues, eigenvectors = np.linalg.eigh(corr)
    order = np.argsort(eigenvalues)[::-1]
    eigenvalues, eigenvectors = eigenvalues[order], eigenvectors[:, order]

    requested = int(args.get("n_factors") or 0)
    k = max(1, min(requested or int((eigenvalues > 1.0).sum()), p - 1))
    if requested and k != requested:
        warnings.append(
            f"Jumlah faktor disesuaikan dari {requested} menjadi {k} "
            f"(rentang yang didukung 1–{p - 1} untuk {p} item)."
        )
    loadings = eigenvectors[:, :k] * np.sqrt(np.clip(eigenvalues[:k], 0, None))

    did_rotate = rotation == "varimax" and k >= 2
    rotated = loadings
    if did_rotate:
        from statsmodels.multivariate.factor_rotation import rotate_factors

        rotated, _ = rotate_factors(loadings, "varimax")
    # Konvensi SPSS: refleksikan komponen agar mayoritas loading positif,
    # lalu urutkan komponen berdasar sumbangan varian (SS loadings) terbesar.
    signs = np.where(rotated.sum(axis=0) < 0, -1.0, 1.0)
    rotated = rotated * signs
    ss_loadings = (rotated**2).sum(axis=0)
    factor_order = np.argsort(ss_loadings)[::-1]
    rotated, ss_loadings = rotated[:, factor_order], ss_loadings[factor_order]

    communalities = (rotated**2).sum(axis=1)
    communality_table = table(
        "communalities",
        "Communalities",
        ["Item", "Initial", "Extraction", "MSA"],
        [
            [item, 1.0, float(communalities[i]), float(msa_items[i])]
            for i, item in enumerate(items)
        ],
        notes=["Extraction Method: Principal Component Analysis. MSA = Measure of Sampling Adequacy per item."],
    )

    variance_rows = []
    cumulative = 0.0
    cumulative_rot = 0.0
    for i in range(p):
        pct = float(eigenvalues[i] / p * 100)
        cumulative += pct
        if i < k:
            rot_pct = float(ss_loadings[i] / p * 100)
            cumulative_rot += rot_pct
            rot_cols = [float(ss_loadings[i]), rot_pct, cumulative_rot]
        else:
            rot_cols = [None, None, None]
        variance_rows.append([i + 1, float(eigenvalues[i]), pct, cumulative, *rot_cols])
    variance = table(
        "variance",
        "Total Variance Explained",
        [
            "Komponen",
            "Initial Eigenvalues Total",
            "% of Variance",
            "Cumulative %",
            "Rotation SS Loadings Total",
            "Rotation % of Variance",
            "Rotation Cumulative %",
        ],
        variance_rows,
        notes=["Extraction Method: Principal Component Analysis."],
    )

    dominant = np.abs(rotated).argmax(axis=1)
    matrix_rows = [
        [item, *[float(v) for v in rotated[i]], f"Komponen {dominant[i] + 1}"]
        for i, item in enumerate(items)
    ]
    component_matrix = table(
        "component_matrix",
        "Rotated Component Matrix" if did_rotate else "Component Matrix",
        ["Item", *[f"Komponen {j + 1}" for j in range(k)], "Dominan"],
        matrix_rows,
        notes=["Rotation Method: Varimax with Kaiser Normalization."] if did_rotate else [],
    )

    low_items = [items[i] for i in range(p) if abs(rotated[i]).max() < LOADING_CUTOFF]
    decisions = [
        decision(
            "kmo",
            "Kecukupan sampel (KMO)",
            "KMO ≥ 0,50",
            float(kmo),
            0.5,
            VERDICT_LOLOS if kmo >= 0.5 else VERDICT_TIDAK_LOLOS,
            (
                f"Nilai KMO {fmt_id(float(kmo))} ≥ 0,50 → data layak dianalisis faktor."
                if kmo >= 0.5
                else f"Nilai KMO {fmt_id(float(kmo))} < 0,50 → data belum layak dianalisis faktor "
                "(tambah responden atau kurangi item bermasalah)."
            ),
        ),
        decision(
            "bartlett",
            "Bartlett's Test of Sphericity",
            "Sig. < 0,05",
            bartlett_p,
            0.05,
            VERDICT_LOLOS if bartlett_p < 0.05 else VERDICT_TIDAK_LOLOS,
            (
                f"Bartlett's Test Sig. {fmt_id(bartlett_p)} < 0,05 → antar item terdapat korelasi "
                "yang memadai untuk analisis faktor."
                if bartlett_p < 0.05
                else f"Bartlett's Test Sig. {fmt_id(bartlett_p)} > 0,05 → korelasi antar item tidak "
                "memadai untuk analisis faktor."
            ),
        ),
        decision(
            "loading",
            "Kecukupan factor loading",
            f"Loading maksimum per item ≥ {fmt_id(LOADING_CUTOFF, 2)}",
            float(np.abs(rotated).max(axis=1).min()),
            LOADING_CUTOFF,
            VERDICT_LOLOS if not low_items else VERDICT_PERHATIAN,
            (
                f"Seluruh item memiliki loading ≥ {fmt_id(LOADING_CUTOFF, 2)} pada satu komponen — "
                f"terekstrak {k} komponen."
                if not low_items
                else f"Item dengan loading < {fmt_id(LOADING_CUTOFF, 2)}: {', '.join(low_items)} — "
                "pertimbangkan mengeluarkan item tersebut lalu ulangi analisis."
            ),
        ),
    ]

    return build_result(
        "analisis_faktor",
        [kmo_bartlett, communality_table, variance, component_matrix],
        decisions,
        n=n,
        warnings=warnings,
        extra_meta={"n_factors": k, "rotation": rotation},
    )

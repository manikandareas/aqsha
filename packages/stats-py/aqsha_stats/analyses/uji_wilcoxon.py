"""Uji Wilcoxon Signed-Rank (non-parametrik, 2 kondisi berpasangan — pengganti paired t)."""

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
from ._groups import paired_columns


def run(df: pd.DataFrame, args: dict) -> dict:
    pre, post, a, b, n, warnings = paired_columns(df, args)
    diff = b - a
    neg = int((diff < 0).sum())
    pos = int((diff > 0).sum())
    ties = int((diff == 0).sum())

    ranks_tbl = table(
        "ranks",
        "Ranks",
        ["", "N"],
        [
            [f"Negative Ranks ({post} < {pre})", neg],
            [f"Positive Ranks ({post} > {pre})", pos],
            ["Ties", ties],
            ["Total", n],
        ],
    )
    try:
        # `method="approx"` = normal approximation (SPSS parity): the reported p-value then
        # matches the Z below and the "Asymp. Sig." label. Without it scipy auto-picks the
        # EXACT method for small n, whose p-value would contradict an "Asymp." label.
        w_stat, p = stats.wilcoxon(a, b, method="approx")
    except ValueError as exc:
        from ..contract import AnalysisError

        raise AnalysisError("insufficient_data", f"Uji Wilcoxon tidak bisa dihitung: {exc}")
    # Z aproksimasi (SPSS menampilkan Z; scipy tak selalu memberi Z untuk n kecil).
    nnz = neg + pos
    if nnz > 0:
        mu = nnz * (nnz + 1) / 4
        sigma = np.sqrt(nnz * (nnz + 1) * (2 * nnz + 1) / 24)
        z = (float(w_stat) - mu) / sigma if sigma > 0 else float("nan")
    else:
        z = float("nan")
    test_tbl = table(
        "test_statistics",
        "Test Statistics",
        ["", "Z", "Asymp. Sig. (2-tailed)"],
        [[f"{post} - {pre}", z, float(p)]],
    )
    sig = bool(p < 0.05)
    decisions = [
        decision(
            "wilcoxon",
            f"Perbedaan {pre} dan {post}",
            "Asymp. Sig. < 0,05",
            float(p),
            0.05,
            VERDICT_LOLOS if sig else VERDICT_TIDAK_LOLOS,
            (
                f"Nilai Asymp. Sig. {fmt_id(float(p))} < 0,05, sehingga terdapat perbedaan yang "
                f"signifikan antara {pre} dan {post}."
                if sig
                else f"Nilai Asymp. Sig. {fmt_id(float(p))} > 0,05, sehingga tidak terdapat perbedaan "
                f"yang signifikan antara {pre} dan {post}."
            ),
        )
    ]
    return build_result("uji_wilcoxon", [ranks_tbl, test_tbl], decisions, n=n, warnings=warnings)

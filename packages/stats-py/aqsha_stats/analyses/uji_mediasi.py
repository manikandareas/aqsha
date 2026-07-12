"""Uji mediasi (path X → M → Y): efek langsung/tak langsung + Sobel + bootstrap CI."""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..contract import (
    VERDICT_LOLOS,
    VERDICT_TIDAK_LOLOS,
    build_result,
    decision,
    fmt_id,
    stats_seed,
    table,
)
from ..io import listwise, require_arg

BOOTSTRAP = 5000


def run(df: pd.DataFrame, args: dict) -> dict:
    import statsmodels.api as sm
    from scipy import stats as sstats

    dependent = str(require_arg(args, "dependent"))
    independent = str(require_arg(args, "independent"))
    mediator = str(require_arg(args, "mediator"))
    sub, warnings = listwise(df, [dependent, independent, mediator])
    n = len(sub)
    x = sub[independent].astype(float)
    m = sub[mediator].astype(float)
    y = sub[dependent].astype(float)

    # Path a: X → M. Path b & c': M, X → Y. Path c: X → Y (total).
    a_model = sm.OLS(m, sm.add_constant(x)).fit()
    yb_model = sm.OLS(y, sm.add_constant(pd.DataFrame({independent: x, mediator: m}))).fit()
    c_model = sm.OLS(y, sm.add_constant(x)).fit()

    a = float(a_model.params[independent])
    sa = float(a_model.bse[independent])
    b = float(yb_model.params[mediator])
    sb = float(yb_model.bse[mediator])
    c = float(c_model.params[independent])
    c_prime = float(yb_model.params[independent])
    indirect = a * b

    # Sobel z.
    sobel_se = np.sqrt(b**2 * sa**2 + a**2 * sb**2)
    sobel_z = indirect / sobel_se if sobel_se > 0 else float("nan")
    sobel_p = float(2 * sstats.norm.sf(abs(sobel_z))) if np.isfinite(sobel_z) else float("nan")

    # Bootstrap CI 95% efek tak langsung. Seed = AQSHA_STATS_SEED (sama dengan meta.seed
    # yang dilaporkan build_result) supaya CI dapat direproduksi dari seed di hasil.
    rng = np.random.default_rng(stats_seed())
    idx = np.arange(n)
    boot = np.empty(BOOTSTRAP)
    xv, mv, yv = x.to_numpy(), m.to_numpy(), y.to_numpy()
    for i in range(BOOTSTRAP):
        s = rng.choice(idx, size=n, replace=True)
        ai = _slope(xv[s], mv[s])
        bi = _partial_slope(xv[s], mv[s], yv[s])
        boot[i] = ai * bi
    ci_low, ci_high = np.percentile(boot, [2.5, 97.5])

    paths = table(
        "paths",
        "Path Coefficients",
        ["Jalur", "Koefisien", "Std. Error", "Keterangan"],
        [
            [f"a: {independent} → {mediator}", a, sa, "path a"],
            [f"b: {mediator} → {dependent}", b, sb, "path b"],
            [f"c: {independent} → {dependent} (total)", c, float(c_model.bse[independent]), "efek total"],
            [f"c': {independent} → {dependent} (langsung)", c_prime, float(yb_model.bse[independent]), "efek langsung"],
        ],
    )
    effects = table(
        "effects",
        "Efek Mediasi",
        ["Efek", "Nilai", "Sobel Z", "Sobel Sig.", "Boot CI 95% Lower", "Boot CI 95% Upper"],
        [["Indirect (a×b)", indirect, sobel_z, sobel_p, float(ci_low), float(ci_high)]],
        notes=[f"Bootstrap {BOOTSTRAP} sampel (seed tetap). Mediasi bila 0 TIDAK berada di dalam CI."],
    )

    ci_excludes_zero = bool(ci_low > 0 or ci_high < 0)
    mediation_type = (
        "penuh (full)"
        if ci_excludes_zero and abs(c_prime) < 1e-9
        else "sebagian (partial)"
        if ci_excludes_zero
        else "tidak ada"
    )
    decisions = [
        decision(
            "mediasi",
            f"Mediasi {mediator} pada {independent} → {dependent}",
            "0 di luar bootstrap CI 95%",
            indirect,
            0,
            VERDICT_LOLOS if ci_excludes_zero else VERDICT_TIDAK_LOLOS,
            (
                f"Efek tidak langsung sebesar {fmt_id(indirect)} dengan bootstrap CI 95% "
                f"[{fmt_id(float(ci_low))}; {fmt_id(float(ci_high))}] yang TIDAK memuat nol "
                f"(Sobel Z {fmt_id(sobel_z)}, Sig. {fmt_id(sobel_p)}), sehingga {mediator} memediasi "
                f"pengaruh {independent} terhadap {dependent} (mediasi {mediation_type})."
                if ci_excludes_zero
                else f"Efek tidak langsung sebesar {fmt_id(indirect)} dengan bootstrap CI 95% "
                f"[{fmt_id(float(ci_low))}; {fmt_id(float(ci_high))}] MEMUAT nol, sehingga {mediator} "
                f"tidak memediasi pengaruh {independent} terhadap {dependent}."
            ),
        )
    ]
    return build_result(
        "uji_mediasi", [paths, effects], decisions, n=n, warnings=warnings,
        extra_meta={"bootstrap": BOOTSTRAP},
    )


def _slope(x: np.ndarray, y: np.ndarray) -> float:
    """OLS slope of y on x (with intercept)."""
    xm, ym = x.mean(), y.mean()
    denom = ((x - xm) ** 2).sum()
    return float(((x - xm) * (y - ym)).sum() / denom) if denom > 0 else 0.0


def _partial_slope(x: np.ndarray, m: np.ndarray, y: np.ndarray) -> float:
    """Coefficient of m in OLS y ~ x + m."""
    X = np.column_stack([np.ones(len(x)), x, m])
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    return float(beta[2])

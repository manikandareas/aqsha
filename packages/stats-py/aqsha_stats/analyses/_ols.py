"""Shared OLS helper for assumption tests and regression."""

from __future__ import annotations

import pandas as pd

from ..io import listwise, require_arg


def prepare_ols(df: pd.DataFrame, args: dict):
    """Validate args, listwise-drop, and fit OLS with intercept.

    Returns (model, sub, dependent, independents, warnings).
    """
    import statsmodels.api as sm

    from ..contract import AnalysisError

    dependent: str = require_arg(args, "dependent")
    independents: list[str] = list(require_arg(args, "independents"))
    sub, warnings = listwise(df, [dependent] + independents)
    k = len(independents)
    # Butuh df_resid >= 1 (n > k + 1). Tanpa ini, mse_resid/adj-R²/F/t = nan/inf
    # yang lolos sebagai None — R² palsu 1,000 dipajang seolah otoritatif.
    if len(sub) < k + 2:
        raise AnalysisError(
            "insufficient_data",
            f"Regresi dengan {k} variabel bebas membutuhkan minimal {k + 2} baris data "
            f"valid; hanya tersedia {len(sub)} setelah menghapus data kosong.",
        )
    X = sm.add_constant(sub[independents].astype(float))
    model = sm.OLS(sub[dependent].astype(float), X).fit()
    return model, sub, dependent, independents, warnings

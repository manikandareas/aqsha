"""Shared GLM helpers (Type III SS, SPSS parity) for two-way ANOVA & ANCOVA.

SPSS GLM Univariate memakai Type III sums of squares dengan sum-to-zero
contrasts — `anova_lm(typ=3)` HANYA match SPSS bila faktor di-encode
`C(..., Sum)`; default treatment coding menghasilkan SS Type III yang salah.
"""

from __future__ import annotations

import pandas as pd
from scipy import stats

from ..contract import fmt_id, table


def q(name: str) -> str:
    """Patsy-quote an arbitrary column name for formula use (handles dots/spaces)."""
    return f"Q({name!r})"


def fit_type3(sub: pd.DataFrame, formula: str):
    """OLS fit + Type III anova table. Returns (model, anova_df)."""
    import statsmodels.api as sm
    from statsmodels.formula.api import ols

    model = ols(formula, data=sub).fit()
    anova = sm.stats.anova_lm(model, typ=3)
    return model, anova


def between_subjects_table(
    model,
    anova: pd.DataFrame,
    dependent: str,
    sub: pd.DataFrame,
    term_labels: dict[str, str],
) -> dict:
    """SPSS "Tests of Between-Subjects Effects": Corrected Model + Intercept +
    effects (Type III) + Error + Total + Corrected Total, dengan catatan R²."""
    n = len(sub)
    mse = float(model.mse_resid)
    df_model = float(model.df_model)
    ess = float(model.ess)
    f_model = (ess / df_model) / mse if df_model > 0 and mse > 0 else float("nan")
    sig_model = float(stats.f.sf(f_model, df_model, model.df_resid)) if df_model > 0 else float("nan")

    rows: list[list] = [
        ["Corrected Model", ess, int(df_model), ess / df_model if df_model else None, f_model, sig_model],
    ]
    for term, label in term_labels.items():
        if term not in anova.index:
            continue
        r = anova.loc[term]
        ss, df_t = float(r["sum_sq"]), int(r["df"])
        f_v = float(r["F"]) if pd.notna(r["F"]) else None
        p_v = float(r["PR(>F)"]) if pd.notna(r["PR(>F)"]) else None
        rows.append([label, ss, df_t, ss / df_t if df_t else None, f_v, p_v])
    ss_err = float(model.ssr)
    df_err = int(model.df_resid)
    rows.append(["Error", ss_err, df_err, ss_err / df_err if df_err else None, None, None])
    rows.append(["Total", float((sub[dependent].astype(float) ** 2).sum()), n, None, None, None])
    rows.append(["Corrected Total", float(model.centered_tss), n - 1, None, None, None])

    return table(
        "between_subjects",
        "Tests of Between-Subjects Effects",
        ["Source", "Type III Sum of Squares", "df", "Mean Square", "F", "Sig."],
        rows,
        notes=[
            f"a. Dependent Variable: {dependent}",
            f"b. R Squared = {fmt_id(model.rsquared)} (Adjusted R Squared = {fmt_id(model.rsquared_adj)})",
        ],
    )


def effect_p(anova: pd.DataFrame, term: str) -> float:
    """Sig. milik satu term Type III (nan bila term tak ada)."""
    if term not in anova.index:
        return float("nan")
    value = anova.loc[term, "PR(>F)"]
    return float(value) if pd.notna(value) else float("nan")

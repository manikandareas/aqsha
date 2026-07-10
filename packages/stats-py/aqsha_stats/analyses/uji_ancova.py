"""ANCOVA (SPSS GLM Univariate + covariate): efek faktor setelah kontrol kovariat."""

from __future__ import annotations

import pandas as pd

from ..contract import (
    VERDICT_LOLOS,
    VERDICT_TIDAK_LOLOS,
    build_result,
    decision,
    fmt_id,
    table,
)
from ..io import listwise_numeric, require_arg
from ._glm import between_subjects_table, effect_p, fit_type3, q


def run(df: pd.DataFrame, args: dict) -> dict:
    dependent = str(require_arg(args, "dependent"))
    factor = str(require_arg(args, "factor"))
    covariates = [str(c) for c in require_arg(args, "covariates")]
    sub, warnings = listwise_numeric(
        df, [dependent, factor] + covariates, numeric=[dependent] + covariates
    )
    n = len(sub)

    factor_term = f"C({q(factor)}, Sum)"
    formula = f"{q(dependent)} ~ {factor_term} + " + " + ".join(q(c) for c in covariates)
    model, anova = fit_type3(sub, formula)

    term_labels = {q(c): c for c in covariates}
    term_labels[factor_term] = factor
    tables = [between_subjects_table(model, anova, dependent, sub, term_labels)]

    # Estimated Marginal Means: rata-rata tiap level faktor pada nilai kovariat = mean.
    # Level memakai dtype ASLI kolom (bukan str) — patsy menolak level yang tak
    # sama persis dengan data fit (faktor berkode angka → PatsyError bila di-cast).
    levels = sorted(sub[factor].unique(), key=str)
    frame = pd.DataFrame({factor: levels})
    for c in covariates:
        frame[c] = float(sub[c].mean())
    prediction = model.get_prediction(frame)
    tables.append(
        table(
            "emmeans",
            "Estimated Marginal Means",
            [factor, "Mean", "Std. Error"],
            [
                [str(lvl), float(m), float(se)]
                for lvl, m, se in zip(levels, prediction.predicted_mean, prediction.se_mean)
            ],
            notes=[
                "Kovariat dievaluasi pada: "
                + ", ".join(f"{c} = {fmt_id(float(sub[c].mean()))}" for c in covariates)
            ],
        )
    )

    decisions = []
    p_factor = effect_p(anova, factor_term)
    decisions.append(
        decision(
            "efek_faktor",
            f"Pengaruh {factor} terhadap {dependent} (setelah kontrol kovariat)",
            "Sig. < 0,05",
            p_factor,
            0.05,
            VERDICT_LOLOS if p_factor < 0.05 else VERDICT_TIDAK_LOLOS,
            (
                f"Setelah mengontrol {', '.join(covariates)}, {factor} berpengaruh signifikan "
                f"terhadap {dependent} (Sig. {fmt_id(p_factor)} < 0,05)."
                if p_factor < 0.05
                else f"Setelah mengontrol {', '.join(covariates)}, {factor} tidak berpengaruh "
                f"signifikan terhadap {dependent} (Sig. {fmt_id(p_factor)} > 0,05)."
            ),
        )
    )
    for c in covariates:
        p_cov = effect_p(anova, q(c))
        decisions.append(
            decision(
                "kovariat_" + c,
                f"Pengaruh kovariat {c}",
                "Sig. < 0,05",
                p_cov,
                0.05,
                VERDICT_LOLOS if p_cov < 0.05 else VERDICT_TIDAK_LOLOS,
                (
                    f"Kovariat {c} berpengaruh signifikan terhadap {dependent} "
                    f"(Sig. {fmt_id(p_cov)} < 0,05)."
                    if p_cov < 0.05
                    else f"Kovariat {c} tidak berpengaruh signifikan terhadap {dependent} "
                    f"(Sig. {fmt_id(p_cov)} > 0,05)."
                ),
            )
        )

    return build_result("uji_ancova", tables, decisions, n=n, warnings=warnings)

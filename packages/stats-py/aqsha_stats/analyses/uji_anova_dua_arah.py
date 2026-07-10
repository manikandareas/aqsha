"""Two-Way ANOVA (SPSS GLM Univariate): efek utama 2 faktor + interaksi, Type III."""

from __future__ import annotations

import pandas as pd
from scipy import stats

from ..contract import (
    VERDICT_LOLOS,
    VERDICT_PERHATIAN,
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
    factor1 = str(require_arg(args, "factor1"))
    factor2 = str(require_arg(args, "factor2"))
    sub, warnings = listwise_numeric(df, [dependent, factor1, factor2], numeric=[dependent])
    n = len(sub)

    term1 = f"C({q(factor1)}, Sum)"
    term2 = f"C({q(factor2)}, Sum)"
    interaction = f"{term1}:{term2}"
    model, anova = fit_type3(sub, f"{q(dependent)} ~ {term1} * {term2}")

    # Satu pass groupby untuk descriptives per sel (faktor1 × faktor2) DAN sel Levene.
    groups = [
        ((str(l1), str(l2)), g.astype(float))
        for (l1, l2), g in sub.groupby([factor1, factor2], sort=True)[dependent]
    ]
    desc_rows = [
        [l1, l2, len(g), float(g.mean()), float(g.std(ddof=1))] for (l1, l2), g in groups
    ]
    descriptives = table(
        "descriptives",
        "Descriptive Statistics",
        [factor1, factor2, "N", "Mean", "Std. Deviation"],
        desc_rows,
        notes=[f"Dependent Variable: {dependent}"],
    )

    # Levene pada sel desain (butuh tiap sel ≥ 2 data agar varian terdefinisi).
    tables = [descriptives]
    cells = [g for _, g in groups]
    decisions = []
    if all(len(c) >= 2 for c in cells) and len(cells) >= 2:
        lev_stat, lev_p = stats.levene(*cells, center="mean")
        tables.append(
            table(
                "levene",
                "Levene's Test of Equality of Error Variances",
                ["F", "df1", "df2", "Sig."],
                [[float(lev_stat), len(cells) - 1, n - len(cells), float(lev_p)]],
                notes=["Menguji H0: varian error variabel terikat sama antar sel desain."],
            )
        )
        decisions.append(
            decision(
                "homogenitas",
                "Homogenitas varian (Levene)",
                "Sig. > 0,05",
                float(lev_p),
                0.05,
                VERDICT_LOLOS if lev_p > 0.05 else VERDICT_PERHATIAN,
                (
                    f"Uji Levene Sig. {fmt_id(float(lev_p))} > 0,05 → varian antar sel homogen."
                    if lev_p > 0.05
                    else f"Uji Levene Sig. {fmt_id(float(lev_p))} < 0,05 → varian tidak homogen; "
                    "interpretasikan uji F dengan hati-hati."
                ),
            )
        )
    else:
        warnings.append("Ada sel desain dengan < 2 data — uji Levene dilewati.")

    tables.append(
        between_subjects_table(
            model,
            anova,
            dependent,
            sub,
            {term1: factor1, term2: factor2, interaction: f"{factor1} * {factor2}"},
        )
    )

    for did, label, p in (
        ("efek_" + factor1, f"Pengaruh {factor1} terhadap {dependent}", effect_p(anova, term1)),
        ("efek_" + factor2, f"Pengaruh {factor2} terhadap {dependent}", effect_p(anova, term2)),
        (
            "interaksi",
            f"Interaksi {factor1} × {factor2} terhadap {dependent}",
            effect_p(anova, interaction),
        ),
    ):
        significant = p < 0.05
        decisions.append(
            decision(
                did,
                label,
                "Sig. < 0,05",
                p,
                0.05,
                VERDICT_LOLOS if significant else VERDICT_TIDAK_LOLOS,
                (
                    f"{label}: Sig. {fmt_id(p)} < 0,05 → signifikan."
                    if significant
                    else f"{label}: Sig. {fmt_id(p)} > 0,05 → tidak signifikan."
                ),
            )
        )

    return build_result("uji_anova_dua_arah", tables, decisions, n=n, warnings=warnings)

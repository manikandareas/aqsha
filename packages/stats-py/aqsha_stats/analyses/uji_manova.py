"""One-Way MANOVA (SPSS GLM Multivariate): beda ≥2 variabel terikat antar grup."""

from __future__ import annotations

import pandas as pd

from ..contract import (
    VERDICT_LOLOS,
    VERDICT_TIDAK_LOLOS,
    AnalysisError,
    build_result,
    decision,
    fmt_id,
    table,
)
from ..io import listwise_numeric, require_arg
from ._glm import q

# Urutan tampil SPSS "Multivariate Tests" (nama di statsmodels → label SPSS).
MULTIVARIATE_STATS = (
    ("Pillai's trace", "Pillai's Trace"),
    ("Wilks' lambda", "Wilks' Lambda"),
    ("Hotelling-Lawley trace", "Hotelling's Trace"),
    ("Roy's greatest root", "Roy's Largest Root"),
)


def run(df: pd.DataFrame, args: dict) -> dict:
    from statsmodels.multivariate.manova import MANOVA

    dependents = [str(c) for c in require_arg(args, "dependents")]
    group = str(require_arg(args, "group"))
    if len(dependents) < 2:
        raise AnalysisError(
            "invalid_args", "uji_manova membutuhkan minimal 2 variabel terikat ('dependents')."
        )
    sub, warnings = listwise_numeric(df, dependents + [group], numeric=dependents)
    n = len(sub)
    # Satu pass groupby (label str, sort) untuk validasi level + descriptives.
    by_level = {str(lvl): g for lvl, g in sub.groupby(sub[group].astype(str), sort=True)}
    levels = list(by_level)
    if len(levels) < 2:
        raise AnalysisError(
            "invalid_args", f"Kolom grup '{group}' hanya punya {len(levels)} kategori; butuh ≥ 2."
        )

    # Descriptive Statistics per variabel terikat per grup.
    desc_rows = [
        [dep, lvl, len(g), float(g[dep].mean()), float(g[dep].std(ddof=1))]
        for dep in dependents
        for lvl, g in by_level.items()
    ]
    descriptives = table(
        "descriptives",
        "Descriptive Statistics",
        ["Variabel", group, "N", "Mean", "Std. Deviation"],
        desc_rows,
    )

    group_term = f"C({q(group)})"
    formula = " + ".join(q(dep) for dep in dependents) + f" ~ {group_term}"
    result = MANOVA.from_formula(formula, data=sub).mv_test()
    stat = result.results[group_term]["stat"]

    rows = []
    wilks_p = float("nan")
    for sm_name, spss_label in MULTIVARIATE_STATS:
        r = stat.loc[sm_name]
        p_value = float(r["Pr > F"])
        if sm_name == "Wilks' lambda":
            wilks_p = p_value
        rows.append(
            [spss_label, float(r["Value"]), float(r["F Value"]), float(r["Num DF"]),
             float(r["Den DF"]), p_value]
        )
    multivariate = table(
        "multivariate",
        "Multivariate Tests",
        ["Effect", "Value", "F", "Hypothesis df", "Error df", "Sig."],
        rows,
        notes=[f"Effect: {group}. Design: Intercept + {group}."],
    )

    significant = wilks_p < 0.05
    decisions = [
        decision(
            "manova_wilks",
            f"Perbedaan simultan {', '.join(dependents)} antar {group}",
            "Sig. Wilks' Lambda < 0,05",
            wilks_p,
            0.05,
            VERDICT_LOLOS if significant else VERDICT_TIDAK_LOLOS,
            (
                f"Wilks' Lambda Sig. {fmt_id(wilks_p)} < 0,05 → terdapat perbedaan signifikan "
                f"kombinasi {', '.join(dependents)} antar kategori {group}."
                if significant
                else f"Wilks' Lambda Sig. {fmt_id(wilks_p)} > 0,05 → tidak terdapat perbedaan "
                f"signifikan kombinasi {', '.join(dependents)} antar kategori {group}."
            ),
        )
    ]

    return build_result("uji_manova", [descriptives, multivariate], decisions, n=n, warnings=warnings)

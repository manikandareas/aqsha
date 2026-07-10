"""Regresi logistik biner (SPSS Binary Logistic): Omnibus, Model Summary, Variables in Equation."""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..contract import (
    AnalysisError,
    VERDICT_LOLOS,
    VERDICT_TIDAK_LOLOS,
    build_result,
    decision,
    fmt_id,
    table,
)
from ..io import listwise, require_arg


def run(df: pd.DataFrame, args: dict) -> dict:
    import statsmodels.api as sm
    from scipy import stats as sstats

    dependent = str(require_arg(args, "dependent"))
    independents = list(require_arg(args, "independents"))
    if len(independents) < 1:
        raise AnalysisError("invalid_args", "Regresi logistik butuh minimal 1 variabel bebas.")

    sub, warnings = listwise(df, [dependent, *independents])
    y_raw = pd.to_numeric(sub[dependent], errors="coerce")
    uniques = sorted(y_raw.dropna().unique())
    if len(uniques) != 2:
        raise AnalysisError(
            "invalid_args",
            f"Variabel terikat '{dependent}' harus biner (2 nilai, mis. 0/1); ditemukan {len(uniques)} nilai unik.",
        )
    # Kategori tertinggi = kejadian (1), pola SPSS default (kode terbesar = target).
    y = (y_raw == uniques[1]).astype(int)
    X = sm.add_constant(sub[independents].astype(float))
    try:
        model = sm.Logit(y, X).fit(disp=0)
        null = sm.Logit(y, np.ones((len(y), 1))).fit(disp=0)
    except Exception as exc:  # noqa: BLE001
        raise AnalysisError("computation_failed", f"Model logistik gagal konvergen: {exc}")

    n = len(sub)
    ll_full = float(model.llf)
    ll_null = float(null.llf)
    chi2_omnibus = 2 * (ll_full - ll_null)
    df_model = len(independents)
    omnibus_p = float(sstats.chi2.sf(chi2_omnibus, df_model))
    cox_snell = 1 - np.exp((2 / n) * (ll_null - ll_full))
    nagelkerke = cox_snell / (1 - np.exp((2 / n) * ll_null))

    omnibus = table(
        "omnibus",
        "Omnibus Tests of Model Coefficients",
        ["", "Chi-square", "df", "Sig."],
        [["Model", float(chi2_omnibus), df_model, omnibus_p]],
    )
    summary = table(
        "model_summary",
        "Model Summary",
        ["-2 Log likelihood", "Cox & Snell R Square", "Nagelkerke R Square"],
        [[-2 * ll_full, float(cox_snell), float(nagelkerke)]],
    )

    wald = (model.params / model.bse) ** 2
    rows = []
    decisions = []
    for name in ["const", *independents]:
        b = float(model.params[name])
        se = float(model.bse[name])
        w = float(wald[name])
        p = float(model.pvalues[name])
        exp_b = float(np.exp(b))
        label = "(Constant)" if name == "const" else name
        rows.append([label, b, se, w, 1, p, exp_b])
        if name == "const":
            continue
        sig = bool(p < 0.05)
        decisions.append(
            decision(
                f"logit_{name}",
                f"Pengaruh {name}",
                "Sig. < 0,05",
                p,
                0.05,
                VERDICT_LOLOS if sig else VERDICT_TIDAK_LOLOS,
                (
                    f"Variabel {name} memiliki Sig. {fmt_id(p)} < 0,05 dengan Exp(B) {fmt_id(exp_b)}, "
                    f"sehingga {name} berpengaruh signifikan terhadap peluang {dependent}."
                    if sig
                    else f"Variabel {name} memiliki Sig. {fmt_id(p)} > 0,05, sehingga {name} tidak "
                    f"berpengaruh signifikan terhadap peluang {dependent}."
                ),
            )
        )
    variables = table(
        "variables_in_equation",
        "Variables in the Equation",
        ["", "B", "S.E.", "Wald", "df", "Sig.", "Exp(B)"],
        rows,
        notes=[f"a. Dependent Variable: {dependent} (event = {uniques[1]})."],
    )
    decisions.insert(
        0,
        decision(
            "omnibus",
            "Kelayakan model (Omnibus)",
            "Sig. < 0,05",
            omnibus_p,
            0.05,
            VERDICT_LOLOS if omnibus_p < 0.05 else VERDICT_TIDAK_LOLOS,
            (
                f"Uji Omnibus Chi-square {fmt_id(float(chi2_omnibus))} dengan Sig. {fmt_id(omnibus_p)} < 0,05 "
                f"→ model logistik layak; Nagelkerke R² {fmt_id(float(nagelkerke))} menjelaskan variasi peluang {dependent}."
                if omnibus_p < 0.05
                else f"Uji Omnibus Sig. {fmt_id(omnibus_p)} > 0,05 → model belum layak menjelaskan {dependent}."
            ),
        ),
    )
    return build_result("regresi_logistik", [omnibus, summary, variables], decisions, n=n, warnings=warnings)

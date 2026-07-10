"""CB-SEM (covariance-based SEM ala AMOS/lavaan) via semopy (MIT).

Kolom item bisa mengandung titik/spasi yang merusak parser sintaks lavaan —
seluruh kolom & laten di-rename ke token aman sebelum membangun deskripsi
model, lalu dipetakan balik untuk tampilan.
"""

from __future__ import annotations

import pandas as pd

from ..contract import (
    VERDICT_LOLOS,
    VERDICT_PERHATIAN,
    VERDICT_TIDAK_LOLOS,
    build_result,
    decision,
    fmt_id,
    table,
)
from ._sem import parse_sem_spec

# Cutoff fit baku pelaporan skripsi (Hair dkk.).
CFI_CUTOFF = 0.90
RMSEA_CUTOFF = 0.08


def _num(value) -> float | None:
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f


def run(df: pd.DataFrame, args: dict) -> dict:
    import semopy

    latents, edges, sub, warnings = parse_sem_spec(df, args)
    n = len(sub)

    # Rename ke token aman: item → v<i>, laten → L<i> (atau item tunggal = observed).
    item_token = {item: f"v{i}" for i, item in enumerate(sub.columns)}
    lv_token: dict[str, str] = {}
    measurement_lines = []
    for i, (name, items) in enumerate(latents.items()):
        if len(items) == 1:
            lv_token[name] = item_token[items[0]]  # observed variable, tanpa =~
        else:
            lv_token[name] = f"L{i}"
            lv_token_items = " + ".join(item_token[item] for item in items)
            measurement_lines.append(f"L{i} =~ {lv_token_items}")

    structural_lines = []
    targets: dict[str, list[str]] = {}
    for source, target in edges:
        targets.setdefault(target, []).append(source)
    for target, sources in targets.items():
        structural_lines.append(
            f"{lv_token[target]} ~ " + " + ".join(lv_token[s] for s in sources)
        )
    description = "\n".join(measurement_lines + structural_lines)

    renamed = sub.rename(columns=item_token).astype(float)
    model = semopy.Model(description)
    solver = model.fit(renamed)
    if not getattr(solver, "success", True):
        warnings.append("Optimizer semopy tidak konvergen penuh — interpretasikan dengan hati-hati.")

    token_display = {v: k for k, v in item_token.items()}
    token_display.update({v: k for k, v in lv_token.items()})

    inspection = model.inspect(std_est=True)
    latent_tokens = set(lv_token.values())
    edge_set = set(edges)
    loading_rows = []
    structural_rows = []
    for _, r in inspection.iterrows():
        if r["op"] != "~":
            continue
        lval, rval = str(r["lval"]), str(r["rval"])
        source = token_display.get(rval, rval)
        target = token_display.get(lval, lval)
        values = [
            _num(r["Estimate"]),
            _num(r.get("Est. Std")),
            _num(r["Std. Err"]),
            _num(r["z-value"]),
            _num(r["p-value"]),
        ]
        if (source, target) in edge_set:
            # structural: target ~ source (jalur yang memang diminta di args).
            structural_rows.append([source, target, *values])
        elif rval in latent_tokens:
            # measurement: item ~ laten (loading); loading pertama difiksasi 1.
            loading_rows.append([source, target, *values])

    loadings = table(
        "loadings",
        "Measurement Model (Factor Loadings)",
        ["Laten", "Item", "Estimate", "Standardized", "Std. Error", "C.R. (z)", "Sig."],
        loading_rows,
        notes=["Loading pertama tiap laten difiksasi 1 (unstandardized) — lihat kolom Standardized."],
    )
    structural = table(
        "structural",
        "Regression Weights (Structural Paths)",
        ["Dari", "Ke", "Estimate", "Standardized", "Std. Error", "C.R. (z)", "Sig."],
        structural_rows,
    )

    stats_df = semopy.calc_stats(model)
    fit = {name: _num(stats_df[name].iloc[0]) for name in stats_df.columns}
    fit_table = table(
        "fit",
        "Goodness of Fit",
        ["Indeks", "Nilai", "Cutoff"],
        [
            ["Chi-Square", fit.get("chi2"), "diharapkan kecil"],
            ["df", fit.get("DoF"), None],
            ["Sig. (Chi-Square)", fit.get("chi2 p-value"), "> 0,05"],
            ["CFI", fit.get("CFI"), "≥ 0,90"],
            ["TLI", fit.get("TLI"), "≥ 0,90"],
            ["GFI", fit.get("GFI"), "≥ 0,90"],
            ["AGFI", fit.get("AGFI"), "≥ 0,90"],
            ["RMSEA", fit.get("RMSEA"), "≤ 0,08"],
            ["AIC", fit.get("AIC"), None],
            ["BIC", fit.get("BIC"), None],
        ],
    )

    decisions = []
    cfi = fit.get("CFI")
    if cfi is not None:
        decisions.append(
            decision(
                "fit_cfi",
                "Kecocokan model (CFI)",
                f"CFI ≥ {fmt_id(CFI_CUTOFF, 2)}",
                cfi,
                CFI_CUTOFF,
                VERDICT_LOLOS if cfi >= CFI_CUTOFF else VERDICT_PERHATIAN,
                (
                    f"CFI {fmt_id(cfi)} ≥ {fmt_id(CFI_CUTOFF, 2)} → model fit baik."
                    if cfi >= CFI_CUTOFF
                    else f"CFI {fmt_id(cfi)} < {fmt_id(CFI_CUTOFF, 2)} → model kurang fit; "
                    "pertimbangkan respesifikasi model."
                ),
            )
        )
    rmsea = fit.get("RMSEA")
    if rmsea is not None:
        decisions.append(
            decision(
                "fit_rmsea",
                "Kecocokan model (RMSEA)",
                f"RMSEA ≤ {fmt_id(RMSEA_CUTOFF, 2)}",
                rmsea,
                RMSEA_CUTOFF,
                VERDICT_LOLOS if rmsea <= RMSEA_CUTOFF else VERDICT_PERHATIAN,
                (
                    f"RMSEA {fmt_id(rmsea)} ≤ {fmt_id(RMSEA_CUTOFF, 2)} → kesalahan aproksimasi model rendah."
                    if rmsea <= RMSEA_CUTOFF
                    else f"RMSEA {fmt_id(rmsea)} > {fmt_id(RMSEA_CUTOFF, 2)} → model kurang fit."
                ),
            )
        )
    for source, target, _est, std, _se, _z, p in structural_rows:
        significant = p is not None and p < 0.05
        decisions.append(
            decision(
                f"path_{source}_{target}",
                f"Pengaruh {source} → {target}",
                "Sig. < 0,05",
                p if p is not None else float("nan"),
                0.05,
                VERDICT_LOLOS if significant else VERDICT_TIDAK_LOLOS,
                (
                    f"{source} berpengaruh signifikan terhadap {target} "
                    f"(koefisien terstandardisasi {fmt_id(std)}, Sig. {fmt_id(p)} < 0,05)."
                    if significant
                    else f"{source} tidak berpengaruh signifikan terhadap {target} "
                    f"(Sig. {fmt_id(p)} > 0,05)."
                ),
            )
        )

    return build_result(
        "cb_sem",
        [loadings, structural, fit_table],
        decisions,
        n=n,
        warnings=warnings,
        extra_meta={"semopy": semopy.__version__, "model": description},
    )

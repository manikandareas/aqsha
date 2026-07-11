"""SEM-PLS ala SmartPLS via openpls-engine — dieksekusi sebagai PROGRAM TERPISAH.

openpls-engine ber-lisensi GPL-3.0: TIDAK di-import di sini. Semua komputasi
terjadi di `openpls_driver.py` (file GPL terpisah) yang dipanggil sebagai
subprocess dengan IPC JSON stdin/stdout. Modul ini hanya menyiapkan data,
memformat tabel gaya SmartPLS, dan menghitung verdict dari angka driver.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

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
from ._sem import parse_sem_spec

BOOTSTRAP_DEFAULT = 1000
# Floor rendah dipakai test/preview; untuk pelaporan gunakan ≥ 500 (default 1000).
BOOTSTRAP_MIN = 100
# Engine murni-Python ±50 ms/iterasi — 2000 menjaga run < timeout heavy (300 dtk).
BOOTSTRAP_MAX = 2000
LOADING_CUTOFF = 0.7
AVE_CUTOFF = 0.5
CR_CUTOFF = 0.7
HTMT_CUTOFF = 0.9
SRMR_CUTOFF = 0.10
DRIVER_TIMEOUT_SECONDS = 280


def _driver_path() -> Path:
    env = os.environ.get("AQSHA_OPENPLS_DRIVER")
    candidates = [Path(env)] if env else []
    candidates += [
        Path("/opt/aqsha-stats/openpls_driver.py"),  # image sandbox (Dockerfile)
        Path(__file__).resolve().parents[2] / "openpls_driver.py",  # checkout repo (tests)
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise AnalysisError(
        "sem_pls_unavailable",
        "Driver PLS-SEM tidak ditemukan di lingkungan ini — snapshot sandbox perlu di-rebuild "
        "dengan openpls_driver.py.",
    )


def _run_driver(spec: dict) -> dict:
    driver = _driver_path()
    try:
        proc = subprocess.run(
            [sys.executable, str(driver)],
            input=json.dumps(spec),
            capture_output=True,
            text=True,
            timeout=DRIVER_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        raise AnalysisError(
            "pls_timeout",
            f"PLS-SEM melebihi batas waktu {DRIVER_TIMEOUT_SECONDS} detik — "
            "kurangi jumlah bootstrap atau jumlah indikator, lalu coba lagi.",
        )
    try:
        payload = json.loads(proc.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        tail = (proc.stderr or proc.stdout or "").strip()[-300:]
        raise AnalysisError("pls_failed", f"Driver PLS-SEM gagal: {tail or 'output kosong'}")
    error = payload.get("error")
    if error:
        raise AnalysisError(error.get("code", "pls_failed"), error.get("message", "PLS-SEM gagal."))
    return payload


def _rows(frame: dict) -> dict[str, dict[str, float | None]]:
    """{"index_label": {column: value}} dari frame JSON driver."""
    return {
        idx: dict(zip(frame["columns"], row))
        for idx, row in zip(frame["index"], frame["rows"])
    }


def _p_from_t(t: float | None) -> float | None:
    if t is None:
        return None
    return float(2 * stats.norm.sf(abs(t)))


def run(df: pd.DataFrame, args: dict) -> dict:
    latents, edges, sub, warnings = parse_sem_spec(df, args)
    n = len(sub)
    requested = int(args.get("bootstrap") or BOOTSTRAP_DEFAULT)
    iterations = max(BOOTSTRAP_MIN, min(requested, BOOTSTRAP_MAX))
    if iterations != requested:
        warnings.append(
            f"Jumlah bootstrap disesuaikan dari {requested} menjadi {iterations} "
            f"(rentang yang didukung {BOOTSTRAP_MIN}–{BOOTSTRAP_MAX})."
        )

    seed = int(os.environ.get("AQSHA_STATS_SEED", "42"))
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as tmp:
        sub.to_csv(tmp.name, index=False)
        csv_path = tmp.name
    try:
        payload = _run_driver(
            {
                "csv": csv_path,
                "latents": latents,
                "paths": [[source, target] for source, target in edges],
                "iterations": iterations,
                "seed": seed,
            }
        )
    finally:
        Path(csv_path).unlink(missing_ok=True)

    outer = _rows(payload["outer_model"])
    boot_loading = _rows(payload["boot_loading"])
    indicator_lv = {item: lv for lv, items in latents.items() for item in items}
    loading_rows = []
    for indicator, row in outer.items():
        loading = row.get("loading")
        t_stat = (boot_loading.get(indicator) or {}).get("t stat.")
        loading_rows.append(
            [indicator_lv.get(indicator, "?"), indicator, loading, t_stat, _p_from_t(t_stat)]
        )
    loading_rows.sort(key=lambda r: (r[0], r[1]))
    # default nan (bukan inf): nilai kosong tidak boleh lolos pembanding cutoff.
    min_loading = min((r[2] for r in loading_rows if r[2] is not None), default=float("nan"))
    outer_loadings = table(
        "outer_loadings",
        "Outer Loadings",
        ["Laten", "Indikator", "Loading", "T Statistics", "P Values"],
        loading_rows,
        notes=[f"Rule of thumb: loading ≥ {fmt_id(LOADING_CUTOFF, 2)} (0,50–0,70 masih dapat diterima)."],
    )

    reliability = _rows(payload["reliability"])
    inner = _rows(payload["inner_summary"])
    reliability_rows = []
    for lv in latents:
        rel = reliability.get(lv) or {}
        reliability_rows.append(
            [lv, rel.get("cronbach_alpha"), rel.get("dillon_goldstein_rho"), (inner.get(lv) or {}).get("ave")]
        )
    min_alpha = min((r[1] for r in reliability_rows if r[1] is not None), default=float("nan"))
    min_cr = min((r[2] for r in reliability_rows if r[2] is not None), default=float("nan"))
    min_ave = min((r[3] for r in reliability_rows if r[3] is not None), default=float("nan"))
    construct_reliability = table(
        "reliability",
        "Construct Reliability and Validity",
        ["Laten", "Cronbach's Alpha", "Composite Reliability", "AVE"],
        reliability_rows,
        notes=["Composite Reliability = Dillon-Goldstein's rho. Cutoff: CR ≥ 0,70; AVE ≥ 0,50."],
    )

    fornell = payload["fornell_larcker"]
    fornell_table = table(
        "fornell_larcker",
        "Discriminant Validity (Fornell-Larcker)",
        ["Laten", *fornell["columns"]],
        [[idx, *row] for idx, row in zip(fornell["index"], fornell["rows"])],
        notes=["Diagonal = √AVE; harus lebih besar dari korelasi antar laten di kolom/barisnya."],
    )

    htmt_frame = payload["htmt"]
    htmt_rows = []
    for row in htmt_frame["rows"]:
        entry = dict(zip(htmt_frame["columns"], row))
        htmt_rows.append([entry.get("lv_a"), entry.get("lv_b"), entry.get("htmt")])
    max_htmt = max((r[2] for r in htmt_rows if r[2] is not None), default=float("nan"))
    htmt_table = table(
        "htmt",
        "Discriminant Validity (HTMT)",
        ["Laten A", "Laten B", "HTMT"],
        htmt_rows,
        notes=[f"Cutoff HTMT < {fmt_id(HTMT_CUTOFF, 2)}."],
    )

    r_square_rows = [
        [lv, row.get("r_squared"), row.get("r_squared_adj")]
        for lv, row in inner.items()
        if row.get("type") == "Endogenous" or (row.get("r_squared") or 0) > 0
    ]
    r_square = table("r_square", "R Square", ["Laten", "R Square", "R Square Adjusted"], r_square_rows)

    boot_paths = _rows(payload["boot_paths"])
    path_rows = []
    for path_label, row in boot_paths.items():
        t_stat = row.get("t stat.")
        path_rows.append(
            [
                path_label,
                row.get("original"),
                row.get("mean"),
                row.get("std.error"),
                t_stat,
                _p_from_t(t_stat),
                row.get("perc.025"),
                row.get("perc.975"),
            ]
        )
    path_table = table(
        "path_coefficients",
        "Path Coefficients (Bootstrap)",
        [
            "Jalur",
            "Original Sample (O)",
            "Sample Mean (M)",
            "Std. Error",
            "T Statistics",
            "P Values",
            "CI 2.5%",
            "CI 97.5%",
        ],
        path_rows,
        notes=[f"Bootstrap {payload['meta']['iterations']} sampel, seed tetap {seed}."],
    )

    effects_frame = payload["effects"]
    effects_table = table(
        "effects",
        "Direct, Indirect, and Total Effects",
        ["Jalur", "Direct", "Indirect", "Total"],
        [
            [idx, *(dict(zip(effects_frame["columns"], row)).get(k) for k in ("direct", "indirect", "total"))]
            for idx, row in zip(effects_frame["index"], effects_frame["rows"])
        ],
    )

    srmr = payload["model_fit"]["srmr"]
    fit_table = table(
        "model_fit",
        "Model Fit",
        ["Indeks", "Nilai", "Cutoff"],
        [["SRMR", srmr, f"< {fmt_id(SRMR_CUTOFF, 2)}"], ["d_ULS", payload["model_fit"]["d_uls"], None]],
    )

    decisions = [
        decision(
            "validitas_konvergen",
            "Validitas konvergen (loading & AVE)",
            f"Loading ≥ {fmt_id(LOADING_CUTOFF, 2)} dan AVE ≥ {fmt_id(AVE_CUTOFF, 2)}",
            min_loading,
            LOADING_CUTOFF,
            (
                VERDICT_LOLOS
                if min_loading >= LOADING_CUTOFF and min_ave >= AVE_CUTOFF
                else VERDICT_PERHATIAN
                if min_loading >= 0.5 and min_ave >= AVE_CUTOFF
                else VERDICT_TIDAK_LOLOS
            ),
            (
                f"Seluruh outer loading ≥ {fmt_id(LOADING_CUTOFF, 2)} dan AVE ≥ "
                f"{fmt_id(AVE_CUTOFF, 2)} → validitas konvergen terpenuhi."
                if min_loading >= LOADING_CUTOFF and min_ave >= AVE_CUTOFF
                else f"Loading terendah {fmt_id(min_loading)} / AVE terendah {fmt_id(min_ave)} — "
                "indikator di bawah 0,70 dapat dipertahankan bila AVE ≥ 0,50; bila tidak, "
                "pertimbangkan mengeluarkan indikator tersebut."
            ),
        ),
        decision(
            "reliabilitas",
            "Reliabilitas konstruk (CR & Cronbach's Alpha)",
            f"CR ≥ {fmt_id(CR_CUTOFF, 2)}",
            min_cr,
            CR_CUTOFF,
            VERDICT_LOLOS if min_cr >= CR_CUTOFF else VERDICT_TIDAK_LOLOS,
            (
                f"Seluruh Composite Reliability ≥ {fmt_id(CR_CUTOFF, 2)} "
                f"(alpha terendah {fmt_id(min_alpha)}) → konstruk reliabel."
                if min_cr >= CR_CUTOFF
                else f"Ada konstruk dengan CR {fmt_id(min_cr)} < {fmt_id(CR_CUTOFF, 2)} → "
                "reliabilitas belum terpenuhi."
            ),
        ),
        decision(
            "validitas_diskriminan",
            "Validitas diskriminan (HTMT)",
            f"HTMT < {fmt_id(HTMT_CUTOFF, 2)}",
            max_htmt,
            HTMT_CUTOFF,
            VERDICT_LOLOS if max_htmt < HTMT_CUTOFF else VERDICT_PERHATIAN,
            (
                f"HTMT tertinggi {fmt_id(max_htmt)} < {fmt_id(HTMT_CUTOFF, 2)} (dan kriteria "
                "Fornell-Larcker terpenuhi, lihat tabel) → validitas diskriminan terpenuhi."
                if max_htmt < HTMT_CUTOFF
                else f"HTMT tertinggi {fmt_id(max_htmt)} ≥ {fmt_id(HTMT_CUTOFF, 2)} → ada pasangan "
                "laten yang kurang terdiferensiasi."
            ),
        ),
        decision(
            "model_fit",
            "Kecocokan model (SRMR)",
            f"SRMR < {fmt_id(SRMR_CUTOFF, 2)}",
            srmr,
            SRMR_CUTOFF,
            VERDICT_LOLOS if srmr < SRMR_CUTOFF else VERDICT_PERHATIAN,
            (
                f"SRMR {fmt_id(srmr)} < {fmt_id(SRMR_CUTOFF, 2)} → model fit dapat diterima."
                if srmr < SRMR_CUTOFF
                else f"SRMR {fmt_id(srmr)} ≥ {fmt_id(SRMR_CUTOFF, 2)} → model kurang fit."
            ),
        ),
    ]
    for path_label, _o, _m, _se, t_stat, p_value, _lo, _hi in path_rows:
        significant = p_value is not None and p_value < 0.05
        decisions.append(
            decision(
                f"path_{path_label}",
                f"Signifikansi jalur {path_label}",
                "T Statistics > 1,96 (Sig. < 0,05)",
                t_stat if t_stat is not None else float("nan"),
                1.96,
                VERDICT_LOLOS if significant else VERDICT_TIDAK_LOLOS,
                (
                    f"Jalur {path_label} signifikan (T {fmt_id(t_stat)} > 1,96; "
                    f"P {fmt_id(p_value)} < 0,05)."
                    if significant
                    else f"Jalur {path_label} tidak signifikan (T {fmt_id(t_stat)}; "
                    f"P {fmt_id(p_value)})."
                ),
            )
        )

    return build_result(
        "sem_pls",
        [
            outer_loadings,
            construct_reliability,
            fornell_table,
            htmt_table,
            r_square,
            path_table,
            effects_table,
            fit_table,
        ],
        decisions,
        n=n,
        warnings=warnings,
        extra_meta={
            "bootstrap": payload["meta"]["iterations"],
            "openpls_engine": payload["meta"]["engine"],
            "scheme": "path",
        },
    )

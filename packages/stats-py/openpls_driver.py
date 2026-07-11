# SPDX-License-Identifier: GPL-3.0-or-later
#
# openpls_driver — standalone PLS-SEM compute driver around openpls-engine (GPL-3.0).
#
# LICENSE ISOLATION: this file is licensed GPL-3.0-or-later and is the ONLY code
# in this repository that imports the GPL `openpls` package. It runs as a separate
# program (subprocess) and communicates with the proprietary `aqsha_stats` package
# exclusively via JSON on stdin/stdout — no linking in either direction. Do NOT
# import `aqsha_stats` here, and do NOT import `openpls` anywhere else.
#
# Protocol:
#   stdin  : {"csv": path, "latents": {lv: [cols]}, "paths": [[src, dst], ...],
#             "iterations": int, "seed": int}
#   stdout : one JSON object (result or {"error": {"code", "message"}})
#
# Determinism: multiprocessing start method "fork" + np.random.seed + processes=1
# so the single bootstrap child inherits the seeded RNG state.

from __future__ import annotations

import contextlib
import json
import multiprocessing
import sys


def _frame(df) -> dict:
    return {
        "index": [str(i) for i in df.index],
        "columns": [str(c) for c in df.columns],
        "rows": [[_cell(v) for v in row] for row in df.to_numpy()],
    }


def _cell(value):
    if isinstance(value, str):
        return value
    try:
        f = float(value)
    except (TypeError, ValueError):
        return str(value)
    return None if f != f else f  # NaN -> None


def compute(spec: dict) -> dict:
    import numpy as np
    import pandas as pd
    from openpls import Plspm, config as cfg, scheme
    from openpls.mode import Mode

    df = pd.read_csv(spec["csv"])
    latents: dict[str, list[str]] = spec["latents"]
    iterations = int(spec.get("iterations", 1000))

    structure = cfg.Structure()
    targets: dict[str, list[str]] = {}
    for source, target in spec["paths"]:
        targets.setdefault(target, []).append(source)
    for target, sources in targets.items():
        structure.add_path(sources, [target])

    config = cfg.Config(structure.path(), scaled=True)
    for name, cols in latents.items():
        config.add_lv(name, Mode.A, *[cfg.MV(c) for c in cols])

    np.random.seed(int(spec.get("seed", 42)))
    plspm = Plspm(
        df,
        config,
        scheme.Scheme.PATH,  # path weighting scheme (default SmartPLS)
        300,
        bootstrap=True,
        bootstrap_iterations=iterations,
        processes=1,
    )

    bootstrap = plspm.bootstrap()
    fornell = plspm.fornell_larcker()
    fit = plspm.model_fit()
    return {
        "outer_model": _frame(plspm.outer_model()),
        "boot_loading": _frame(bootstrap.loading()),
        "boot_paths": _frame(bootstrap.paths()),
        "reliability": _frame(plspm.reliability()),
        "inner_summary": _frame(plspm.inner_summary()),
        "fornell_larcker": _frame(fornell.matrix()),
        "htmt": _frame(plspm.htmt().pairs()),
        "effects": _frame(plspm.effects()),
        "model_fit": {"srmr": float(fit.srmr()), "d_uls": float(fit.d_uls())},
        "meta": {"iterations": iterations, "engine": _engine_version()},
    }


def _engine_version() -> str:
    try:
        from importlib.metadata import version

        return version("openpls-engine")
    except Exception:
        return "unknown"


def main() -> None:
    try:
        multiprocessing.set_start_method("fork", force=True)
    except (RuntimeError, ValueError):
        pass
    try:
        spec = json.load(sys.stdin)
    except ValueError as exc:
        print(json.dumps({"error": {"code": "invalid_spec", "message": f"Spec bukan JSON: {exc}"}}))
        return
    try:
        # stdout dicadangkan untuk SATU baris JSON hasil — print liar dari engine
        # (progress/warning) dialihkan ke stderr agar tak mengotori kanal IPC.
        with contextlib.redirect_stdout(sys.stderr):
            result = compute(spec)
    except ModuleNotFoundError as exc:
        result = {
            "error": {
                "code": "openpls_missing",
                "message": f"Package PLS-SEM tidak terpasang di lingkungan ini ({exc.name}).",
            }
        }
    except Exception as exc:  # driver contract: never crash without JSON
        result = {"error": {"code": "pls_failed", "message": f"{type(exc).__name__}: {exc}"}}
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()

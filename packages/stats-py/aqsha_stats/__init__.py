"""aqsha-stats: deterministic SPSS-parity statistics engine.

In-process API (used by the TS service inside Daytona codeRun):
    run_analysis(analysis_id, data_path, args) -> result dict (raises AnalysisError)
    run_analysis_safe(analysis_id, data_path, args) -> result dict or {"error": ...}
"""

from __future__ import annotations

import os

from .contract import AnalysisError

__version__ = "0.1.0"

__all__ = ["__version__", "AnalysisError", "run_analysis", "run_analysis_safe"]


def run_analysis(analysis_id: str, data_path: str, args: dict) -> dict:
    """Run one analysis and return the result contract dict.

    Raises AnalysisError on user errors (unknown analysis, column not found,
    bad args, unreadable file).
    """
    import numpy as np

    np.random.seed(int(os.environ.get("AQSHA_STATS_SEED", "42")))

    from .io import load_dataset
    from .registry import ANALYSES

    if analysis_id not in ANALYSES:
        raise AnalysisError(
            "unknown_analysis",
            f"Analisis '{analysis_id}' tidak dikenal. Analisis tersedia: "
            f"{', '.join(sorted(ANALYSES))}",
        )
    if not isinstance(args, dict):
        raise AnalysisError("invalid_args", "Argumen analisis harus berupa objek JSON.")

    df = load_dataset(data_path)
    return ANALYSES[analysis_id](df, args)


def run_analysis_safe(analysis_id: str, data_path: str, args: dict) -> dict:
    """Like run_analysis but never raises; errors come back as {"error": {...}}."""
    try:
        return run_analysis(analysis_id, data_path, args)
    except AnalysisError as exc:
        return {"error": {"code": exc.code, "message": exc.message}}
    except Exception as exc:  # noqa: BLE001 - contract: never raise
        return {"error": {"code": "internal", "message": f"{type(exc).__name__}: {exc}"}}

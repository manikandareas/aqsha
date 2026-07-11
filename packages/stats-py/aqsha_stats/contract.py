"""Result-JSON contract helpers shared by every analysis."""

from __future__ import annotations

import math
import os
from typing import Any, Iterable

VERSION = "0.1.0"

VERDICT_LOLOS = "lolos"
VERDICT_TIDAK_LOLOS = "tidak_lolos"
VERDICT_PERHATIAN = "perhatian"

_VERDICTS = (VERDICT_LOLOS, VERDICT_TIDAK_LOLOS, VERDICT_PERHATIAN)


def stats_seed() -> int:
    """Shared RNG seed (env ``AQSHA_STATS_SEED``, default 42) — echoed in ``meta.seed``.

    Single source so every analysis that needs randomness (bootstrap CI, etc.)
    is reproducible against the seed reported in the result.
    """
    return int(os.environ.get("AQSHA_STATS_SEED", "42"))


class AnalysisError(Exception):
    """Structured user-facing analysis error (code + Indonesian message)."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def r3(value: Any, decimals: int = 3) -> Any:
    """Round numerics to SPSS-style 3 decimals; NaN/inf -> None; rest passthrough."""
    if value is None or isinstance(value, (str, bool)):
        return value
    try:
        f = float(value)
    except (TypeError, ValueError):
        return value
    if math.isnan(f) or math.isinf(f):
        return None
    if f.is_integer():
        return int(f)
    return round(f, decimals)


def fmt_id(value: Any, decimals: int = 3) -> str:
    """Format a number for Indonesian interpretation strings (comma decimal separator)."""
    if value is None:
        return "-"
    f = float(value)
    if math.isnan(f) or math.isinf(f):
        return "-"
    return f"{f:.{decimals}f}".replace(".", ",")


def table(
    table_id: str,
    title: str,
    columns: list[str],
    rows: Iterable[Iterable[Any]],
    notes: list[str] | None = None,
) -> dict:
    return {
        "id": table_id,
        "title": title,
        "columns": list(columns),
        "rows": [[r3(v) for v in row] for row in rows],
        "notes": list(notes or []),
    }


def decision(
    decision_id: str,
    label: str,
    rule: str,
    value: Any,
    cutoff: Any,
    verdict: str,
    interpretation: str,
) -> dict:
    # Explicit validation (not `assert`, which `python -O` strips) — an invalid verdict
    # must never reach a persisted result.
    if verdict not in _VERDICTS:
        raise ValueError(f"verdict tidak valid: {verdict!r}; harus salah satu dari {_VERDICTS}")
    return {
        "id": decision_id,
        "label": label,
        "rule": rule,
        "value": r3(value),
        "cutoff": r3(cutoff),
        "verdict": verdict,
        "interpretation": interpretation,
    }


def _package_versions() -> dict[str, str]:
    import numpy
    import pandas
    import pingouin
    import scipy
    import statsmodels

    return {
        "numpy": numpy.__version__,
        "pandas": pandas.__version__,
        "scipy": scipy.__version__,
        "statsmodels": statsmodels.__version__,
        "pingouin": pingouin.__version__,
    }


def build_result(
    analysis: str,
    tables: list[dict],
    decisions: list[dict],
    n: int,
    warnings: list[str] | None = None,
    extra_meta: dict | None = None,
) -> dict:
    meta = {
        "n": int(n),
        "seed": stats_seed(),
        "packages": _package_versions(),
        "warnings": list(warnings or []),
    }
    if extra_meta:
        meta.update(extra_meta)
    return {
        "analysis": analysis,
        "version": VERSION,
        "tables": tables,
        "decisions": decisions,
        "meta": meta,
    }

"""Shared spec parsing for SEM analyses (cb_sem & sem_pls).

Kontrak args:
    latents: {"NamaLaten": ["item1", "item2", ...], ...}
    paths:   ["X1 -> Y", "X2 -> Y", ...]  (juga menerima panah "→")
"""

from __future__ import annotations

import re

import pandas as pd

from ..contract import AnalysisError
from ..io import listwise_numeric, require_arg

_ARROW = re.compile(r"\s*(?:->|→)\s*")


def parse_sem_spec(
    df: pd.DataFrame, args: dict
) -> tuple[dict[str, list[str]], list[tuple[str, str]], pd.DataFrame, list[str]]:
    """Validate latents/paths args; returns (latents, edges, listwise numeric df, warnings)."""
    raw_latents = require_arg(args, "latents")
    if not isinstance(raw_latents, dict) or not raw_latents:
        raise AnalysisError(
            "invalid_args",
            'Argumen "latents" harus objek {NamaLaten: [kolom item, ...]} dengan minimal 1 laten.',
        )
    latents: dict[str, list[str]] = {}
    for name, cols in raw_latents.items():
        items = [str(c) for c in (cols if isinstance(cols, list) else [cols])]
        if not items:
            raise AnalysisError("invalid_args", f'Laten "{name}" tidak punya item.')
        latents[str(name)] = items

    raw_paths = require_arg(args, "paths")
    edges: list[tuple[str, str]] = []
    for entry in raw_paths if isinstance(raw_paths, list) else [raw_paths]:
        parts = _ARROW.split(str(entry).strip())
        if len(parts) != 2 or not parts[0] or not parts[1]:
            raise AnalysisError(
                "invalid_args", f'Path "{entry}" tidak valid — tulis sebagai "X -> Y".'
            )
        source, target = parts
        for lv in (source, target):
            if lv not in latents:
                raise AnalysisError(
                    "invalid_args",
                    f'Path "{entry}" menyebut laten "{lv}" yang tidak ada di "latents".',
                )
        if source == target:
            raise AnalysisError("invalid_args", f'Path "{entry}" menunjuk ke laten itu sendiri.')
        edges.append((source, target))
    if not edges:
        raise AnalysisError("invalid_args", 'Argumen "paths" butuh minimal 1 jalur "X -> Y".')

    all_items = [item for items in latents.values() for item in items]
    if len(set(all_items)) != len(all_items):
        raise AnalysisError("invalid_args", "Ada item yang dipakai lebih dari satu laten.")
    # Item bernama sama dengan laten LAIN membuat jalur & loading ambigu di output
    # (kecuali laten 1-item yang memang menunjuk kolomnya sendiri).
    ambiguous = sorted(
        item for item in set(all_items) if item in latents and latents[item] != [item]
    )
    if ambiguous:
        raise AnalysisError(
            "invalid_args",
            f'Nama kolom item sama dengan nama laten: {", ".join(ambiguous)} — '
            "ganti nama laten tersebut agar tidak ambigu.",
        )
    sub, warnings = listwise_numeric(df, all_items)
    if len(sub) < 30:
        warnings.append(f"Data valid hanya {len(sub)} baris — SEM idealnya n ≥ 100.")
    return latents, edges, sub, warnings

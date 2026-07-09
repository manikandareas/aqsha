"""Analysis registry — sync-source for the TS catalog.

ANALYSIS_IDS is parsed textually by a bun sync-test; keep it a plain literal
tuple with one simple string per line.
"""

from __future__ import annotations

from importlib import import_module

ANALYSIS_IDS = (
    "profile",
    "descriptive",
    "uji_validitas",
    "uji_reliabilitas",
    "uji_normalitas",
    "uji_multikolinearitas",
    "uji_heteroskedastisitas",
    "uji_autokorelasi",
    "uji_linearitas",
    "regresi_linear",
    "korelasi",
)

ANALYSES = {
    analysis_id: import_module(f".analyses.{analysis_id}", __package__).run
    for analysis_id in ANALYSIS_IDS
}


def list_analyses() -> list[str]:
    return list(ANALYSIS_IDS)

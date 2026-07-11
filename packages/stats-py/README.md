# aqsha-stats

Deterministic statistics engine for Aqsha — SPSS-parity analyses for Indonesian
thesis (skripsi) rituals: uji validitas, reliabilitas, asumsi klasik, regresi
linear, korelasi, uji beda (Tier 2), sampai analisis faktor, GLM (two-way
ANOVA/ANCOVA/MANOVA), CB-SEM (semopy), dan SEM-PLS ala SmartPLS (Tier 3).
Pure computation, no LLM/network calls; verdicts and Indonesian
interpretations are produced deterministically in Python.

## PLS-SEM & license isolation

`sem_pls` never imports the GPL `openpls-engine`: all PLS computation happens
in `openpls_driver.py` (a standalone GPL-3.0 file, NOT part of the
`aqsha_stats` package/wheel) executed as a subprocess with JSON stdin/stdout
IPC. The engine is installed via the `sandbox` dependency group
(`uv sync --group sandbox`, baked into the Docker image); driver lookup order:
`AQSHA_OPENPLS_DRIVER` env → `/opt/aqsha-stats/openpls_driver.py` (image) →
repo checkout (tests). Bootstrap is seed-deterministic (fork start method +
`processes=1`).

## CLI

```bash
python -m aqsha_stats run <analysis> --data <path> --args '<json>'
```

Prints exactly one JSON object to stdout. On failure it prints
`{"error": {"code", "message"}}` and exits with code 1.

```bash
python -m aqsha_stats run regresi_linear \
  --data data.csv \
  --args '{"dependent": "Y", "independents": ["X1", "X2"]}'
```

Supported data formats: `.csv` (utf-8, `;` or `,` separator), `.xlsx`, `.sav`.
Available analysis ids live in `aqsha_stats/registry.py` (`list_analyses()`),
which is the sync-source for the TS catalog.

Seed: env `AQSHA_STATS_SEED` (default 42), echoed in `meta.seed`.

## Tests

```bash
uv sync --group sandbox   # sandbox group = openpls-engine (tes sem_pls di-skip tanpanya)
uv run pytest
```

Golden-fixture tests run against `tests/fixtures/likert100.csv` (generated once
by `tests/fixtures/generate.py`, committed) and cross-check headline numbers
with independent formula implementations.

# aqsha-stats

Deterministic statistics engine for Aqsha — SPSS-parity analyses for Indonesian
thesis (skripsi) rituals: uji validitas, reliabilitas, asumsi klasik, regresi
linear, dan korelasi. Pure computation, no LLM/network calls; verdicts and
Indonesian interpretations are produced deterministically in Python.

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
uv sync
uv run pytest
```

Golden-fixture tests run against `tests/fixtures/likert100.csv` (generated once
by `tests/fixtures/generate.py`, committed) and cross-check headline numbers
with independent formula implementations.

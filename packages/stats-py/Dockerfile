# Deterministic statistics engine image for the Aqsha sandbox (Daytona).
# `python -m aqsha_stats run ...` works out of the box, and the bare `python`
# REPL has matplotlib available for plt.show() chart capture.
FROM python:3.12-slim

# No MPLBACKEND here: Daytona instruments plt.show() in its own runtime and
# must be free to pick the backend used for chart capture.
ENV PIP_NO_CACHE_DIR=1 \
    PYTHONUNBUFFERED=1

WORKDIR /opt/aqsha-stats
COPY pyproject.toml uv.lock README.md ./

# Pin EXACT resolved versions from uv.lock so every snapshot build is byte-for-byte
# the same stack — the "deterministic SPSS-parity" guarantee. `pip install .` alone
# floats deps to whatever the index serves that day (scipy/statsmodels/pingouin p-values
# shift in the 3rd-4th decimal → verdicts flip at the p=0.05 boundary; golden tests stay
# green against a different local env). Export the lock to pinned requirements and
# install BEFORE copying source, so code edits don't bust the heavy dependency layer.
# `--group sandbox` menyertakan openpls-engine (GPL) yang hanya hidup di image ini,
# bukan sebagai dependency package.
RUN pip install uv \
 && uv export --frozen --no-dev --group sandbox --no-emit-project --no-hashes -o /tmp/requirements.txt \
 && pip install -r /tmp/requirements.txt

COPY aqsha_stats ./aqsha_stats
# Driver PLS-SEM (GPL-3.0, file terpisah — BUKAN bagian package aqsha_stats):
# dieksekusi sebagai subprocess oleh sem_pls; satu-satunya kode yang import openpls.
COPY openpls_driver.py ./openpls_driver.py
RUN pip install --no-deps .

# Nothing needs network at runtime: lookup tables are embedded in the package.
WORKDIR /home/daytona

CMD ["python"]

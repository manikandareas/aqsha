# syntax=docker/dockerfile:1
# Bukti gate Fase 4 di Linux: tectonic musl + biber 2.17 (wajib persis — bundle
# default tectonic 0.16.x memuat biblatex 3.17) + bun, cache bundle di-warm saat
# build, lalu gate test dijalankan TANPA jaringan.
FROM ubuntu:22.04

ARG TECTONIC_VERSION=0.16.9
ARG BUN_VERSION=1.3.10

RUN apt-get update \
 && apt-get install -y --no-install-recommends biber ca-certificates curl unzip \
 && rm -rf /var/lib/apt/lists/* \
 && biber --version | grep -q "2\.17"

RUN arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
      amd64) triple=x86_64-unknown-linux-musl ;; \
      arm64) triple=aarch64-unknown-linux-musl ;; \
      *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-${triple}.tar.gz" \
      | tar -xz -C /usr/local/bin tectonic \
 && tectonic --version

RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
ENV PATH="/root/.bun/bin:${PATH}" \
    TECTONIC_CACHE_DIR=/opt/tectonic-cache \
    TECTONIC_UNTRUSTED_MODE=1

WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile

# Warm cache bundle — satu-satunya langkah yang boleh menyentuh jaringan bundle.
RUN mkdir /tmp/warm \
 && cp packages/services/test/fixtures/latex/sample-main.tex /tmp/warm/main.tex \
 && cp packages/services/test/fixtures/latex/sample-refs.bib /tmp/warm/refs.bib \
 && cp packages/services/test/fixtures/latex/pixel.png /tmp/warm/ \
 && cd /tmp/warm \
 && mkdir -p out \
 && tectonic --untrusted --synctex --keep-logs --keep-intermediates --outdir out main.tex \
 && test -s out/main.pdf && test -s out/main.synctex.gz && test -s out/main.bbl \
 && rm -rf /tmp/warm

# Bukti inti: gate harness lengkap berjalan TANPA jaringan (cache-only).
RUN --network=none cd packages/services \
 && bun test test/latex-gate.test.ts test/latex-compile-service.test.ts test/latex-runner.test.ts

# Pre-baked Daytona snapshot image for the Aqsha statistical verification engine.
#
# This account's Daytona tier has NO sandbox egress (see the spike result in
# memory astra-agent-2-redesign-research), so every R + Python verification
# dependency must already live in this image — nothing is installed at runtime.
# The Convex runner (packages/convex/convex/agent/sandbox/sandboxRunner.ts)
# creates a sandbox from a snapshot built off this image, uploads its R scripts
# into /workspace, and runs them with no network access.
#
# Build + push is automated by .github/workflows/statverify-snapshot.yml; create
# the Daytona snapshot from the pushed image (see README.md), then set
# DAYTONA_STATVERIFY_SNAPSHOT on the Convex deployment.

FROM r-base:4.4.1

# System deps for compiling the R / Python scientific stack. The -dev headers
# are required to build common R package C/C++ backends from source:
#   libuv1-dev                         → fs
#   libcurl4-openssl-dev, libssl-dev   → curl / httr / openssl
#   libxml2-dev                        → xml2
#   libfontconfig1/freetype/png/...    → systemfonts / textshaping / ragg
#   libharfbuzz-dev, libfribidi-dev    → textshaping
#   libgit2-dev                        → gert
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip \
      libuv1-dev libcurl4-openssl-dev libssl-dev libxml2-dev \
      libfontconfig1-dev libfreetype6-dev libpng-dev libtiff5-dev libjpeg-dev \
      libharfbuzz-dev libfribidi-dev libgit2-dev \
    && rm -rf /var/lib/apt/lists/*

# R deps:
#   statcheck         — NHST p-value consistency (Slice 1.1)
#   scrutiny, rsprite2 — GRIM / GRIMMER (Slice 1.3)
#   pwr               — prospective power analysis (Slice 1.3)
#   metafor           — meta-analysis (reserved, tier-gated)
#   jsonlite          — JSON stdout the runner parses
RUN R -e "install.packages(c('statcheck','scrutiny','rsprite2','metafor','pwr','jsonlite'), repos='https://cloud.r-project.org')"

# Fail the build loudly if any target package did not install — install.packages()
# only warns on a per-package compile failure, which would otherwise ship a
# broken snapshot (e.g. a missing scrutiny → no GRIM).
RUN R -e "pkgs <- c('statcheck','scrutiny','rsprite2','metafor','pwr','jsonlite'); missing <- pkgs[!vapply(pkgs, requireNamespace, logical(1), quietly = TRUE)]; if (length(missing)) { cat('MISSING R PACKAGES:', paste(missing, collapse = ', '), '\n'); quit(status = 1) }; cat('all R packages present\n')"

# Python deps — reserved for future checks; no current R script depends on these,
# but they are pre-baked now so the snapshot does not need a rebuild later.
RUN pip3 install --break-system-packages --no-cache-dir \
      scipy statsmodels pandas numpy pingouin

WORKDIR /workspace

# Note: the spike ran statcheck against the public r-base image directly and
# Daytona kept the sandbox alive on its own, so no keep-alive CMD is needed. If a
# future Daytona tier requires the container to stay up, add:
#   CMD ["sleep", "infinity"]

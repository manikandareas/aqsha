FROM oven/bun:1.3.10-slim

WORKDIR /workspace

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates fontconfig fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

COPY . .

RUN bun install --frozen-lockfile --filter @aqsha/api

WORKDIR /workspace/apps/api

ENV NODE_ENV=production
ENV ASTRA_ENABLE_SKILL_SCRIPTS=true

CMD ["bun", "--version"]

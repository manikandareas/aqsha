# Daytona Visual Runtime

Build and publish this image, then set `DAYTONA_IMAGE` to the published image tag.

```bash
docker build -t ghcr.io/<owner>/aqsha-daytona-visual:python3.12 apps/api/runtime/daytona-visual
docker push ghcr.io/<owner>/aqsha-daytona-visual:python3.12
```

Then configure:

```env
DAYTONA_IMAGE=ghcr.io/<owner>/aqsha-daytona-visual:python3.12
```

The image intentionally contains only stable external Python dependencies. Aqsha source files are uploaded into the sandbox per run.

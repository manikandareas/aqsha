# Prebuilt Research Sandbox image

Aqsha uses a prebuilt Research Sandbox container image for Daytona-backed Deep Research execution instead of installing dependencies during each run. The image is built from the repo and published to GitHub Container Registry through GitHub Actions so Bun, trusted skill scripts, and visualization dependencies such as Vega are versioned, reproducible, and fast to start inside one sandbox per Deep Research run.

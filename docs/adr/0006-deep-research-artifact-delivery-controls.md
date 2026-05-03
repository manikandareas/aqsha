# Deep Research artifact delivery controls

Aqsha treats the Artifact Manifest as the source of truth for visual artifacts embedded in a Deep Research final Markdown report. A run may produce a Multi-visual Final Report with several audited PNG artifacts, and each artifact is embedded only when its audit status is `passed`. Optional visual failures become Visual Omission records in the Research Trail and audit metadata, not notes in the final Markdown report, while a Primary Visual Deliverable failure can fail the run.

Deep Research uses phase-aware retry for render and upload failures before retrying earlier research phases. Retry attempts are recorded as new attempts linked to the original phase, visual ID, or artifact lineage instead of overwriting history. The V1 automatic retry limit is one transient retry for render or upload.

Cancellation uses `cancel_requested` only as a transition state and `canceled` as the terminal state. Cancellation is propagated to model streaming, Research Sub-agents, sandbox execution, rendering, and artifact publishing where providers support it. Canceled runs are not resumed automatically in V1; later continuation should create a derived run.

This trades a simpler single-chart/single-run model for auditable artifact delivery that can handle real final reports with multiple visuals. It also avoids repeating source discovery for narrow delivery failures while preserving enough event history to debug retries, omissions, orphan published artifacts, and classified failures.

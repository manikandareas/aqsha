# API-owned agent runtime

Aqsha runs Astra and Deep Research orchestration inside `apps/api` rather than a separate `apps/agents` service. The previous standalone agent app is no longer part of the active repo, and keeping the runtime API-owned avoids reopening a service split while `apps/api` already owns authenticated chat, run events, artifact persistence, UploadThing publishing, and trusted skill execution boundaries.

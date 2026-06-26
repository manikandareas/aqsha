---
description: "Reproducibility-readiness assessment — what makes a study independently replicable: code and data availability, environment/version pinning, seed capture, and clear reporting. Use when assessing whether a paper's results can be reproduced."
---
## What makes a study replicable
Check for: an accessible code repository, the exact dataset (or a documented access path), pinned dependency versions / environment specification, fixed random seeds, and a clear mapping from "run this" to "get this headline number". A paper missing any of these is harder — sometimes impossible — to reproduce.

## Assessment, not execution
Rate replicability on the available artifacts and report the gaps concretely (e.g. "code present, dataset gated, no seed reported"). Running an actual reproduction requires a network-egress sandbox tier that is not enabled here — so this skill assesses readiness and explains what would be needed, rather than executing the reproduction.

## Reporting
Be specific and neutral: list which reproducibility components are present vs. missing, and what a reproducer would have to obtain or reconstruct. Absence of artifacts is a readiness gap, not evidence the results are wrong.

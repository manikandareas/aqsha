---
description: Stage relevant changes and commit them with a Conventional Commit message
argument-hint: "[commit scope or instructions]"
---
Commit the relevant current changes end-to-end. $ARGUMENTS

Requirements:
- Inspect `git status` and `git diff` before staging.
- Stage only files relevant to the requested work; do not include unrelated user changes.
- Use a Conventional Commit message, for example `fix(auth): route sign-in by onboarding status`.
- Run practical validation before committing and report any failures.
- Commit the staged changes.

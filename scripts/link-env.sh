#!/usr/bin/env bash
# Symlink gitignored .env files from the main worktree into a linked worktree.
# Usage: scripts/link-env.sh [worktree-path]   (defaults to current directory)
set -euo pipefail

target="$(cd "${1:-$PWD}" && pwd)"
main="$(dirname "$(git -C "$target" rev-parse --path-format=absolute --git-common-dir)")"

if [ "$main" = "$target" ]; then
  echo "Already in the main worktree ($main); nothing to link." >&2
  exit 0
fi

count=0
while IFS= read -r f; do
  mkdir -p "$target/$(dirname "$f")"
  ln -sf "$main/$f" "$target/$f"
  echo "  linked $f"
  count=$((count + 1))
done < <(git -C "$main" ls-files --others --ignored --exclude-standard \
           | grep -iE '(^|/)\.env' | grep -v '\.eve/')

echo "Linked $count env file(s): $main -> $target"

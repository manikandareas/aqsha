#!/usr/bin/env python3
"""Audit visual artifact specs against an evidence ledger."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _ensure_src_on_path() -> None:
    app_root = Path(__file__).resolve().parents[3]
    src = app_root / "src"
    if src.as_posix() not in sys.path:
        sys.path.insert(0, src.as_posix())


_ensure_src_on_path()

from astra.artifacts import EvidenceLedger, VisualSpec, audit_visual_spec  # noqa: E402


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def audit(evidence_path: Path, visuals_path: Path) -> dict[str, object]:
    evidence = EvidenceLedger.from_raw(load_json(evidence_path))
    spec = VisualSpec.model_validate(load_json(visuals_path))
    return audit_visual_spec(evidence, spec).model_dump()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", required=True, type=Path, help="Evidence ledger JSON.")
    parser.add_argument("--visuals", required=True, type=Path, help="Visual spec JSON.")
    args = parser.parse_args()

    report = audit(args.evidence, args.visuals)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 1 if report["failed_visual_ids"] else 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Audit source IDs in a Markdown report against a JSON evidence ledger."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

REQUIRED_FIELDS = ("title", "source_type", "quality_tier")
CITATION_RE = re.compile(r"\[([S0-9,\s]+)\]")


def load_sources(path: Path) -> dict[str, dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    sources = data.get("sources", []) if isinstance(data, dict) else data
    if not isinstance(sources, list):
        raise ValueError("evidence ledger must be a list or an object with a sources list")

    result: dict[str, dict[str, Any]] = {}
    for item in sources:
        if not isinstance(item, dict):
            continue
        source_id = item.get("source_id") or item.get("id")
        if source_id:
            result[str(source_id)] = item
    return result


def extract_citations(text: str) -> set[str]:
    found: set[str] = set()
    for block in CITATION_RE.findall(text):
        for part in block.split(","):
            citation_id = part.strip()
            if re.fullmatch(r"S\d+", citation_id):
                found.add(citation_id)
    return found


def audit(report_path: Path, evidence_path: Path) -> dict[str, Any]:
    report = report_path.read_text(encoding="utf-8")
    sources = load_sources(evidence_path)
    citations = extract_citations(report)

    missing_fields: dict[str, list[str]] = {}
    for source_id, source in sources.items():
        missing = [field for field in REQUIRED_FIELDS if not source.get(field)]
        if not (source.get("url") or source.get("doi")):
            missing.append("url_or_doi")
        if missing:
            missing_fields[source_id] = missing

    unverified = sorted(
        source_id
        for source_id, source in sources.items()
        if source.get("verification_status") in {"unverified", "failed"}
    )

    unknown = sorted(citations - set(sources))
    unused = sorted(set(sources) - citations)

    return {
        "citation_count": len(citations),
        "source_count": len(sources),
        "unknown_citations": unknown,
        "unused_sources": unused,
        "missing_required_fields": missing_fields,
        "unverified_sources": unverified,
        "passed": not unknown and not missing_fields,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report_pos", nargs="?", type=Path, help="Markdown report to audit.")
    parser.add_argument("evidence_pos", nargs="?", type=Path, help="JSON evidence ledger.")
    parser.add_argument("--report", dest="report_opt", type=Path, help="Markdown report to audit.")
    parser.add_argument("--evidence", dest="evidence_opt", type=Path, help="JSON evidence ledger.")
    args = parser.parse_args()

    report_path = args.report_opt or args.report_pos
    evidence_path = args.evidence_opt or args.evidence_pos
    if report_path is None or evidence_path is None:
        parser.error("report and evidence paths are required")

    try:
        summary = audit(report_path, evidence_path)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"passed": False, "error": str(exc)}, indent=2), file=sys.stderr)
        return 2

    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0 if summary["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

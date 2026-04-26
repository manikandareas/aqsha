from __future__ import annotations

import json
import re
from hashlib import sha256
from typing import Any

from crewai.tools import BaseTool
from pydantic import BaseModel, Field


class SourceDedupeInput(BaseModel):
    sources_json: str = Field(
        description=(
            "JSON array of source-like objects with title, url, or doi."
        ),
    )


class SourceQualityScoreInput(BaseModel):
    source_json: str = Field(description="JSON object describing one source.")


def dedupe_sources(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []

    for source in sources:
        key = source_identity_key(source)
        if key in seen:
            continue
        seen.add(key)
        deduped.append({**source, "dedupe_key": key})

    return deduped


def source_identity_key(source: dict[str, Any]) -> str:
    for key in ("doi", "url"):
        value = source.get(key)
        if value:
            return f"{key}:{str(value).strip().lower()}"

    title = normalize_text(str(source.get("title") or ""))
    return "title:" + sha256(title.encode("utf-8")).hexdigest()


def score_source_quality(source: dict[str, Any]) -> dict[str, Any]:
    score = 0
    reasons: list[str] = []

    provenance = source.get("provenance")
    if provenance == "web":
        score += 15
        reasons.append("web source")

    if source.get("doi"):
        score += 25
        reasons.append("doi")
    if source.get("url"):
        score += 10
        reasons.append("resolvable url")
    if source.get("title"):
        score += 10
        reasons.append("title")
    if source.get("quote") or source.get("text") or source.get("abstract"):
        score += 5
        reasons.append("extractable text")

    return {
        "quality_score": min(score, 100),
        "quality_band": "high" if score >= 70 else "medium" if score >= 45 else "low",
        "reasons": reasons,
    }


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


class SourceDedupeTool(BaseTool):
    name: str = "source_dedupe"
    description: str = "Deterministically remove duplicate source objects."
    args_schema: type[BaseModel] = SourceDedupeInput

    def _run(self, sources_json: str) -> str:
        return json.dumps(dedupe_sources(json.loads(sources_json)), indent=2)


class SourceQualityScoreTool(BaseTool):
    name: str = "source_quality_score"
    description: str = "Deterministically score source quality from metadata."
    args_schema: type[BaseModel] = SourceQualityScoreInput

    def _run(self, source_json: str) -> str:
        return json.dumps(score_source_quality(json.loads(source_json)), indent=2)


def create_source_tools() -> list[BaseTool]:
    return [
        SourceDedupeTool(),
        SourceQualityScoreTool(),
    ]

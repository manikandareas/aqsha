from __future__ import annotations

import json
import os
import unittest
from unittest.mock import patch

from deep_research_agent.guardrails import (
    ensure_exa_is_configured,
    ensure_research_integrations_are_configured,
    validate_research_answer,
)
from deep_research_agent.main import DeepResearchFlow, merge_research_batches
from deep_research_agent.models import (
    ClaimEvidenceMap,
    EvidenceItem,
    EvidenceReview,
    FinalVerification,
    ResearchAnswer,
    ResearchBatch,
    ResearchPlan,
    RouterOutput,
    SupportedClaim,
)
from deep_research_agent.tools.source_tools import (
    SourceDedupeTool,
    dedupe_sources,
    score_source_quality,
)


class ResearchGuardrailsTest(unittest.TestCase):
    def test_citation_guardrail_rejects_unknown_evidence(self) -> None:
        batch = ResearchBatch(
            evidence_items=[
                EvidenceItem(
                    evidence_id="ev_01",
                    title="Primary Source",
                    url="https://example.com",
                    quote="Quoted evidence",
                    notes="Strong support",
                )
            ]
        )
        review = EvidenceReview(
            supported_claims=[
                SupportedClaim(
                    claim_id="claim_01",
                    statement="Supported statement",
                    confidence="high",
                    evidence_ids=["ev_01"],
                )
            ],
            evidence_sufficient=True,
        )
        answer = ResearchAnswer(
            answer="Supported statement [ev_99]",
            claim_ids_used=["claim_01"],
            claim_evidence_map=[
                ClaimEvidenceMap(claim_id="claim_01", evidence_ids=["ev_99"])
            ],
            source_evidence_ids=["ev_99"],
            limitations_text="",
            final_verification=FinalVerification(
                status="pass",
                verified_claim_ids=["claim_01"],
            ),
        )

        result = validate_research_answer(answer, batch, review)

        self.assertFalse(result.valid)
        self.assertIn("ev_99", result.message)

    def test_missing_exa_key_raises_clear_error(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, "EXA_API_KEY"):
                ensure_exa_is_configured()

    def test_research_integrations_only_require_exa(self) -> None:
        with patch.dict(os.environ, {"EXA_API_KEY": "exa"}, clear=True):
            self.assertIsNone(ensure_research_integrations_are_configured())

    def test_research_batches_are_merged_across_iterations(self) -> None:
        first_batch = ResearchBatch(
            evidence_items=[
                EvidenceItem(
                    evidence_id="ev_01",
                    title="First Source",
                    url="https://example.com/1",
                    quote="First quote",
                    notes="First support",
                )
            ],
            queries_used=["first query"],
        )
        second_batch = ResearchBatch(
            evidence_items=[
                EvidenceItem(
                    evidence_id="ev_02",
                    title="Second Source",
                    url="https://example.com/2",
                    quote="Second quote",
                    notes="Second support",
                )
            ],
            queries_used=["first query", "second query"],
            coverage_assessment="sufficient",
            coverage_notes="Enough evidence.",
        )

        merged = merge_research_batches(first_batch, second_batch)

        self.assertEqual(
            [item.evidence_id for item in merged.evidence_items],
            ["ev_01", "ev_02"],
        )
        self.assertEqual(merged.queries_used, ["first query", "second query"])
        self.assertEqual(merged.coverage_assessment, "sufficient")

    def test_flow_returns_clear_missing_exa_error(self) -> None:
        plan = ResearchPlan(
            research_questions=["What happened?"],
            search_queries=["example 1", "example 2", "example 3"],
            source_requirements=["primary sources"],
            answer_expectation="Answer directly.",
        )

        with patch.dict(os.environ, {}, clear=True):
            with patch(
                "deep_research_agent.main.route_user_intent",
                return_value=RouterOutput(
                    user_intent="search",
                    search_queries=["example 1", "example 2", "example 3"],
                    reasoning="Needs research.",
                ),
            ), patch(
                "deep_research_agent.main.run_planning_stage",
                return_value=plan,
            ):
                result = DeepResearchFlow().kickoff(
                    inputs={"user_message": "research this", "depth_mode": "standard"}
                )

        self.assertIn("EXA_API_KEY", result["response"])

    def test_source_dedupe_and_quality_score_are_deterministic(self) -> None:
        sources = [
            {"title": "A", "doi": "10.123/ABC", "provenance": "web"},
            {"title": "A duplicate", "doi": "10.123/abc", "provenance": "web"},
            {"title": "B", "url": "https://example.com/b", "provenance": "web"},
        ]

        deduped = dedupe_sources(sources)
        score = score_source_quality(
            {
                "title": "A",
                "url": "https://example.com/a",
                "doi": "10.123/abc",
                "provenance": "web",
                "quote": "Quoted evidence",
            }
        )

        self.assertEqual(len(deduped), 2)
        self.assertEqual(score["quality_band"], "medium")

    def test_source_dedupe_tool_accepts_json_string(self) -> None:
        tool = SourceDedupeTool()

        result = tool._run(
            sources_json=json.dumps(
                [
                    {"title": "A", "doi": "10.123/ABC"},
                    {"title": "A duplicate", "doi": "10.123/abc"},
                ]
            )
        )

        self.assertIn("dedupe_key", result)


if __name__ == "__main__":
    unittest.main()

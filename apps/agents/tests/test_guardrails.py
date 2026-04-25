from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from deep_research_agent.guardrails import (
    ensure_exa_is_configured,
    validate_research_answer,
)
from deep_research_agent.main import DeepResearchFlow
from deep_research_agent.models import (
    ClaimEvidenceMap,
    EvidenceItem,
    EvidenceReview,
    ResearchPlan,
    ResearchAnswer,
    ResearchBatch,
    RouterOutput,
    SupportedClaim,
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
        )

        result = validate_research_answer(answer, batch, review)

        self.assertFalse(result.valid)
        self.assertIn("ev_99", result.message)

    def test_missing_exa_key_raises_clear_error(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, "EXA_API_KEY"):
                ensure_exa_is_configured()

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


if __name__ == "__main__":
    unittest.main()

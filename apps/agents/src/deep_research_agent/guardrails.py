import os
from typing import Any, Tuple

from crewai.tasks.task_output import TaskOutput

from deep_research_agent.models import (
    EvidenceReview,
    ResearchAnswer,
    ResearchBatch,
    ResearchPlan,
)


class CitationValidationResult:
    def __init__(self, valid: bool, message: str = "") -> None:
        self.valid = valid
        self.message = message


def ensure_exa_is_configured() -> None:
    if not os.getenv("EXA_API_KEY"):
        raise ValueError("EXA_API_KEY is required to use Exa MCP")


def validate_research_plan_output(output: TaskOutput) -> Tuple[bool, Any]:
    plan = output.pydantic
    if not isinstance(plan, ResearchPlan):
        return False, "Planning task did not return a ResearchPlan."
    if len(plan.search_queries) < 3 or len(plan.search_queries) > 5:
        return False, "Research plan must contain 3 to 5 search queries."
    if not plan.research_questions:
        return False, "Research plan must include at least one research question."
    return True, output


def validate_research_batch_output(output: TaskOutput) -> Tuple[bool, Any]:
    batch = output.pydantic
    if not isinstance(batch, ResearchBatch):
        return False, "Source collection task did not return a ResearchBatch."
    if not batch.queries_used:
        return False, "Research batch must record at least one query."
    if not batch.candidate_sources:
        return False, "Research batch must contain at least one candidate source."
    for evidence in batch.evidence_items:
        if not evidence.quote.strip():
            return False, "Every evidence item must contain a verbatim quote."
    return True, output


def validate_evidence_review_output(output: TaskOutput) -> Tuple[bool, Any]:
    review = output.pydantic
    if not isinstance(review, EvidenceReview):
        return False, "Evidence review task did not return an EvidenceReview."
    if review.evidence_sufficient and not review.supported_claims:
        return False, "Evidence review cannot mark evidence sufficient without supported claims."
    return True, output


def validate_research_answer_shape(output: TaskOutput) -> Tuple[bool, Any]:
    answer = output.pydantic
    if not isinstance(answer, ResearchAnswer):
        return False, "Synthesis task did not return a ResearchAnswer."
    if not answer.answer.strip():
        return False, "Synthesis answer must not be empty."
    if not answer.claim_ids_used:
        return False, "Synthesis answer must cite at least one supported claim."
    if not answer.source_evidence_ids:
        return False, "Synthesis answer must cite at least one evidence source."
    return True, output


def validate_research_answer(
    answer: ResearchAnswer,
    batch: ResearchBatch,
    review: EvidenceReview,
) -> CitationValidationResult:
    supported_claim_ids = {claim.claim_id for claim in review.supported_claims}
    evidence_ids = {item.evidence_id for item in batch.evidence_items}

    for claim_id in answer.claim_ids_used:
        if claim_id not in supported_claim_ids:
            return CitationValidationResult(
                False,
                f"Claim '{claim_id}' is not supported by the evidence review.",
            )

    for mapping in answer.claim_evidence_map:
        claim_id = mapping.claim_id
        if claim_id not in supported_claim_ids:
            return CitationValidationResult(
                False,
                f"Claim mapping includes unknown claim '{claim_id}'.",
            )
        if not mapping.evidence_ids:
            return CitationValidationResult(
                False,
                f"Claim '{claim_id}' does not include any evidence ids.",
            )
        for evidence_id in mapping.evidence_ids:
            if evidence_id not in evidence_ids:
                return CitationValidationResult(
                    False,
                    f"Claim '{claim_id}' references unknown evidence '{evidence_id}'.",
                )

    for evidence_id in answer.source_evidence_ids:
        if evidence_id not in evidence_ids:
            return CitationValidationResult(
                False,
                f"Rendered source '{evidence_id}' is missing from the evidence pool.",
            )
        if f"[{evidence_id}]" not in answer.answer:
            return CitationValidationResult(
                False,
                f"The answer text is missing inline citation '[{evidence_id}]'.",
            )

    return CitationValidationResult(True)

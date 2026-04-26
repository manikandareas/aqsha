import os
from dataclasses import dataclass

from deep_research_agent.models import (
    EvidenceReview,
    ResearchAnswer,
    ResearchBatch,
)


@dataclass
class CitationValidationResult:
    valid: bool
    message: str = ""


def ensure_exa_is_configured() -> None:
    if not os.getenv("EXA_API_KEY"):
        raise ValueError("EXA_API_KEY is required to use Exa MCP")


def ensure_research_integrations_are_configured() -> None:
    ensure_exa_is_configured()


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

    claim_ids_with_mappings = {mapping.claim_id for mapping in answer.claim_evidence_map}
    for claim_id in answer.claim_ids_used:
        if claim_id not in claim_ids_with_mappings:
            return CitationValidationResult(
                False,
                f"Claim '{claim_id}' is missing from claim_evidence_map.",
            )

    for evidence_id in answer.source_evidence_ids:
        evidence = next(
            (item for item in batch.evidence_items if item.evidence_id == evidence_id),
            None,
        )
        if evidence is None:
            return CitationValidationResult(
                False,
                f"Rendered source '{evidence_id}' is missing from the evidence pool.",
            )
        if f"[{evidence_id}]" not in answer.answer:
            return CitationValidationResult(
                False,
                f"The answer text is missing inline citation '[{evidence_id}]'.",
            )
    if answer.final_verification.status != "pass":
        return CitationValidationResult(
            False,
            "Final verification critic did not pass the answer.",
        )

    return CitationValidationResult(True)

from __future__ import annotations

from datetime import datetime
from typing import Literal

from crewai.flow.flow import FlowState as BaseFlowState
from pydantic import BaseModel, Field


class Message(BaseModel):
    role: Literal["user", "assistant"] = "user"
    content: str
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())


class RouterOutput(BaseModel):
    user_intent: Literal["search", "casual_chat"]
    search_queries: list[str] = Field(default_factory=list)
    chat_response: str | None = None
    reasoning: str


class ResearchPlan(BaseModel):
    research_questions: list[str]
    search_queries: list[str]
    source_requirements: list[str]
    answer_expectation: str


class CandidateSource(BaseModel):
    candidate_id: str
    title: str
    url: str | None = None
    rationale: str
    status: Literal["candidate", "accepted", "rejected"] = "candidate"


class EvidenceItem(BaseModel):
    evidence_id: str
    candidate_id: str | None = None
    title: str | None = None
    url: str | None = None
    quote: str
    notes: str


class ResearchBatch(BaseModel):
    candidate_sources: list[CandidateSource] = Field(default_factory=list)
    evidence_items: list[EvidenceItem] = Field(default_factory=list)
    queries_used: list[str] = Field(default_factory=list)
    coverage_assessment: Literal["sufficient", "partial", "insufficient"] = "partial"
    coverage_notes: str = ""


class SupportedClaim(BaseModel):
    claim_id: str
    statement: str
    confidence: Literal["low", "medium", "high"]
    evidence_ids: list[str] = Field(default_factory=list)


class EvidenceReview(BaseModel):
    supported_claims: list[SupportedClaim] = Field(default_factory=list)
    unsupported_claims: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    next_queries: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    evidence_sufficient: bool = False
    iteration_recommendation: str = ""


class ClaimEvidenceMap(BaseModel):
    claim_id: str
    evidence_ids: list[str]


class ResearchAnswer(BaseModel):
    answer: str
    claim_ids_used: list[str]
    claim_evidence_map: list[ClaimEvidenceMap]
    source_evidence_ids: list[str]
    limitations_text: str


class ResearchFlowState(BaseFlowState):
    user_message: str = (
        "Hey, do a deep research on the Agentic AI Framework in the market as of 2026"
    )
    depth_mode: Literal["standard", "deep"] = "standard"
    message_history: list[Message] = Field(default_factory=list)
    search_queries: list[str] = Field(default_factory=list)
    chat_response: str | None = None
    response: str | None = None
    route_reasoning: str | None = None

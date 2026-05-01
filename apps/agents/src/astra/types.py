from pydantic import BaseModel, Field


class AstraPlan(BaseModel):
    """Structured output returned by the Astra orchestrator."""

    summary: str = Field(description="Short task outcome summary.")
    research: list[str] = Field(description="Facts, assumptions, or unknowns discovered.")
    plan: list[str] = Field(description="Ordered implementation or execution steps.")
    risks: list[str] = Field(description="Risks, edge cases, or tradeoffs to watch.")
    validation: list[str] = Field(description="Concrete checks that prove the work is correct.")

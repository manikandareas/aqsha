from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class AstraDeps:
    """Shared dependency context passed to Astra agents and tools."""

    user_id: str
    workspace: str
    conversation_id: str | None = None
    research_artifact_dir: Path | None = None
    constraints: tuple[str, ...] = field(default_factory=tuple)

    def describe(self) -> str:
        constraints = "; ".join(self.constraints) if self.constraints else "none"
        conversation_id = self.conversation_id or "none"
        artifact_dir = (
            self.research_artifact_dir.as_posix() if self.research_artifact_dir else "none"
        )
        return (
            f"user_id={self.user_id}; workspace={self.workspace}; "
            f"conversation_id={conversation_id}; research_artifact_dir={artifact_dir}; "
            f"constraints={constraints}"
        )

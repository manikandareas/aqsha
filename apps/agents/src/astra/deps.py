from dataclasses import dataclass, field


@dataclass(frozen=True)
class AstraDeps:
    """Shared dependency context passed to Astra agents and tools."""

    user_id: str
    workspace: str
    constraints: tuple[str, ...] = field(default_factory=tuple)

    def describe(self) -> str:
        constraints = "; ".join(self.constraints) if self.constraints else "none"
        return f"user_id={self.user_id}; workspace={self.workspace}; constraints={constraints}"

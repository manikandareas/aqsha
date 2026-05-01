from collections.abc import Sequence
from pathlib import Path

from pydantic_ai_skills import SkillsCapability, SkillsDirectory

APP_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SKILLS_DIR = APP_ROOT / "skills"


def build_skills_capability(
    directories: Sequence[str | Path] | None = None,
) -> SkillsCapability:
    """Build Astra's Agent Skills capability from trusted local skill directories."""

    skill_directories: list[str | Path | SkillsDirectory] = list(
        directories or (DEFAULT_SKILLS_DIR,)
    )
    return SkillsCapability(
        directories=skill_directories,
        validate=True,
        max_depth=3,
    )

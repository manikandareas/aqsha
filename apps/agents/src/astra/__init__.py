"""Astra agent package."""

from astra.agents import astra_agent, build_astra_agent
from astra.deps import AstraDeps
from astra.settings import AstraSettings

__all__ = [
    "AstraDeps",
    "AstraSettings",
    "astra_agent",
    "build_astra_agent",
]

__version__ = "0.1.0"

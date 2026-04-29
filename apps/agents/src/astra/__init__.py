"""Astra multi-agent package."""

from astra.agents import astra_agent, build_astra_agent
from astra.deps import AstraDeps
from astra.settings import AstraSettings
from astra.types import AstraPlan

__all__ = [
    "AstraDeps",
    "AstraPlan",
    "AstraSettings",
    "astra_agent",
    "build_astra_agent",
]

__version__ = "0.1.0"

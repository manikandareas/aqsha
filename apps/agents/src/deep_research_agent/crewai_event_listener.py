from __future__ import annotations

import re
from types import ModuleType
from typing import Any

from crewai.events.base_event_listener import BaseEventListener
from crewai.events.base_events import BaseEvent
from crewai.events.types import (
    agent_events,
    crew_events,
    flow_events,
    llm_events,
    mcp_events,
    task_events,
    tool_usage_events,
)

from deep_research_agent.persistence import current_agent_persistence, json_safe


EVENT_MODULES = [
    flow_events,
    crew_events,
    task_events,
    agent_events,
    tool_usage_events,
    mcp_events,
    llm_events,
]


def install_agent_event_listener() -> None:
    global _listener
    if _listener is None:
        _listener = AgentPersistenceEventListener()


class AgentPersistenceEventListener(BaseEventListener):
    def setup_listeners(self, crewai_event_bus: Any) -> None:
        for event_type in collect_event_types(EVENT_MODULES):
            crewai_event_bus.on(event_type)(self._handler_for(event_type))

    def _handler_for(self, event_type: type[BaseEvent]) -> Any:
        def handler(source: Any, event: BaseEvent) -> None:
            persistence = current_agent_persistence.get()
            if persistence is None:
                return

            raw_type = event.__class__.__name__
            persistence.record_event(
                {
                    "type": normalize_event_type(raw_type),
                    "status": infer_status(raw_type),
                    "title": humanize_event_type(raw_type),
                    "visibility": "internal",
                    "data": {
                        "source": json_safe(source),
                        "event": json_safe(event),
                    },
                    **event_dimensions(event),
                },
                source="crewai_event_bus",
                scope=infer_scope_from_module(event.__class__.__module__),
                raw_type=raw_type,
                raw_payload={"source": json_safe(source), "event": json_safe(event)},
            )

        return handler


def collect_event_types(modules: list[ModuleType]) -> list[type[BaseEvent]]:
    collected: list[type[BaseEvent]] = []
    seen: set[type[BaseEvent]] = set()
    for module in modules:
        for value in vars(module).values():
            if not isinstance(value, type):
                continue
            if value is BaseEvent or not issubclass(value, BaseEvent):
                continue
            if value in seen:
                continue
            seen.add(value)
            collected.append(value)
    return collected


def normalize_event_type(name: str) -> str:
    base = re.sub(r"Event$", "", name)
    words = re.sub(r"(?<!^)(?=[A-Z])", ".", base).lower()
    return words.replace("l.l.m", "llm").replace("m.c.p", "mcp")


def humanize_event_type(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", " ", re.sub(r"Event$", "", name))


def infer_status(name: str) -> str:
    lowered = name.lower()
    if "failed" in lowered or "error" in lowered:
        return "failed"
    if "completed" in lowered or "finished" in lowered:
        return "completed"
    if "started" in lowered or "requested" in lowered:
        return "running"
    return "running"


def infer_scope_from_module(module_name: str) -> str:
    if "flow_events" in module_name:
        return "flow"
    if "crew_events" in module_name:
        return "crew"
    if "task_events" in module_name:
        return "task"
    if "agent_events" in module_name:
        return "agent"
    if "tool_usage_events" in module_name:
        return "tool"
    if "mcp_events" in module_name:
        return "mcp"
    if "llm_events" in module_name:
        return "llm"
    return "run"


def event_dimensions(event: BaseEvent) -> dict[str, Any]:
    payload = json_safe(event)
    if not isinstance(payload, dict):
        return {}

    return {
        "step_name": first_present(payload, "step_name", "method_name", "flow_name"),
        "agent_role": first_present(payload, "agent_role", "role"),
        "task_name": first_present(payload, "task_name", "name"),
        "tool_name": first_present(payload, "tool_name"),
    }


def first_present(payload: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = payload.get(key)
        if value:
            return value
    return None


_listener: AgentPersistenceEventListener | None = None

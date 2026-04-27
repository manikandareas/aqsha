#!/usr/bin/env python
from __future__ import annotations

import json
import os
from typing import Any, Callable

from crewai import LLM
from crewai.flow import Flow, listen, persist, router, start

from deep_research_agent.crews.research_crew.crew import ResearchCrew
from deep_research_agent.guardrails import (
    ensure_research_integrations_are_configured,
    validate_research_answer,
)
from deep_research_agent.models import (
    EvidenceReview,
    Message,
    ResearchAnswer,
    ResearchBatch,
    ResearchFlowState,
    ResearchPlan,
    RouterOutput,
)

DEFAULT_MODEL = os.getenv("OPENAI_MODEL_NAME", "gpt-4.1-mini")
CASUAL_CHAT_ROUTE = "casual_chat"
SEARCH_ROUTE = "search"
EventSink = Callable[[dict[str, Any]], None]
ChunkSink = Callable[[dict[str, Any]], None]


def normalize_flow_inputs(inputs: dict[str, Any] | None = None) -> dict[str, Any]:
    normalized = dict(inputs or {})
    conversation_id = normalized.pop("conversation_id", None)

    if conversation_id and "id" not in normalized:
        normalized["id"] = conversation_id

    messages = normalized.get("messages")
    if "user_message" not in normalized and isinstance(messages, list):
        for message in reversed(messages):
            if not isinstance(message, dict):
                continue
            if message.get("role") == "user" and message.get("content"):
                normalized["user_message"] = str(message["content"])
                break

    normalized.setdefault("depth_mode", "standard")
    return normalized


def route_user_intent(
    *,
    user_message: str,
    message_history: list[Message],
    llm: LLM | None = None,
) -> RouterOutput:
    router_llm = llm or LLM(
        model=DEFAULT_MODEL,
        temperature=0.1,
        response_format=RouterOutput,
    )
    prompt = f"""
    <task>
    You are the router for a deep-research assistant. Decide whether the user
    needs casual chat or web research.
    </task>

    <routing_rules>
    Return "{CASUAL_CHAT_ROUTE}" only for:
    - greetings, thanks, farewells
    - simple meta questions about the assistant
    - short conversational messages that do not require external facts

    Return "{SEARCH_ROUTE}" for:
    - factual questions
    - comparisons, summaries, recommendations, analysis
    - broad research prompts and open-ended investigations
    - follow-up questions that need new evidence
    </routing_rules>

    <output_rules>
    If casual chat:
    - provide a short friendly reply in chat_response

    If search:
    - provide 3 to 5 search queries in search_queries
    - cover different search angles

    Always provide a one-sentence reasoning field.
    </output_rules>

    <inputs>
    Current message: {user_message}
    Conversation history:
    {json.dumps([message.model_dump() for message in message_history], indent=2)}
    </inputs>
    """
    return router_llm.call(prompt)


def run_planning_stage(state: ResearchFlowState) -> ResearchPlan:
    result = ResearchCrew().planning_crew().kickoff(
        inputs={
            "user_message": state.user_message,
            "depth_mode": state.depth_mode,
            "router_search_queries_json": json.dumps(
                state.suggested_search_queries,
                indent=2,
            ),
            "conversation_history_json": json.dumps(
                [message.model_dump() for message in state.message_history],
                indent=2,
            ),
        }
    )
    return extract_pydantic_output(result, ResearchPlan)


def run_evidence_stage(
    *,
    state: ResearchFlowState,
    plan: ResearchPlan,
    iteration: int,
    prior_batch: ResearchBatch | None,
    prior_review: EvidenceReview | None,
) -> tuple[ResearchBatch, EvidenceReview]:
    ensure_research_integrations_are_configured()
    result = ResearchCrew().evidence_crew().kickoff(
        inputs={
            "user_message": state.user_message,
            "depth_mode": state.depth_mode,
            "iteration_number": iteration + 1,
            "research_questions_json": json.dumps(plan.research_questions, indent=2),
            "plan_search_queries_json": json.dumps(plan.search_queries, indent=2),
            "router_search_queries_json": json.dumps(
                state.suggested_search_queries,
                indent=2,
            ),
            "source_requirements_json": json.dumps(
                plan.source_requirements, indent=2
            ),
            "prior_batch_json": dump_json(prior_batch),
            "prior_review_json": dump_json(prior_review),
            "prior_queries_json": json.dumps(state.search_queries, indent=2),
        }
    )

    batch = extract_named_task_pydantic(result, "collect_sources_task", ResearchBatch)
    review = extract_named_task_pydantic(
        result, "critique_evidence_task", EvidenceReview
    )
    return batch, review


def run_synthesis_stage(
    *,
    state: ResearchFlowState,
    plan: ResearchPlan,
    batch: ResearchBatch,
    review: EvidenceReview,
    audit_feedback: str | None = None,
) -> ResearchAnswer:
    result = ResearchCrew().synthesis_crew().kickoff(
        inputs={
            "user_message": state.user_message,
            "depth_mode": state.depth_mode,
            "research_questions_json": json.dumps(plan.research_questions, indent=2),
            "accepted_evidence_json": json.dumps(
                [item.model_dump() for item in batch.evidence_items],
                indent=2,
            ),
            "supported_claims_json": json.dumps(
                [claim.model_dump() for claim in review.supported_claims],
                indent=2,
            ),
            "limitations_json": json.dumps(review.limitations, indent=2),
            "audit_feedback": audit_feedback or "none",
        }
    )
    return extract_pydantic_output(result, ResearchAnswer)


def merge_research_batches(
    prior_batch: ResearchBatch | None,
    current_batch: ResearchBatch,
) -> ResearchBatch:
    if prior_batch is None:
        return current_batch

    candidate_sources = {
        candidate.candidate_id: candidate
        for candidate in prior_batch.candidate_sources
    }
    for candidate in current_batch.candidate_sources:
        candidate_sources[candidate.candidate_id] = candidate

    evidence_items = {
        evidence.evidence_id: evidence
        for evidence in prior_batch.evidence_items
    }
    for evidence in current_batch.evidence_items:
        evidence_items[evidence.evidence_id] = evidence

    queries_used = list(
        dict.fromkeys([*prior_batch.queries_used, *current_batch.queries_used])
    )

    return ResearchBatch(
        candidate_sources=list(candidate_sources.values()),
        evidence_items=list(evidence_items.values()),
        queries_used=queries_used,
        coverage_assessment=current_batch.coverage_assessment,
        coverage_notes=current_batch.coverage_notes,
    )


def extract_pydantic_output(result: Any, model_type: type[Any]) -> Any:
    if getattr(result, "pydantic", None) is not None:
        return result.pydantic

    for task_output in reversed(getattr(result, "tasks_output", [])):
        if isinstance(getattr(task_output, "pydantic", None), model_type):
            return task_output.pydantic

    raise ValueError(f"Unable to extract {model_type.__name__} from Crew output.")


def extract_named_task_pydantic(
    result: Any,
    task_name: str,
    model_type: type[Any],
) -> Any:
    for task_output in getattr(result, "tasks_output", []):
        if task_output.name == task_name and isinstance(
            getattr(task_output, "pydantic", None), model_type
        ):
            return task_output.pydantic

    return extract_pydantic_output(result, model_type)


def dump_json(model: Any) -> str:
    if model is None:
        return "null"
    if hasattr(model, "model_dump"):
        return json.dumps(model.model_dump(), indent=2)
    return json.dumps(model, indent=2)


def render_failure_response(message: str) -> dict[str, str]:
    return {"response": message}


def render_research_response(message: str) -> dict[str, str]:
    return {"response": message}


def render_chat_response(message: str) -> dict[str, str]:
    return {"chat_response": message}


def render_research_answer(
    answer: ResearchAnswer,
    batch: ResearchBatch,
) -> str:
    evidence_by_id = {item.evidence_id: item for item in batch.evidence_items}
    lines = [answer.answer.strip(), "", "Sources"]

    for evidence_id in answer.source_evidence_ids:
        evidence = evidence_by_id.get(evidence_id)
        if not evidence:
            continue

        title = evidence.title or evidence_id
        if evidence.url:
            lines.append(f"[{evidence_id}] {title} - {evidence.url}")
        else:
            lines.append(f"[{evidence_id}] {title}")

    return "\n".join(lines).strip()


@persist()
class DeepResearchFlow(Flow[ResearchFlowState]):
    event_sink: EventSink | None = None

    def emit_event(
        self,
        event_type: str,
        *,
        status: str = "running",
        title: str | None = None,
        visibility: str = "public",
        data: dict[str, Any] | None = None,
    ) -> None:
        sink = getattr(self, "event_sink", None)
        if sink is None:
            return

        sink(
            {
                "type": event_type,
                "status": status,
                "title": title or event_type,
                "visibility": visibility,
                "data": data or {},
            }
        )

    def add_message(self, role: str, content: str) -> None:
        self.state.message_history.append(Message(role=role, content=content))
        if role in {"user", "assistant"}:
            message = {"role": role, "content": content}
            if not self.state.messages or self.state.messages[-1] != message:
                self.state.messages.append(message)

    @start()
    def starting_flow(
        self,
        user_message: str | None = None,
        depth_mode: str = "standard",
    ) -> str:
        if not user_message:
            normalized = normalize_flow_inputs(
                {
                    "messages": self.state.messages,
                    "depth_mode": depth_mode,
                }
            )
            user_message = normalized.get("user_message")

        if user_message:
            self.state.user_message = user_message
        self.state.depth_mode = "deep" if depth_mode == "deep" else "standard"
        self.state.suggested_search_queries = []
        self.state.search_queries = []
        self.state.chat_response = None
        self.state.response = None
        self.add_message("user", self.state.user_message)
        return self.state.user_message

    @router(starting_flow)
    def classify_and_respond(self) -> str:
        self.emit_event(
            "router.started",
            title="Routing message",
            data={"message": self.state.user_message},
        )
        response = route_user_intent(
            user_message=self.state.user_message,
            message_history=self.state.message_history,
        )
        self.state.route_reasoning = response.reasoning

        if response.user_intent == CASUAL_CHAT_ROUTE:
            self.state.chat_response = (
                response.chat_response
                or "Ask a research question and I will investigate it."
            )
            self.emit_event(
                "router.completed",
                status="completed",
                title="Casual chat selected",
                data={
                    "route": CASUAL_CHAT_ROUTE,
                    "reasoning": response.reasoning,
                },
            )
            return CASUAL_CHAT_ROUTE

        self.state.suggested_search_queries = response.search_queries or []
        self.emit_event(
            "router.completed",
            status="completed",
            title="Research selected",
            data={
                "route": SEARCH_ROUTE,
                "reasoning": response.reasoning,
                "searchQueries": self.state.suggested_search_queries,
            },
        )
        return SEARCH_ROUTE

    @listen(CASUAL_CHAT_ROUTE)
    def present_chat_response(self) -> dict[str, str]:
        response = self.state.chat_response or (
            "Ask a research question and I will investigate it."
        )
        self.add_message("assistant", response)
        self.emit_event(
            "assistant.message.completed",
            status="completed",
            title="Assistant message ready",
            data={"content": response, "chat_response": response},
        )
        return render_chat_response(response)

    @listen(SEARCH_ROUTE)
    def execute_search(self) -> dict[str, str]:
        try:
            self.emit_event("planning.started", title="Planning research")
            plan = run_planning_stage(self.state)
            self.emit_event(
                "planning.completed",
                status="completed",
                title="Research plan ready",
                data=plan.model_dump(),
            )
            self.emit_event(
                "planning.output",
                status="completed",
                title="Research plan output",
                visibility="internal",
                data=plan.model_dump(),
            )
            review: EvidenceReview | None = None
            batch: ResearchBatch | None = None
            max_iterations = 5 if self.state.depth_mode == "deep" else 3

            for iteration in range(max_iterations):
                self.emit_event(
                    "evidence.iteration.started",
                    title=f"Evidence iteration {iteration + 1}",
                    data={"iteration": iteration + 1, "maxIterations": max_iterations},
                )
                self.emit_event(
                    "evidence.search.started",
                    title="Searching for evidence",
                    data={
                        "iteration": iteration + 1,
                        "queries": [
                            *plan.search_queries,
                            *self.state.suggested_search_queries,
                        ],
                    },
                )
                iteration_batch, review = run_evidence_stage(
                    state=self.state,
                    plan=plan,
                    iteration=iteration,
                    prior_batch=batch,
                    prior_review=review,
                )
                batch = merge_research_batches(batch, iteration_batch)
                self.state.search_queries = list(
                    dict.fromkeys(
                        [*self.state.search_queries, *iteration_batch.queries_used]
                    )
                )
                self.emit_event(
                    "evidence.search.completed",
                    status="completed",
                    title="Evidence search completed",
                    data={
                        "iteration": iteration + 1,
                        "queriesUsed": iteration_batch.queries_used,
                        "candidateCount": len(iteration_batch.candidate_sources),
                        "evidenceCount": len(iteration_batch.evidence_items),
                    },
                )
                self.emit_event(
                    "evidence.review.completed",
                    status="completed",
                    title="Evidence reviewed",
                    data={
                        "iteration": iteration + 1,
                        "evidenceSufficient": review.evidence_sufficient,
                        "coverageAssessment": batch.coverage_assessment,
                        "supportedClaimCount": len(review.supported_claims),
                        "gaps": review.gaps,
                        "nextQueries": review.next_queries,
                    },
                )
                self.emit_event(
                    "research_batch.output",
                    status="completed",
                    title="Research batch output",
                    visibility="internal",
                    data=batch.model_dump(),
                )
                self.emit_event(
                    "evidence_review.output",
                    status="completed",
                    title="Evidence review output",
                    visibility="internal",
                    data=review.model_dump(),
                )

                if review.evidence_sufficient:
                    break

            if batch is None or review is None or not review.supported_claims:
                failure_message = (
                    "I could not gather enough supported evidence to answer that "
                    "reliably yet."
                )
                self.state.response = failure_message
                self.add_message("assistant", failure_message)
                self.emit_event(
                    "assistant.message.completed",
                    status="completed",
                    title="Assistant message ready",
                    data={"content": failure_message, "response": failure_message},
                )
                return render_failure_response(failure_message)

            self.emit_event("synthesis.started", title="Synthesizing answer")
            answer = run_synthesis_stage(
                state=self.state,
                plan=plan,
                batch=batch,
                review=review,
            )
            self.emit_event(
                "synthesis.completed",
                status="completed",
                title="Draft answer synthesized",
                data={
                    "claimCount": len(answer.claim_ids_used),
                    "sourceEvidenceIds": answer.source_evidence_ids,
                },
            )
            self.emit_event(
                "research_answer.output",
                status="completed",
                title="Research answer output",
                visibility="internal",
                data=answer.model_dump(),
            )
            self.emit_event("citation_audit.started", title="Auditing citations")
            validation = validate_research_answer(answer, batch, review)
            self.emit_event(
                "citation_audit.completed",
                status="completed" if validation.valid else "failed",
                title="Citation audit completed",
                data={"valid": validation.valid, "message": validation.message},
            )

            if not validation.valid:
                self.emit_event("synthesis.started", title="Revising answer")
                answer = run_synthesis_stage(
                    state=self.state,
                    plan=plan,
                    batch=batch,
                    review=review,
                    audit_feedback=validation.message,
                )
                self.emit_event(
                    "synthesis.completed",
                    status="completed",
                    title="Revised answer synthesized",
                    data={
                        "claimCount": len(answer.claim_ids_used),
                        "sourceEvidenceIds": answer.source_evidence_ids,
                    },
                )
                self.emit_event(
                    "research_answer.output",
                    status="completed",
                    title="Revised research answer output",
                    visibility="internal",
                    data=answer.model_dump(),
                )
                self.emit_event("citation_audit.started", title="Auditing citations")
                validation = validate_research_answer(answer, batch, review)
                self.emit_event(
                    "citation_audit.completed",
                    status="completed" if validation.valid else "failed",
                    title="Citation audit completed",
                    data={"valid": validation.valid, "message": validation.message},
                )

            if not validation.valid:
                failure_message = (
                    "I found evidence, but I could not produce a citation-safe answer. "
                    f"{validation.message}"
                )
                self.state.response = failure_message
                self.add_message("assistant", failure_message)
                self.emit_event(
                    "assistant.message.completed",
                    status="completed",
                    title="Assistant message ready",
                    data={"content": failure_message, "response": failure_message},
                )
                return render_failure_response(failure_message)

            final_answer = render_research_answer(answer, batch)
            self.state.response = final_answer
            self.add_message("assistant", final_answer)
            self.emit_event(
                "assistant.message.completed",
                status="completed",
                title="Assistant message ready",
                data={"content": final_answer, "response": final_answer},
            )
            return render_research_response(final_answer)
        except Exception as error:
            failure_message = format_runtime_error(error)
            self.state.response = failure_message
            self.add_message("assistant", failure_message)
            self.emit_event(
                "assistant.message.completed",
                status="completed",
                title="Assistant message ready",
                data={"content": failure_message, "response": failure_message},
            )
            return render_failure_response(failure_message)


def format_runtime_error(error: Exception) -> str:
    message = str(error)
    lowered = message.lower()

    if "exa_api_key" in lowered:
        return "EXA_API_KEY is missing. Add it to apps/agents/.env before running research."
    if "401" in message or "authentication" in lowered or "unauthorized" in lowered:
        return "Exa rejected the request. Check EXA_API_KEY and account access."
    if "429" in message or "rate" in lowered or "quota" in lowered:
        return "Exa rate limit or quota was reached. Retry later or use a higher quota key."

    return message


def run_flow(
    inputs: dict[str, Any] | None = None,
    event_sink: EventSink | None = None,
) -> Any:
    deep_research_flow = DeepResearchFlow()
    deep_research_flow.event_sink = event_sink
    normalized_inputs = normalize_flow_inputs(inputs)
    return deep_research_flow.kickoff(inputs=normalized_inputs)

def run_flow_stream(
    inputs: dict[str, Any] | None = None,
    event_sink: EventSink | None = None,
    chunk_sink: ChunkSink | None = None,
) -> Any:
    deep_research_flow = DeepResearchFlow()
    deep_research_flow.event_sink = event_sink
    deep_research_flow.stream = True
    normalized_inputs = normalize_flow_inputs(inputs)
    streaming_output = deep_research_flow.kickoff(inputs=normalized_inputs)

    if not hasattr(streaming_output, "__iter__"):
        return streaming_output

    for chunk in streaming_output:
        if chunk_sink is None:
            continue

        content = getattr(chunk, "content", "")
        if not content:
            continue

        chunk_sink(
            {
                "content": content,
                "chunk_type": getattr(
                    getattr(chunk, "chunk_type", ""),
                    "value",
                    str(getattr(chunk, "chunk_type", "")),
                ),
                "task_index": getattr(chunk, "task_index", 0),
                "task_name": getattr(chunk, "task_name", ""),
                "task_id": getattr(chunk, "task_id", ""),
                "agent_role": getattr(chunk, "agent_role", ""),
                "agent_id": getattr(chunk, "agent_id", ""),
            }
        )

    try:
        return streaming_output.result
    except RuntimeError as error:
        if "Streaming has not completed yet" not in str(error) and (
            "No result available" not in str(error)
        ):
            raise
        return _result_from_flow_state(deep_research_flow)

def _result_from_flow_state(flow: DeepResearchFlow) -> dict[str, Any]:
    state = flow.state
    result: dict[str, Any] = {}
    if getattr(state, "response", None):
        result["response"] = state.response
    if getattr(state, "chat_response", None):
        result["chat_response"] = state.chat_response
    if getattr(state, "search_queries", None):
        result["search_queries"] = state.search_queries
    if getattr(state, "suggested_search_queries", None):
        result["suggested_search_queries"] = state.suggested_search_queries
    if getattr(state, "route_reasoning", None):
        result["route_reasoning"] = state.route_reasoning

    return result or {"response": ""}

def kickoff(inputs: dict[str, Any] | None = None) -> None:
    result = run_flow(inputs)
    if isinstance(result, dict):
        print(result.get("response") or result.get("chat_response") or result)
    elif result is not None:
        print(result)


def plot() -> None:
    deep_research_flow = DeepResearchFlow()
    deep_research_flow.plot()


if __name__ == "__main__":
    kickoff()

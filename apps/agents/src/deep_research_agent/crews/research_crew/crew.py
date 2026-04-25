from __future__ import annotations

from crewai import Agent, Crew, Process, Task
from crewai.agents.agent_builder.base_agent import BaseAgent
from crewai.project import CrewBase, agent, crew, task

from deep_research_agent.guardrails import (
    validate_evidence_review_output,
    validate_research_answer_shape,
    validate_research_batch_output,
    validate_research_plan_output,
)
from deep_research_agent.models import (
    EvidenceReview,
    ResearchAnswer,
    ResearchBatch,
    ResearchPlan,
)
from deep_research_agent.tools.exa import create_exa_mcp_server


@CrewBase
class ResearchCrew:
    agents: list[BaseAgent]
    tasks: list[Task]

    agents_config = "config/agents.yaml"
    tasks_config = "config/tasks.yaml"

    @agent
    def research_planner(self) -> Agent:
        return Agent(
            config=self.agents_config["research_planner"],  # type: ignore[index]
            verbose=True,
        )

    @agent
    def source_researcher(self) -> Agent:
        return Agent(
            config=self.agents_config["source_researcher"],  # type: ignore[index]
            mcps=[create_exa_mcp_server()],
            verbose=True,
        )

    @agent
    def evidence_critic(self) -> Agent:
        return Agent(
            config=self.agents_config["evidence_critic"],  # type: ignore[index]
            verbose=True,
        )

    @agent
    def synthesis_writer(self) -> Agent:
        return Agent(
            config=self.agents_config["synthesis_writer"],  # type: ignore[index]
            verbose=True,
        )

    @task
    def plan_research_task(self) -> Task:
        return Task(
            name="plan_research_task",
            config=self.tasks_config["plan_research_task"],  # type: ignore[index]
            output_pydantic=ResearchPlan,
            guardrail=validate_research_plan_output,
            guardrail_max_retries=1,
        )

    @task
    def collect_sources_task(self) -> Task:
        return Task(
            name="collect_sources_task",
            config=self.tasks_config["collect_sources_task"],  # type: ignore[index]
            output_pydantic=ResearchBatch,
            guardrail=validate_research_batch_output,
            guardrail_max_retries=1,
        )

    @task
    def critique_evidence_task(self) -> Task:
        return Task(
            name="critique_evidence_task",
            config=self.tasks_config["critique_evidence_task"],  # type: ignore[index]
            context=[self.collect_sources_task()],
            output_pydantic=EvidenceReview,
            guardrail=validate_evidence_review_output,
            guardrail_max_retries=1,
        )

    @task
    def synthesize_answer_task(self) -> Task:
        return Task(
            name="synthesize_answer_task",
            config=self.tasks_config["synthesize_answer_task"],  # type: ignore[index]
            output_pydantic=ResearchAnswer,
            guardrail=validate_research_answer_shape,
            guardrail_max_retries=1,
        )

    def planning_crew(self) -> Crew:
        return Crew(
            agents=[self.research_planner()],
            tasks=[self.plan_research_task()],
            process=Process.sequential,
            verbose=True,
        )

    def evidence_crew(self) -> Crew:
        return Crew(
            agents=[self.source_researcher(), self.evidence_critic()],
            tasks=[self.collect_sources_task(), self.critique_evidence_task()],
            process=Process.sequential,
            verbose=True,
        )

    def synthesis_crew(self) -> Crew:
        return Crew(
            agents=[self.synthesis_writer()],
            tasks=[self.synthesize_answer_task()],
            process=Process.sequential,
            verbose=True,
        )

    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=True,
        )

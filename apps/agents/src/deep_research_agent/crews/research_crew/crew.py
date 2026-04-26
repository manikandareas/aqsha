from __future__ import annotations

from crewai import Agent, Crew, Process, Task
from crewai.agents.agent_builder.base_agent import BaseAgent
from crewai.project import CrewBase, agent, crew, task

from deep_research_agent.models import (
    EvidenceReview,
    ResearchAnswer,
    ResearchBatch,
    ResearchPlan,
)
from deep_research_agent.tools.exa import create_exa_mcp_tools
from deep_research_agent.tools.source_tools import create_source_tools


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
    def exa_web_researcher(self) -> Agent:
        return Agent(
            config=self.agents_config["exa_web_researcher"],  # type: ignore[index]
            tools=create_exa_mcp_tools(),
            verbose=True,
        )

    @agent
    def source_triage_analyst(self) -> Agent:
        return Agent(
            config=self.agents_config["source_triage_analyst"],  # type: ignore[index]
            tools=create_source_tools(),
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

    @agent
    def final_verification_critic(self) -> Agent:
        return Agent(
            config=self.agents_config["final_verification_critic"],  # type: ignore[index]
            verbose=True,
        )

    @agent
    def research_manager(self) -> Agent:
        return Agent(
            config=self.agents_config["research_manager"],  # type: ignore[index]
            verbose=True,
            allow_delegation=True,
        )

    @task
    def plan_research_task(self) -> Task:
        return Task(
            name="plan_research_task",
            config=self.tasks_config["plan_research_task"],  # type: ignore[index]
            output_pydantic=ResearchPlan,
        )

    @task
    def collect_sources_task(self) -> Task:
        return Task(
            name="collect_sources_task",
            config=self.tasks_config["collect_sources_task"],  # type: ignore[index]
            context=[
                self.collect_web_sources_task(),
            ],
            output_pydantic=ResearchBatch,
        )

    @task
    def collect_web_sources_task(self) -> Task:
        return Task(
            name="collect_web_sources_task",
            config=self.tasks_config["collect_web_sources_task"],  # type: ignore[index]
            tools=create_exa_mcp_tools(),
        )

    @task
    def critique_evidence_task(self) -> Task:
        return Task(
            name="critique_evidence_task",
            config=self.tasks_config["critique_evidence_task"],  # type: ignore[index]
            context=[self.collect_sources_task()],
            output_pydantic=EvidenceReview,
        )

    @task
    def synthesize_answer_task(self) -> Task:
        return Task(
            name="synthesize_answer_task",
            config=self.tasks_config["synthesize_answer_task"],  # type: ignore[index]
            context=[self.final_verification_task()],
            output_pydantic=ResearchAnswer,
        )

    @task
    def final_verification_task(self) -> Task:
        return Task(
            name="final_verification_task",
            config=self.tasks_config["final_verification_task"],  # type: ignore[index]
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
            agents=[
                self.exa_web_researcher(),
                self.source_triage_analyst(),
                self.evidence_critic(),
            ],
            tasks=[
                self.collect_web_sources_task(),
                self.collect_sources_task(),
                self.critique_evidence_task(),
            ],
            manager_agent=self.research_manager(),
            process=Process.hierarchical,
            planning=True,
            verbose=True,
        )

    def synthesis_crew(self) -> Crew:
        return Crew(
            agents=[self.synthesis_writer(), self.final_verification_critic()],
            tasks=[self.final_verification_task(), self.synthesize_answer_task()],
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

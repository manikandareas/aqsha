# Astra Skills

Place trusted Agent Skills in this directory. Each skill should live in its own
subdirectory with a required `SKILL.md` file:

```text
skills/
└── example-skill/
    └── SKILL.md
```

Skills are loaded through `pydantic-ai-skills` with progressive disclosure. The
agent sees skill names and descriptions first, then can call `load_skill`,
`read_skill_resource`, or `run_skill_script` when a task needs the full skill.

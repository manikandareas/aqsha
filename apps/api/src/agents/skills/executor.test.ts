import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";

import {
  DaytonaScriptExecutor,
  DaytonaSdkScriptExecutorClient,
  LocalScriptExecutor,
  loadSkillScriptManifest,
  resolveSkillScript,
} from "./executor";
import type { SkillMetadata } from "./types";

async function createSkillFixture() {
  const directory = await mkdtemp(join(tmpdir(), "aqsha-skill-"));
  await mkdir(join(directory, "scripts"), { recursive: true });
  await writeFile(join(directory, "SKILL.md"), "---\nname: deep-research\ndescription: Deep Research\n---\n");
  await writeFile(
    join(directory, "scripts", "manifest.json"),
    JSON.stringify({
      version: 1,
      scripts: [
        {
          id: "render-vega",
          file: "render-vega.ts",
          runtime: "bun",
          timeoutMs: 30_000,
          args: { maxCount: 8, maxLength: 240 },
          outputs: [{ path: "artifacts/*.png", contentType: "image/png", role: "visual" }],
          network: "disabled",
        },
      ],
    }),
  );
  await writeFile(join(directory, "scripts", "render-vega.ts"), "console.log('ok');\n");

  const skill: SkillMetadata = {
    name: "deep-research",
    description: "Deep Research",
    directory,
    skillFile: join(directory, "SKILL.md"),
  };

  return skill;
}

describe("Skill script executor manifest", () => {
  test("resolves only manifest-declared Bun trusted skill scripts", async () => {
    const skill = await createSkillFixture();
    const manifest = await loadSkillScriptManifest(skill);

    const resolved = await resolveSkillScript({
      skill,
      manifest,
      scriptId: "render-vega",
    });

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) {
      throw new Error("Expected script to resolve.");
    }

    expect(resolved.script.id).toBe("render-vega");
    expect(resolved.script.runtime).toBe("bun");
    expect(resolved.script.network).toBe("disabled");
    expect(resolved.script.filePath.endsWith("scripts/render-vega.ts")).toBe(true);

    expect(
      await resolveSkillScript({
        skill,
        manifest,
        scriptId: "../render-vega",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_script_id" },
    });

    expect(
      await resolveSkillScript({
        skill,
        manifest,
        scriptId: "missing-script",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "unknown_script" },
    });
  });

  test("local executor returns structured script result and artifact metadata without raw bytes", async () => {
    const skill = await createSkillFixture();
    await writeFile(
      join(skill.directory, "scripts", "render-vega.ts"),
      [
        "await Bun.write('artifacts/timeline.png', new Uint8Array([137, 80, 78, 71]));",
        "console.log(JSON.stringify({ rendered: true }));",
      ].join("\n"),
    );

    const manifest = await loadSkillScriptManifest(skill);
    const resolved = await resolveSkillScript({
      skill,
      manifest,
      scriptId: "render-vega",
    });

    if (!resolved.ok) {
      throw new Error("Expected script to resolve.");
    }

    const result = await new LocalScriptExecutor().execute({
      skillName: skill.name,
      script: resolved.script,
      args: [],
      runId: "run_123",
      imageRef: "sha-test",
    });

    expect(result).toMatchObject({
      ok: true,
      backend: "local",
      skillName: "deep-research",
      scriptId: "render-vega",
      runtime: "bun",
      runId: "run_123",
      imageRef: "sha-test",
      exitCode: 0,
    });

    if (!result.ok) {
      throw new Error("Expected local execution to succeed.");
    }

    expect(result.stdout).toContain('"rendered":true');
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]).toMatchObject({
      path: "artifacts/timeline.png",
      contentType: "image/png",
      byteSize: 4,
      role: "visual",
    });
    expect(result.artifacts[0]).not.toHaveProperty("bytes");
  });

  test("Daytona executor maps sandbox command results into the stable executor result contract", async () => {
    const skill = await createSkillFixture();
    const manifest = await loadSkillScriptManifest(skill);
    const resolved = await resolveSkillScript({
      skill,
      manifest,
      scriptId: "render-vega",
    });

    if (!resolved.ok) {
      throw new Error("Expected script to resolve.");
    }

    const executor = new DaytonaScriptExecutor({
      imageRef: "ghcr.io/manikandareas/aqsha/research-sandbox:sha-test",
      client: {
        async execute(input) {
          expect(input.imageRef).toBe("ghcr.io/manikandareas/aqsha/research-sandbox:sha-test");
          expect(input.skillName).toBe("deep-research");
          expect(input.command).toEqual(["bun", "render-vega.ts", "--fixture"]);

          return {
            exitCode: 0,
            stdout: "rendered",
            stderr: "",
            artifacts: [
              {
                path: "artifacts/timeline.png",
                contentType: "image/png",
                byteSize: 4,
                checksum: "abc123",
                role: "visual",
                retrievalStatus: "available",
              },
            ],
          };
        },
      },
    });

    await expect(
      executor.execute({
        skillName: skill.name,
        script: resolved.script,
        args: ["--fixture"],
        runId: "run_123",
      }),
    ).resolves.toMatchObject({
      ok: true,
      backend: "daytona",
      scriptId: "render-vega",
      imageRef: "ghcr.io/manikandareas/aqsha/research-sandbox:sha-test",
      exitCode: 0,
      stdout: "rendered",
      artifacts: [{ path: "artifacts/timeline.png", contentType: "image/png" }],
    });

    const timeoutExecutor = new DaytonaScriptExecutor({
      imageRef: "ghcr.io/manikandareas/aqsha/research-sandbox:sha-test",
      client: {
        async execute() {
          return {
            exitCode: null,
            stdout: "",
            stderr: "deadline exceeded",
            error: { code: "timeout", message: "Sandbox command timed out." },
            artifacts: [],
          };
        },
      },
    });

    await expect(
      timeoutExecutor.execute({
        skillName: skill.name,
        script: resolved.script,
        args: [],
        runId: "run_123",
      }),
    ).resolves.toMatchObject({
      ok: false,
      backend: "daytona",
      error: { code: "timeout" },
    });
  });

  test("Daytona SDK client creates one sandbox per run and returns downloaded artifact metadata", async () => {
    const commands: string[] = [];
    let createdParams: unknown;
    let deletedSandboxId: string | undefined;

    const client = new DaytonaSdkScriptExecutorClient({
      daytona: {
        async create(params) {
          createdParams = params;
          return {
            id: "sandbox_123",
            process: {
              async executeCommand(command: string, cwd?: string, _env?: Record<string, string>, timeout?: number) {
                commands.push(`${cwd} :: ${command} :: ${timeout}`);

                if (command.startsWith("find ")) {
                  return {
                    exitCode: 0,
                    result: "/workspace/apps/api/skills/deep-research/scripts/artifacts/timeline.png\n",
                  };
                }

                return {
                  exitCode: 0,
                  result: "rendered",
                  artifacts: { stdout: "rendered" },
                };
              },
            },
            fs: {
              async downloadFile(path: string) {
                expect(path).toBe("/workspace/apps/api/skills/deep-research/scripts/artifacts/timeline.png");
                return Buffer.from([137, 80, 78, 71]);
              },
            },
          };
        },
        async delete(sandbox) {
          deletedSandboxId = sandbox.id;
        },
      },
      createTimeoutSeconds: 12,
    });

    const result = await client.execute({
      imageRef: "ghcr.io/manikandareas/aqsha/research-sandbox:sha-test",
      skillName: "deep-research",
      runId: "run_123",
      command: ["bun", "render-vega.ts"],
      timeoutMs: 30_000,
      outputs: [{ path: "artifacts/*.png", contentType: "image/png", role: "visual" }],
      network: "disabled",
    });

    expect(createdParams).toMatchObject({
      image: "ghcr.io/manikandareas/aqsha/research-sandbox:sha-test",
      networkBlockAll: true,
      labels: {
        aqshaRunId: "run_123",
      },
    });
    expect(commands[0]).toContain("/workspace/apps/api/skills/deep-research/scripts :: 'bun' 'render-vega.ts' :: 30");
    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "rendered",
      artifacts: [
        {
          path: "artifacts/timeline.png",
          contentType: "image/png",
          byteSize: 4,
          role: "visual",
          retrievalStatus: "available",
        },
      ],
    });
    expect(deletedSandboxId).toBe("sandbox_123");
  });

  test("local executor returns stable errors for argument limits, output limits, and missing artifacts", async () => {
    const skill = await createSkillFixture();
    const manifest = await loadSkillScriptManifest(skill);
    const resolved = await resolveSkillScript({
      skill,
      manifest,
      scriptId: "render-vega",
    });

    if (!resolved.ok) {
      throw new Error("Expected script to resolve.");
    }

    const executor = new LocalScriptExecutor();

    await expect(
      executor.execute({
        skillName: skill.name,
        script: resolved.script,
        args: Array.from({ length: 9 }, (_, index) => `arg-${index}`),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "args_limit_exceeded" },
    });

    await writeFile(join(skill.directory, "scripts", "render-vega.ts"), "console.log('x'.repeat(70000));\n");
    await expect(
      executor.execute({
        skillName: skill.name,
        script: resolved.script,
        args: [],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "output_limit_exceeded" },
    });

    await writeFile(join(skill.directory, "scripts", "render-vega.ts"), "console.log('no artifact');\n");
    await expect(
      executor.execute({
        skillName: skill.name,
        script: resolved.script,
        args: [],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "artifact_missing" },
    });
  });
});

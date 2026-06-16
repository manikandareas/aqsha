import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildCommandRegistry,
  parseServiceCommand,
  parseSkillFrontmatter,
  readSkillEntries,
} from "../src/commands/registry";
import { loadConfig } from "../src/config";
import {
  selectDomainPack,
  skillTriggerScore,
} from "../src/subagents/skillDelegation";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("config", () => {
  it("applies model and budget defaults (D6)", () => {
    const config = loadConfig({});
    expect(config.models.chatLite).toBe("claude-haiku-4-5");
    expect(config.models.chatPro).toBe("claude-sonnet-4-6");
    expect(config.models.deepPro).toBe("claude-sonnet-4-6");
    expect(config.maxTurns).toEqual({ lite: 5, pro: 10, deep: 24 });
    expect(config.storeBackend).toBe("memory");
  });

  it("honors env overrides", () => {
    const config = loadConfig({
      ASTRA_PRO_MODEL: "claude-opus-4-8",
      ASTRA_DEEP_PRO_MODEL: "claude-opus-4-8",
      AGENTS_STORE: "convex",
      CONVEX_URL: "https://example.convex.cloud",
    });
    expect(config.models.chatPro).toBe("claude-opus-4-8");
    expect(config.storeBackend).toBe("convex");
  });
});

describe("skill frontmatter + registry", () => {
  it("parses SKILL.md frontmatter incl. triggerKeywords", () => {
    const parsed = parseSkillFrontmatter(
      `---\nname: verify-citations\ndescription: "Cek sitasi"\nmetadata:\n  triggerKeywords: [sitasi, doi]\n---\nBody`,
    );
    expect(parsed?.name).toBe("verify-citations");
    expect(parsed?.triggerKeywords).toEqual(["sitasi", "doi"]);
  });

  it("reads the 10 bundled skills from .claude/skills", () => {
    const entries = readSkillEntries(APP_ROOT);
    expect(entries).toHaveLength(10);
    expect(entries.map((entry) => entry.name)).toContain("research-medicine");
    for (const entry of entries) {
      expect(entry.description.length).toBeGreaterThan(10);
    }
  });

  it("builds the command registry with /deep first", () => {
    const commands = buildCommandRegistry(APP_ROOT);
    expect(commands[0]?.name).toBe("deep");
    expect(commands[0]?.interceptedByService).toBe(true);
    expect(commands).toHaveLength(11);
  });

  it("parseServiceCommand intercepts only /deep", () => {
    expect(parseServiceCommand("/deep apa dampak X?")).toEqual({
      name: "deep",
      args: "apa dampak X?",
    });
    expect(parseServiceCommand("/verify-citations a1")).toBeNull();
    expect(parseServiceCommand("bukan command")).toBeNull();
  });
});

describe("skillDelegation", () => {
  const catalog = readSkillEntries(APP_ROOT);

  it("scores keyword overlap deterministically and ignores stopwords", () => {
    expect(skillTriggerScore("verifikasi sitasi doi", "sitasi doi verifikasi")).toBe(1);
    expect(skillTriggerScore("topik lain", "sitasi doi")).toBe(0);
    // Stopwords ("dan", "untuk") don't dilute the score.
    expect(skillTriggerScore("sitasi dan doi untuk", "sitasi doi")).toBe(1);
  });

  it("routes a medical prompt to research-medicine", () => {
    const pack = selectDomainPack(
      "Tinjauan meta-analisis bukti klinis efektivitas vaksin: skrining PRISMA dan hierarki bukti pada pasien diabetes",
      catalog,
    );
    expect(pack).toBe("research-medicine");
  });

  it("falls back to research-general for off-domain prompts", () => {
    const pack = selectDomainPack("Sejarah kerajaan Majapahit abad ke-14", catalog);
    expect(pack).toBe("research-general");
  });
});

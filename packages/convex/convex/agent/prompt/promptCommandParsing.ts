import { promptCommands } from "./promptCommands";

export function findExplicitPromptCommandInContent(content: string) {
  const trimmed = content.trim();
  return (
    promptCommands.find((command) =>
      [command.slug, ...command.aliases].some(
        (slug) =>
          trimmed === slug ||
          trimmed.startsWith(`${slug} `) ||
          trimmed.startsWith(`${slug}\n`),
      ),
    ) ?? null
  );
}

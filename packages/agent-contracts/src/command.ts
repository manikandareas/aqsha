import { z } from "zod";

// Composer command palette contract (plan §5.4). The agent service derives this
// list from its .claude/skills directory plus product commands, and syncs it to
// Convex so the web composer can render the `/` palette.

export const commandScopeSchema = z.enum(["skill", "product", "service"]);
export type CommandScope = z.infer<typeof commandScopeSchema>;

export const commandDescriptorSchema = z.object({
  // Invocation name without the leading slash (e.g. "verify-citations").
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  description: z.string().min(1).max(500),
  argumentHint: z.string().max(200).optional(),
  scope: commandScopeSchema,
  // service-scoped commands (e.g. /deep) are intercepted by the run manager and
  // never forwarded verbatim to the SDK.
  interceptedByService: z.boolean().default(false),
});
export type CommandDescriptor = z.infer<typeof commandDescriptorSchema>;

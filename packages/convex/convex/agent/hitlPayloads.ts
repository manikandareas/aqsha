import { z } from "zod";

export const artifactPayloadSchema = z.object({
  action: z.enum(["create", "update", "delete"]),
  title: z.string().min(1).max(160),
  artifactId: z.string().optional(),
  workspaceId: z.string().optional(),
  changeSummary: z.string().max(500).optional(),
});

export const workspaceManagementPayloadSchema = z.object({
  action: z.enum(["create_workspace", "rename_workspace"]),
  name: z.string().min(1).max(160),
  workspaceId: z.string().optional(),
});

export const approvedCardPayloadSchema = z.discriminatedUnion("action", [
  workspaceManagementPayloadSchema,
  z.object({
    action: z.literal("delete"),
    title: z.string().min(1).max(160),
    artifactId: z.string(),
    workspaceId: z.string().optional(),
  }),
  z.object({
    action: z.enum(["create", "update"]),
    title: z.string().min(1).max(160),
    artifactId: z.string().optional(),
    workspaceId: z.string().optional(),
    changeSummary: z.string().max(500).optional(),
  }),
]);

export type ApprovedCardPayload = z.infer<typeof approvedCardPayloadSchema>;

export function parseApprovedCardPayload(payloadJson: string | undefined): ApprovedCardPayload {
  if (!payloadJson) {
    throw new Error("Missing card payload");
  }
  return approvedCardPayloadSchema.parse(JSON.parse(payloadJson));
}

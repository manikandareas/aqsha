import { describe, expect, test } from "bun:test";

import type { UserService } from "../users/service";
import { ChatService } from "./service";
import type { ChatStore } from "./store";

const createdAt = "2026-05-03T00:00:00.000Z";

describe("ChatService", () => {
  test("returns persisted artifacts in thread detail for replay and audit", async () => {
    const store = {
      async listThreads() {
        return [];
      },
      async createThread() {
        throw new Error("not used");
      },
      async getThread() {
        return {
          id: "thread_123",
          userId: "user_123",
          title: "Evidence timeline research",
          model: null,
          createdAt,
          updatedAt: createdAt,
        };
      },
      async getMessages() {
        return [];
      },
      async getLatestRun() {
        return null;
      },
      async getEvents() {
        return [];
      },
      async getSources() {
        return [];
      },
      async getArtifacts() {
        return [
          {
            id: "artifact_123",
            ownerUserId: "user_123",
            chatThreadId: "thread_123",
            runId: "run_123",
            messageId: "message_123",
            kind: "visual_png" as const,
            title: "Evidence timeline",
            caption: "Verified source-backed timeline.",
            fileKey: "ut_file_123",
            url: "https://utfs.io/f/ut_file_123.png",
            contentType: "image/png" as const,
            byteSize: 8,
            checksum: "a".repeat(64),
            sourceIds: ["S1"],
            sourceRefs: [{ sourceId: "S1", chatSourceId: "source_123" }],
            visualSpec: { visualId: "evidence-timeline" },
            auditStatus: "passed" as const,
            auditSummary: "Visual references verified ledger source IDs.",
            failureSummary: null,
            developerDetail: null,
            createdAt,
          },
        ];
      },
      async createRun() {
        throw new Error("not used");
      },
      async appendEvent() {
        throw new Error("not used");
      },
      async upsertSource() {
        throw new Error("not used");
      },
      async appendArtifact() {
        throw new Error("not used");
      },
      async finishRun() {
        return null;
      },
      async appendMessage() {
        return null;
      },
      async upsertMessages() {
        return null;
      },
      async updateThread() {
        return null;
      },
      async deleteThread() {
        return false;
      },
    } satisfies ChatStore;
    const userService = {
      async getByAuthUserId() {
        return { id: "user_123" };
      },
    } as unknown as UserService;
    const service = new ChatService(store, userService);

    const result = await service.getThread(
      {
        authUserId: "auth_user_123",
        authTokenIdentifier: "better-auth:session",
      },
      "thread_123",
    );

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        artifacts: [
          expect.objectContaining({
            ownerUserId: "user_123",
            messageId: "message_123",
            checksum: "a".repeat(64),
            auditStatus: "passed",
            visualSpec: { visualId: "evidence-timeline" },
          }),
        ],
      }),
    });
  });
});

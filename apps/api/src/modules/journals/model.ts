import { t, type UnwrapSchema } from "elysia";
import { table } from "@aqsha/db/schema";
import { spreads } from "@aqsha/db/utils";

const journalBase = spreads({ journals: table.journals }, "select").journals;
const journalVersionBase = spreads(
  { journalVersions: table.journalVersions },
  "select",
).journalVersions;

const journalSummary = t.Object({
  id: journalBase.id,
  workspaceId: journalBase.workspaceId,
  ownerUserId: journalBase.ownerUserId,
  title: journalBase.title,
  type: journalBase.type,
  status: journalBase.status,
  plainText: t.Union([t.String(), t.Null()]),
  archivedAt: t.Union([t.String(), t.Null()]),
  lastOpenedAt: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

const journal = t.Composite([
  journalSummary,
  t.Object({
    contentJson: t.Any(),
    outlineJson: t.Union([t.Any(), t.Null()]),
  }),
]);

const journalVersion = t.Object({
  id: journalVersionBase.id,
  journalId: journalVersionBase.journalId,
  workspaceId: journalVersionBase.workspaceId,
  createdByUserId: journalVersionBase.createdByUserId,
  versionNumber: journalVersionBase.versionNumber,
  contentJson: t.Any(),
  plainText: t.Union([t.String(), t.Null()]),
  trigger: journalVersionBase.trigger,
  snapshotLabel: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
});

const staleJournalSaveError = t.Object({
  error: t.Object({
    code: t.Literal("stale_journal_save"),
    message: t.String(),
  }),
});

const unauthorizedError = t.Object({
  error: t.Object({
    code: t.Literal("unauthorized"),
    message: t.String(),
  }),
});

const workspaceNotFoundError = t.Object({
  error: t.Object({
    code: t.Literal("workspace_not_found"),
    message: t.String(),
  }),
});

const journalNotFoundError = t.Object({
  error: t.Object({
    code: t.Literal("journal_not_found"),
    message: t.String(),
  }),
});

const notFoundError = t.Union([workspaceNotFoundError, journalNotFoundError]);

export const journalModel = {
  listQuery: t.Object({
    status: t.Optional(journalBase.status),
    q: t.Optional(t.String()),
    limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
  }),
  versionsQuery: t.Object({
    limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
  }),
  createBody: t.Object({
    title: t.String({ minLength: 1 }),
    type: journalBase.type,
  }),
  updateBody: t.Object({
    title: t.Optional(t.String({ minLength: 1 })),
    type: t.Optional(journalBase.type),
  }),
  saveContentBody: t.Object({
    baseUpdatedAt: t.String({ format: "date-time" }),
    title: t.String({ minLength: 1 }),
    contentJson: t.Any(),
    plainText: t.Optional(t.Union([t.String(), t.Null()])),
  }),
  applyOutlineBody: t.Object({
    baseUpdatedAt: t.String({ format: "date-time" }),
    outline: t.Any(),
    contentJson: t.Any(),
    plainText: t.Optional(t.Union([t.String(), t.Null()])),
  }),
  journalSummary,
  journal,
  journalVersion,
  unauthorizedError,
  workspaceNotFoundError,
  journalNotFoundError,
  notFoundError,
  staleJournalSaveError,
  okResponse: t.Object({
    ok: t.Boolean(),
  }),
};

export type JournalModel = {
  [K in keyof typeof journalModel]: UnwrapSchema<(typeof journalModel)[K]>;
};

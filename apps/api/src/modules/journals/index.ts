import { Elysia, t } from "elysia";
import { journalModel } from "./model";
import { authIdentityPlugin } from "../../plugins/auth-identity";
import { servicesPlugin } from "../../plugins/services";

export const journalsModule = new Elysia({
  prefix: "/journals",
  name: "module.journals",
  tags: ["journals"],
})
  .use(servicesPlugin)
  .use(authIdentityPlugin)
  .get(
    "/",
    async ({ identity, journalService, query, status }) => {
      const result = await journalService.list(identity, query);

      if (!result.success) {
        return status(401, {
          error: { code: "unauthorized", message: "Unauthorized" },
        });
      }

      return result.data;
    },
    {
      detail: {
        summary: "List journals",
        description:
          "Returns journal summaries for the authenticated user account.",
      },
      query: journalModel.listQuery,
      response: {
        200: t.Array(journalModel.journalSummary),
        401: journalModel.unauthorizedError,
      },
    },
  )
  .get(
    "/:id",
    async ({ identity, journalService, params, status }) => {
      const result = await journalService.getById(identity, params.id);

      if (!result.success) {
        if (result.error === "unauthorized") {
          return status(401, {
            error: { code: "unauthorized", message: "Unauthorized" },
          });
        }
        return status(404, {
          error: { code: "journal_not_found", message: "Journal not found" },
        });
      }

      return result.data;
    },
    {
      detail: {
        summary: "Get journal",
        description:
          "Returns a single journal if it belongs to the authenticated user account.",
      },
      response: {
        200: journalModel.journal,
        401: journalModel.unauthorizedError,
        404: journalModel.notFoundError,
      },
    },
  )
  .post(
    "/",
    async ({ body, identity, journalService, status }) => {
      const result = await journalService.create(identity, body);

      if (!result.success) {
        return status(401, {
          error: { code: "unauthorized", message: "Unauthorized" },
        });
      }

      return status(201, result.data);
    },
    {
      detail: {
        summary: "Create journal",
        description:
          "Creates a journal with empty default content and an initial version.",
      },
      body: journalModel.createBody,
      response: {
        201: journalModel.journal,
        401: journalModel.unauthorizedError,
      },
    },
  )
  .patch(
    "/:id",
    async ({ body, identity, journalService, params, status }) => {
      const result = await journalService.updateMetadata(
        identity,
        params.id,
        body,
      );

      if (!result.success) {
        if (result.error === "unauthorized") {
          return status(401, {
            error: { code: "unauthorized", message: "Unauthorized" },
          });
        }
        return status(404, {
          error: { code: "journal_not_found", message: "Journal not found" },
        });
      }

      return result.data;
    },
    {
      detail: {
        summary: "Update journal metadata",
        description: "Updates the title and type for an authorized journal.",
      },
      body: journalModel.updateBody,
      response: {
        200: journalModel.journal,
        401: journalModel.unauthorizedError,
        404: journalModel.notFoundError,
      },
    },
  )
  .put(
    "/:id/content",
    async ({ body, identity, journalService, params, status }) => {
      const result = await journalService.saveContent(
        identity,
        params.id,
        body,
      );

      if (!result.success) {
        if (result.error === "stale_journal_save") {
          return status(409, {
            error: {
              code: "stale_journal_save",
              message:
                "This journal has changed since it was loaded. Reload before saving again.",
            },
          });
        }

        if (result.error === "unauthorized") {
          return status(401, {
            error: { code: "unauthorized", message: "Unauthorized" },
          });
        }
        return status(404, {
          error: { code: "journal_not_found", message: "Journal not found" },
        });
      }

      return result.data;
    },
    {
      detail: {
        summary: "Save journal content",
        description:
          "Updates journal content using an optimistic lock on updatedAt.",
      },
      body: journalModel.saveContentBody,
      response: {
        200: journalModel.journal,
        401: journalModel.unauthorizedError,
        404: journalModel.notFoundError,
        409: journalModel.staleJournalSaveError,
      },
    },
  )
  .put(
    "/:id/outline",
    async ({ body, identity, journalService, params, status }) => {
      const result = await journalService.applyOutline(
        identity,
        params.id,
        body,
      );

      if (!result.success) {
        if (result.error === "stale_journal_save") {
          return status(409, {
            error: {
              code: "stale_journal_save",
              message:
                "This journal has changed since it was loaded. Reload before saving again.",
            },
          });
        }

        if (result.error === "unauthorized") {
          return status(401, {
            error: { code: "unauthorized", message: "Unauthorized" },
          });
        }
        return status(404, {
          error: { code: "journal_not_found", message: "Journal not found" },
        });
      }

      return result.data;
    },
    {
      detail: {
        summary: "Apply journal outline",
        description:
          "Updates outline and content using an optimistic lock on updatedAt.",
      },
      body: journalModel.applyOutlineBody,
      response: {
        200: journalModel.journal,
        401: journalModel.unauthorizedError,
        404: journalModel.notFoundError,
        409: journalModel.staleJournalSaveError,
      },
    },
  )
  .post(
    "/:id/archive",
    async ({ identity, journalService, params, status }) => {
      const result = await journalService.archive(identity, params.id);

      if (!result.success) {
        if (result.error === "unauthorized") {
          return status(401, {
            error: { code: "unauthorized", message: "Unauthorized" },
          });
        }
        return status(404, {
          error: { code: "journal_not_found", message: "Journal not found" },
        });
      }

      return result.data;
    },
    {
      detail: {
        summary: "Archive journal",
        description:
          "Archives an active journal and updates user journal counters.",
      },
      response: {
        200: journalModel.journal,
        401: journalModel.unauthorizedError,
        404: journalModel.notFoundError,
      },
    },
  )
  .post(
    "/:id/restore",
    async ({ identity, journalService, params, status }) => {
      const result = await journalService.restore(identity, params.id);

      if (!result.success) {
        if (result.error === "unauthorized") {
          return status(401, {
            error: { code: "unauthorized", message: "Unauthorized" },
          });
        }
        return status(404, {
          error: { code: "journal_not_found", message: "Journal not found" },
        });
      }

      return result.data;
    },
    {
      detail: {
        summary: "Restore journal",
        description:
          "Restores an archived journal and updates user journal counters.",
      },
      response: {
        200: journalModel.journal,
        401: journalModel.unauthorizedError,
        404: journalModel.notFoundError,
      },
    },
  )
  .delete(
    "/:id",
    async ({ identity, journalService, params, status }) => {
      const result = await journalService.delete(identity, params.id);

      if (!result.success) {
        if (result.error === "unauthorized") {
          return status(401, {
            error: { code: "unauthorized", message: "Unauthorized" },
          });
        }
        return status(404, {
          error: { code: "journal_not_found", message: "Journal not found" },
        });
      }

      return result.data;
    },
    {
      detail: {
        summary: "Delete journal",
        description:
          "Hard deletes an authorized journal and updates user journal counters.",
      },
      response: {
        200: journalModel.okResponse,
        401: journalModel.unauthorizedError,
        404: journalModel.notFoundError,
      },
    },
  )
  .get(
    "/:id/versions",
    async ({ identity, journalService, params, query, status }) => {
      const result = await journalService.listVersions(
        identity,
        params.id,
        query,
      );

      if (!result.success) {
        if (result.error === "unauthorized") {
          return status(401, {
            error: { code: "unauthorized", message: "Unauthorized" },
          });
        }
        return status(404, {
          error: { code: "journal_not_found", message: "Journal not found" },
        });
      }

      return result.data;
    },
    {
      detail: {
        summary: "List journal versions",
        description:
          "Returns version history for an authorized journal ordered newest first.",
      },
      query: journalModel.versionsQuery,
      response: {
        200: t.Array(journalModel.journalVersion),
        401: journalModel.unauthorizedError,
        404: journalModel.notFoundError,
      },
    },
  );

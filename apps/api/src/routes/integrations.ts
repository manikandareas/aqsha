import { AppError } from "@aqsha/db";
import {
  CitationImportService,
  CitationSyncService,
  IntegrationService,
} from "@aqsha/services";
import { Elysia, t } from "elysia";
import { getDb } from "../clients/db";
import { authMacro } from "../plugins/auth";
import { rateLimitMacro } from "../plugins/rate-limit";

const providerLiteral = t.Union([t.Literal("mendeley"), t.Literal("zotero")]);
const providerParams = t.Object({ provider: providerLiteral });
const duplicatePolicy = t.Union([t.Literal("skip"), t.Literal("merge"), t.Literal("import")]);

/** 302 balik ke Settings → Integrasi (callback OAuth dipanggil browser, bukan Eden). */
function settingsRedirect(query: Record<string, string>): Response {
  const base = (process.env.WEB_APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
  const url = new URL(`${base}/app/settings/integrations`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

/**
 * Route integrasi provider referensi. Koneksi = account-level; penarikan data
 * juga account-level (reuse pipeline import ke perpustakaan akun). Tipis: auth →
 * 1 service call. Credential TIDAK PERNAH keluar dari service. Callback OAuth
 * tak ber-bearer: identitas dari signed `state`; error di-redirect (bukan JSON)
 * agar UX mulus.
 */
export const integrations = new Elysia()
  .use(authMacro)
  .use(rateLimitMacro)
  .get(
    "/integrations",
    ({ ownerUserId }) => {
      const { db } = getDb();
      return IntegrationService.listStatuses(db, ownerUserId);
    },
    { auth: true },
  )
  .get(
    "/integrations/:provider/connect",
    ({ ownerUserId, params }) => IntegrationService.startConnect(ownerUserId, params.provider),
    { auth: true, rateLimit: "integrations:connect", params: providerParams },
  )
  .post(
    "/integrations/:provider/key",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return IntegrationService.connectWithApiKey(db, ownerUserId, params.provider, {
        apiKey: body.apiKey,
        userId: body.userId,
      });
    },
    {
      auth: true,
      rateLimit: "integrations:connect",
      params: providerParams,
      body: t.Object({
        apiKey: t.String({ minLength: 1 }),
        userId: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/integrations/:provider/callback",
    async ({ params, query }) => {
      const { db } = getDb();
      if (query.error) {
        return settingsRedirect({ error: query.error, provider: params.provider });
      }
      if (!query.code || !query.state) {
        return settingsRedirect({ error: "missing_code", provider: params.provider });
      }
      try {
        await IntegrationService.completeOAuth(db, {
          provider: params.provider,
          code: query.code,
          state: query.state,
        });
        return settingsRedirect({ connected: params.provider });
      } catch (error) {
        const code = error instanceof AppError ? error.code : "connect_failed";
        return settingsRedirect({ error: code, provider: params.provider });
      }
    },
    {
      params: providerParams,
      query: t.Object({
        code: t.Optional(t.String()),
        state: t.Optional(t.String()),
        error: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/integrations/:provider/refresh",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return IntegrationService.refreshConnection(db, ownerUserId, params.provider);
    },
    { auth: true, rateLimit: "integrations:sync", params: providerParams },
  )
  .delete(
    "/integrations/:provider",
    async ({ ownerUserId, params }) => {
      const { db } = getDb();
      await IntegrationService.disconnect(db, ownerUserId, params.provider);
      return { ok: true as const };
    },
    { auth: true, params: providerParams },
  )
  .get(
    "/integrations/:provider/folders",
    ({ ownerUserId, params }) => {
      const { db } = getDb();
      return IntegrationService.listFolders(db, ownerUserId, params.provider);
    },
    { auth: true, rateLimit: "integrations:sync", params: providerParams },
  )
  .post(
    "/integrations/:provider/sync/preview",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return CitationSyncService.previewFolder(db, {
        ownerUserId,
        provider: params.provider,
        folderId: body.folderId ?? null,
      });
    },
    {
      auth: true,
      rateLimit: "integrations:sync",
      params: providerParams,
      body: t.Object({
        folderId: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    },
  )
  .post(
    "/integrations/:provider/sync/:batchId/commit",
    ({ ownerUserId, params, body }) => {
      const { db } = getDb();
      return CitationImportService.commit(db, {
        ownerUserId,
        batchId: params.batchId,
        selectedIndexes: body.selectedIndexes,
        duplicatePolicy: body.duplicatePolicy,
      });
    },
    {
      auth: true,
      rateLimit: "integrations:sync",
      params: t.Object({ provider: providerLiteral, batchId: t.String() }),
      body: t.Object({
        selectedIndexes: t.Array(t.Number()),
        duplicatePolicy,
      }),
    },
  );

/**
 * AnnotationService — DB integration (skip tanpa DATABASE_URL). Anotasi level proyek atas
 * preview Typst: create (selectedText+page+rects), list by workspace, update, mark-sent, remove,
 * dan guard kepemilikan.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { AppError, createDb } from "@aqsha/db";
import { AnnotationService } from "../src/annotation.service";

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `itan_${SUFFIX}`;
const WS = `itan_${SUFFIX}:ws`;
const WS_OWNED = `itan_${SUFFIX}:ws-owned`;
const WS_FOREIGN = `itan_${SUFFIX}:wsx`;
const NOW = 1_700_000_000_000;
const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

async function seed() {
  await client`insert into users (owner_user_id, clerk_user_id, email, created_at, updated_at)
    values (${OWNER}, ${OWNER}, ${`${OWNER}@test.local`}, ${NOW}, ${NOW})`;
  await client`insert into workspaces (id, owner_user_id, name, kind, status, created_at, updated_at)
    values (${WS}, ${OWNER}, ${"Proyek"}, ${"paper"}, ${"active"}, ${NOW}, ${NOW})`;
  await client`insert into workspaces (id, owner_user_id, name, kind, status, created_at, updated_at)
    values (${WS_OWNED}, ${OWNER}, ${"Proyek kedua"}, ${"paper"}, ${"active"}, ${NOW}, ${NOW})`;
}

afterAll(async () => {
  if (!DATABASE_URL) return;
  await client`delete from document_annotations where owner_user_id like 'itan_%'`;
  await client`delete from workspaces where owner_user_id like 'itan_%'`;
  await client`delete from users where owner_user_id like 'itan_%'`;
  await client.end();
});

describe("AnnotationService", () => {
  let annotationId = "";

  itest("create anotasi highlight (selectedText+page+rects) → open", async () => {
    await seed();
    const selectedText = "kutipan persis di preview ".repeat(100);
    const view = await AnnotationService.create(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      kind: "highlight",
      page: 2,
      rects: [{ x: 10, y: 20, w: 100, h: 12 }],
      selectedText,
      note: "perbaiki kalimat ini",
    });
    expect(view.status).toBe("open");
    expect(view.selectedText).toBe(selectedText);
    expect(view.page).toBe(2);
    annotationId = view.id;
  });

  itest("list by workspace", async () => {
    const rows = await AnnotationService.list(db, { ownerUserId: OWNER, workspaceId: WS });
    expect(rows.map((r) => r.id)).toContain(annotationId);
  });

  itest("update catatan + status dismissed", async () => {
    const updated = await AnnotationService.update(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      annotationId,
      note: "diperbarui",
      status: "dismissed",
    });
    expect(updated.note).toBe("diperbarui");
    expect(updated.status).toBe("dismissed");
  });

  itest("markSent → status sent + threadId", async () => {
    await AnnotationService.markSent(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      ids: [annotationId],
      threadId: "thread-1",
    });
    const rows = await AnnotationService.list(db, { ownerUserId: OWNER, workspaceId: WS });
    const row = rows.find((r) => r.id === annotationId);
    expect(row?.status).toBe("sent");
    expect(row?.threadId).toBe("thread-1");
  });

  itest("dismissMany hanya menyembunyikan anotasi open/sent pada workspace yang sama", async () => {
    const sent = await AnnotationService.create(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      kind: "pin",
      page: 1,
      rects: [{ x: 4, y: 8, w: 0, h: 0 }],
      note: "sudah dikirim",
    });
    const otherWorkspace = await AnnotationService.create(db, {
      ownerUserId: OWNER,
      workspaceId: WS_OWNED,
      kind: "pin",
      page: 1,
      rects: [{ x: 5, y: 9, w: 0, h: 0 }],
      note: "tetap terlihat",
    });
    await AnnotationService.markSent(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      ids: [sent.id],
      threadId: "t-1",
    });

    await AnnotationService.dismissMany(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      ids: [sent.id, otherWorkspace.id],
    });

    const row = (await AnnotationService.list(db, { ownerUserId: OWNER, workspaceId: WS })).find(
      (item) => item.id === sent.id,
    );
    const otherRow = (
      await AnnotationService.list(db, { ownerUserId: OWNER, workspaceId: WS_OWNED })
    ).find((item) => item.id === otherWorkspace.id);
    expect(row?.status).toBe("dismissed");
    expect(otherRow?.status).toBe("open");
  });

  itest("guard: workspace bukan milik owner → 404", async () => {
    await expect(
      AnnotationService.list(db, { ownerUserId: OWNER, workspaceId: WS_FOREIGN }),
    ).rejects.toThrow(AppError);
    await expect(
      AnnotationService.create(db, {
        ownerUserId: OWNER,
        workspaceId: WS_FOREIGN,
        kind: "pin",
        page: 1,
        rects: [{ x: 1, y: 1, w: 0, h: 0 }],
      }),
    ).rejects.toThrow(AppError);
  });

  itest("remove", async () => {
    await AnnotationService.remove(db, { ownerUserId: OWNER, workspaceId: WS, annotationId });
    const rows = await AnnotationService.list(db, { ownerUserId: OWNER, workspaceId: WS });
    expect(rows.map((r) => r.id)).not.toContain(annotationId);
  });
});

/**
 * workspace_sections — DB integration (butuh Postgres via DATABASE_URL; tanpa env
 * → skip). Invariant yang hanya terbukti di DB nyata: urutan list by sort_order,
 * reorder menulis ulang 0..n-1, cascade delete ikut workspace, CHECK status
 * menolak nilai liar.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "../src/client";
import { WorkspaceSectionRepo } from "../src/repositories/workspaceSectionRepo";
import { users } from "../src/schema/users";
import { workspaces } from "../src/schema/workspaces";
import { workspaceSections } from "../src/schema/workspaceSections";

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `itsect_${SUFFIX}`;
const WS = `itsect_${SUFFIX}:ws`;
const NOW = 1_700_000_000_000;

const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

function sectionRow(id: string, sortOrder: number) {
  return {
    id: `${WS}:${id}`,
    workspaceId: WS,
    title: `Bab ${id}`,
    sortOrder,
    status: "empty",
    role: null,
    documentArtifactId: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

async function cleanup() {
  if (!DATABASE_URL) return;
  await client`delete from workspace_sections where workspace_id like ${`itsect_${SUFFIX}%`}`;
  await client`delete from workspaces where owner_user_id like ${`itsect_${SUFFIX}%`}`;
  await client`delete from users where owner_user_id like ${`itsect_${SUFFIX}%`}`;
}

beforeAll(async () => {
  if (!DATABASE_URL) return;
  await cleanup();
  await db.insert(users).values({
    ownerUserId: OWNER,
    clerkUserId: OWNER,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(workspaces).values({
    id: WS,
    ownerUserId: OWNER,
    name: "Proyek Uji",
    kind: "undergraduate_thesis",
    stage: "exploration",
    createdAt: NOW,
    updatedAt: NOW,
  });
});

afterAll(async () => {
  await cleanup();
  if (DATABASE_URL) await client.end();
});

describe("WorkspaceSectionRepo", () => {
  itest("insertMany + list terurut sort_order", async () => {
    await WorkspaceSectionRepo.insertMany(db, [sectionRow("b", 1), sectionRow("a", 0)]);
    const rows = await WorkspaceSectionRepo.listByWorkspace(db, WS);
    expect(rows.map((r) => r.title)).toEqual(["Bab a", "Bab b"]);
  });

  itest("reorder menulis ulang 0..n-1", async () => {
    const before = await WorkspaceSectionRepo.listByWorkspace(db, WS);
    const reversed = [...before].reverse().map((r) => r.id);
    await WorkspaceSectionRepo.reorder(db, WS, reversed, NOW + 1);
    const after = await WorkspaceSectionRepo.listByWorkspace(db, WS);
    expect(after.map((r) => r.id)).toEqual(reversed);
    expect(after.map((r) => r.sortOrder)).toEqual([0, 1]);
  });

  itest("CHECK menolak status liar", async () => {
    // QueryPromise drizzle bukan Promise asli — bungkus supaya expect().rejects jalan.
    await expect(
      Promise.resolve().then(() =>
        db.insert(workspaceSections).values({ ...sectionRow("x", 9), status: "weird" }),
      ),
    ).rejects.toThrow();
  });

  itest("cascade delete ikut workspace", async () => {
    await client`delete from workspaces where id = ${WS}`;
    const rows = await WorkspaceSectionRepo.listByWorkspace(db, WS);
    expect(rows).toHaveLength(0);
  });
});

import { describe, expect, test } from "bun:test";
import { WORKSPACE_KINDS } from "@aqsha/db";
import {
  MAIN_TYP_FILENAMES,
  mainTypFilename,
  resolveMainTypFilename,
  sanitizeMainTypFilename,
} from "../src/typst/main-filename";

describe("mainTypFilename", () => {
  test("memetakan setiap WorkspaceKind", () => {
    for (const kind of WORKSPACE_KINDS) {
      expect(mainTypFilename(kind)).toBe(MAIN_TYP_FILENAMES[kind]);
    }
  });

  test("freeform → main.typ; skripsi family memakai label ID", () => {
    expect(mainTypFilename("freeform")).toBe("main.typ");
    expect(mainTypFilename("undergraduate_thesis")).toBe("skripsi.typ");
    expect(mainTypFilename("journal_article")).toBe("artikel-jurnal.typ");
  });

  test("resolveMainTypFilename unknown → main.typ", () => {
    expect(resolveMainTypFilename(undefined)).toBe("main.typ");
    expect(resolveMainTypFilename("nope")).toBe("main.typ");
    expect(resolveMainTypFilename("proposal")).toBe("proposal.typ");
  });

  test("sanitizeMainTypFilename menolak path traversal / nama asing", () => {
    expect(sanitizeMainTypFilename("../evil.typ")).toBe("main.typ");
    expect(sanitizeMainTypFilename("/etc/passwd")).toBe("main.typ");
    expect(sanitizeMainTypFilename("skripsi.typ")).toBe("skripsi.typ");
    expect(sanitizeMainTypFilename(null)).toBe("main.typ");
  });
});

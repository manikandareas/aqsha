import { describe, expect, it } from "bun:test";
import { bytesToText, isHtml, isJson, isPdf, isXml } from "../http";

describe("external/http content-type helpers", () => {
  it("identifies HTML content types (with charset)", () => {
    expect(isHtml("text/html")).toBe(true);
    expect(isHtml("text/html; charset=utf-8")).toBe(true);
    expect(isHtml("application/xhtml+xml")).toBe(true);
    expect(isHtml("application/json")).toBe(false);
    expect(isHtml(null)).toBe(false);
    expect(isHtml(undefined)).toBe(false);
    expect(isHtml("")).toBe(false);
  });

  it("identifies PDF content types", () => {
    expect(isPdf("application/pdf")).toBe(true);
    expect(isPdf("application/pdf;charset=binary")).toBe(true);
    expect(isPdf("application/octet-stream")).toBe(false);
    expect(isPdf(null)).toBe(false);
  });

  it("identifies JSON content types", () => {
    expect(isJson("application/json")).toBe(true);
    expect(isJson("application/json; charset=utf-8")).toBe(true);
    expect(isJson("text/html")).toBe(false);
  });

  it("identifies XML and XML-flavored content types", () => {
    expect(isXml("application/xml")).toBe(true);
    expect(isXml("text/xml")).toBe(true);
    expect(isXml("application/atom+xml")).toBe(true);
    expect(isXml("application/json")).toBe(false);
  });
});

describe("external/http bytesToText", () => {
  it("decodes plain UTF-8 bytes", () => {
    const bytes = new TextEncoder().encode("hello world");
    expect(bytesToText(bytes)).toBe("hello world");
  });

  it("strips a leading UTF-8 BOM", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("astra")]);
    expect(bytesToText(bytes)).toBe("astra");
  });

  it("decodes empty bytes to an empty string", () => {
    expect(bytesToText(new Uint8Array())).toBe("");
  });

  it("handles non-ASCII characters (UTF-8 multi-byte)", () => {
    const bytes = new TextEncoder().encode("riset Indonésia 한글 ñ");
    expect(bytesToText(bytes)).toBe("riset Indonésia 한글 ñ");
  });
});

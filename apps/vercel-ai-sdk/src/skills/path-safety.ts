import { lstat, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, sep } from "node:path";

export const RESOURCE_EXTENSIONS = new Set([".md", ".txt", ".json", ".yaml", ".yml"]);
export const MAX_RESOURCE_BYTES = 256 * 1024;
export const MAX_SCRIPT_OUTPUT_BYTES = 64 * 1024;

export function rejectUnsafeRelativePath(path: string): void {
  if (!path.trim()) {
    throw new Error("Path is required.");
  }

  if (isAbsolute(path)) {
    throw new Error("Absolute paths are not allowed.");
  }

  const parts = path.split(/[\\/]+/);
  if (parts.includes("..")) {
    throw new Error("Path traversal is not allowed.");
  }
}

export async function resolveConfinedPath(root: string, relativePath: string): Promise<string> {
  rejectUnsafeRelativePath(relativePath);

  const rootReal = await realpath(root);
  const candidate = join(rootReal, relativePath);
  const candidateReal = await realpath(candidate);
  const rel = relative(rootReal, candidateReal);

  if (rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep) && !isAbsolute(rel))) {
    return candidateReal;
  }

  throw new Error("Resolved path escapes the skill directory.");
}

export async function assertReadableResource(path: string): Promise<void> {
  const extension = extname(path).toLowerCase();
  if (!RESOURCE_EXTENSIONS.has(extension)) {
    throw new Error(`Resource extension is not allowed: ${extension || "none"}`);
  }

  const linkInfo = await lstat(path);
  if (linkInfo.isSymbolicLink()) {
    throw new Error("Symlink resources are not allowed.");
  }

  const info = await stat(path);
  if (!info.isFile()) {
    throw new Error("Resource path is not a file.");
  }

  if (info.size > MAX_RESOURCE_BYTES) {
    throw new Error(`Resource exceeds size limit of ${MAX_RESOURCE_BYTES} bytes.`);
  }
}

export function trimOutput(value: string, maxBytes = MAX_SCRIPT_OUTPUT_BYTES): string {
  const encoded = new TextEncoder().encode(value);
  if (encoded.byteLength <= maxBytes) {
    return value;
  }

  return new TextDecoder().decode(encoded.slice(0, maxBytes)) + "\n[output truncated]";
}

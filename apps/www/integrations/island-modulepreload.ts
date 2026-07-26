import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";

import type { AstroIntegration } from "astro";

/**
 * Astro emits no `<link rel="modulepreload">` for islands: a hydrated component
 * is discovered from the `renderer-url` / `component-url` attributes on
 * `<astro-island>`, which the browser only reads after the island runtime has
 * parsed and executed. Every level of the chunk's own static import graph then
 * costs another round trip — on the landing page `landing-hero-zone` statically
 * pulls ten second-level chunks, so the React renderer and Motion land three
 * levels deep.
 *
 * This walks that graph at build time and hoists it into `<head>` so the
 * browser can fetch the whole chain in parallel with the island runtime.
 *
 * Deliberately narrow:
 * - only `client="load"` islands. Preloading `client:visible` islands would
 *   defeat the point of deferring them.
 * - only *static* imports. `import("…")` is left alone: Motion's lazy feature
 *   bundles and other deferred chunks must stay deferred.
 * - only hrefs that exist on disk, so a regex false-positive can never emit a
 *   preload for a file that isn't there.
 */
export function islandModulepreload(): AstroIntegration {
  return {
    name: "aqsha:island-modulepreload",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const outDir = fileURLToPath(dir);
        const htmlFiles: string[] = [];
        for (const entry of await readdir(outDir, { recursive: true })) {
          if (entry.endsWith(".html")) htmlFiles.push(posix.join(outDir, entry));
        }

        let injectedPages = 0;
        let injectedLinks = 0;

        for (const file of htmlFiles) {
          const html = await readFile(file, "utf8");
          const entryUrls = eagerIslandEntries(html);
          if (entryUrls.length === 0) continue;

          const chain = await resolveImportChain(entryUrls, outDir);
          const missing = chain.filter(
            (href) => !html.includes(`rel="modulepreload" href="${href}"`),
          );
          if (missing.length === 0) continue;

          const links = missing
            .map((href) => `<link rel="modulepreload" href="${href}">`)
            .join("");
          await writeFile(file, html.replace("</head>", `${links}</head>`));

          injectedPages += 1;
          injectedLinks += missing.length;
        }

        logger.info(
          `Preloaded ${injectedLinks} island chunk(s) across ${injectedPages} page(s)`,
        );
      },
    },
  };
}

/**
 * `renderer-url` + `component-url` of every `client="load"` island on the page,
 * in document order and deduplicated. The renderer (React) is shared by all
 * islands and is the largest chunk, so it naturally lands first.
 */
function eagerIslandEntries(html: string): string[] {
  const urls = new Set<string>();

  for (const [tag] of html.matchAll(/<astro-island\b[^>]*>/g)) {
    if (!tag.includes('client="load"')) continue;
    for (const [, url] of tag.matchAll(
      /(?:renderer-url|component-url)="([^"]+)"/g,
    )) {
      urls.add(url);
    }
  }

  return [...urls];
}

/**
 * Breadth-first walk of the static import graph, so preload order follows
 * dependency depth: entries first, then what they import, and so on.
 */
async function resolveImportChain(
  entries: string[],
  outDir: string,
): Promise<string[]> {
  const seen = new Set<string>();
  const resolved: string[] = [];
  let frontier = entries;

  while (frontier.length > 0) {
    // Claim the whole level first, then read it in one go. Awaiting per chunk
    // inside the loop would serialise every file read; the level is fixed by
    // this point, so reading it together cannot change what gets visited.
    const level: string[] = [];
    for (const href of frontier) {
      if (seen.has(href)) continue;
      seen.add(href);
      level.push(href);
    }
    const sources = await Promise.all(
      level.map((href) => readChunk(outDir, href)),
    );

    const next: string[] = [];
    // Sequential here on purpose: `resolved` is the preload order, so it has to
    // follow dependency depth rather than whichever read settled first.
    for (const [index, href] of level.entries()) {
      const source = sources[index];
      if (source === null) continue;

      resolved.push(href);
      for (const specifier of staticImports(source)) {
        const dependency = posix.normalize(
          posix.join(posix.dirname(href), specifier),
        );
        if (!seen.has(dependency)) next.push(dependency);
      }
    }

    frontier = next;
  }

  return resolved;
}

/** Reads a built chunk by its public href, or null when it isn't a real file. */
async function readChunk(
  outDir: string,
  href: string,
): Promise<string | null> {
  if (!href.startsWith("/") || !href.endsWith(".js")) return null;

  const path = posix.join(outDir, href);
  if (!path.startsWith(`${dirname(outDir)}/`)) return null;

  try {
    if (!(await stat(path)).isFile()) return null;
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * Relative static import/export specifiers in a built chunk. Rollup emits
 * literal relative paths (`from"./motion-provider.C9vMCxRP.js"`), so a regex is
 * enough and avoids depending on a Vite manifest.
 *
 * `import("./x.js")` cannot match: the patterns require a quote (optionally via
 * `from`) straight after the keyword, and a dynamic import has `(` there.
 */
function staticImports(source: string): string[] {
  const patterns = [
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\b[\w*${},\s]*?\bfrom\s*["']([^"']+)["']/g,
    /\bexport\b[\w*${},\s]*?\bfrom\s*["']([^"']+)["']/g,
  ];

  const specifiers = new Set<string>();
  for (const pattern of patterns) {
    for (const [, specifier] of source.matchAll(pattern)) {
      if (specifier.startsWith("./") || specifier.startsWith("../")) {
        specifiers.add(specifier);
      }
    }
  }

  return [...specifiers];
}

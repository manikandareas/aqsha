import { fileURLToPath } from "node:url";

import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import sentry from "@sentry/astro";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

import { islandModulepreload } from "./integrations/island-modulepreload.ts";

const site = process.env.PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://aqshara.com";
const sentryEnabled = Boolean(process.env.PUBLIC_SENTRY_DSN);

/**
 * Agentation is a dev-only annotation toolbar. `BaseLayout.astro` gates the
 * render behind `import.meta.env.DEV`, but the static import alone was enough
 * for Vite to emit a 390 KB chunk into every production build that no page
 * referenced. `apply: "build"` keeps `astro dev` on the real package.
 */
function stubAgentationInBuild() {
  const stub = fileURLToPath(
    new URL("./src/stubs/agentation-noop.ts", import.meta.url),
  );

  return {
    name: "aqsha:stub-agentation",
    apply: "build",
    enforce: "pre",
    resolveId(source) {
      return source === "agentation" ? stub : null;
    },
  };
}

export default defineConfig({
  site,
  output: "static",
  integrations: [
    react(),
    sentry({
      enabled: { client: sentryEnabled, server: false },
      sourcemaps: {
        filesToDeleteAfterUpload: ["./dist/**/*.map"],
      },
    }),
    mdx({
      remarkPlugins: [remarkGfm],
      rehypePlugins: [
        rehypeSlug,
        [rehypeAutolinkHeadings, { behavior: "wrap" }],
      ],
    }),
    sitemap({
      filter: (page) => !page.includes("/draft"),
    }),
    islandModulepreload(),
  ],
  vite: {
    plugins: [tailwindcss(), stubAgentationInBuild()],
  },
  markdown: {
    shikiConfig: {
      theme: "github-dark",
    },
  },
});

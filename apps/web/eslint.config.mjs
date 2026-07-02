import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // eve (Fase 6) generated artifacts — bundles here OOM eslint if traversed.
    ".eve/**",
    ".output/**",
    ".workflow-data/**",
    ".nitro/**",
    ".vercel/**",
    // Content Collections generated output (blog MDX content layer).
    ".content-collections/**",
  ]),
]);

export default eslintConfig;

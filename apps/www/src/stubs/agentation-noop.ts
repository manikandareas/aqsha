/**
 * Build-time stand-in for the `agentation` package.
 *
 * `BaseLayout.astro` gates the toolbar behind `import.meta.env.DEV`, so it is
 * never rendered in production — but the static `import` still pulled a 390 KB
 * chunk into `dist/_astro/` that no page referenced. The Vite plugin in
 * `astro.config.mjs` (`apply: "build"`) points the specifier here instead, so
 * the real package is only ever resolved by `astro dev`.
 */
export function Agentation(): null {
  return null;
}

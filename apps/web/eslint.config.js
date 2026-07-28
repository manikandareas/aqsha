import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		// Aqsha contract rules: no React/Next imports; icons via $lib/icons (Hugeicons).
		// Runes-only mode is enforced at compile time via dynamicCompileOptions in svelte.config.js.
		files: ['src/**/*.{ts,js,svelte,svelte.ts}'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: '@lucide/svelte',
							message: 'Use $lib/icons (Hugeicons) — iconLibrary is hugeicons.'
						},
						{
							name: 'lucide-svelte',
							message: 'Use $lib/icons (Hugeicons).'
						}
					],
					patterns: [
						{
							group: ['@lucide/svelte/*', 'lucide-svelte/*'],
							message: 'Use $lib/icons (Hugeicons).'
						},
						{
							group: [
								'react',
								'react-dom',
								'react/*',
								'react-dom/*',
								'next',
								'next/*',
								'@clerk/nextjs',
								'@clerk/nextjs/*'
							],
							message: 'No React/Next in apps/web. Use the Svelte equivalent.'
						}
					]
				}
			]
		}
	},
	{
		// shadcn-svelte vendored primitives are registry-managed (re-fetched via
		// `shadcn-svelte update`), so we don't hand-edit them. Their generic `href`
		// passthrough on Button/anchor is not app navigation — turn off the
		// resolve() rule here to keep vendored code lint-clean.
		files: ['src/lib/components/ui/**'],
		rules: {
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		// Marketing landing nav is anchor-heavy (`/#bandingin`, `/#pricing`) + query links
		// (`/sign-up?plan=...`) that resolve() does not model. Aqsha deploys at domain root (no base
		// path), so resolve()'s only job — prepending `base` — is a no-op here. Same precedent as
		// vendored `ui/**` above. Blog/changelog routes keep the rule ON and use resolve() properly.
		files: ['src/lib/features/marketing/**'],
		rules: {
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		// SettingsRail nav is data-driven: it maps `settingsMenu` (each item carries an exact
		// `/app/settings/<section>` href) to `<a href={item.href}>`, so resolve() cannot be inlined
		// per link (the rule requires a literal arg). All settings routes are static and Aqsha deploys
		// at domain root (base path empty → resolve() is a no-op). Same precedent as vendored `ui/**` +
		// `features/marketing/**`. Shell-level links into settings (AppSidebar/NavUser) stay outside
		// this folder and keep the rule ON with inline resolve().
		files: ['src/lib/features/settings/**'],
		rules: {
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		// Thread source cards / inline citations render EXTERNAL research URLs — a dynamic `href` to an
		// arbitrary domain (paper/web/DOI), opened in a new tab. resolve() models internal SvelteKit
		// route ids only, so it cannot apply here. Same precedent as vendored `ui/**` + `marketing/**` +
		// `settings/**` above.
		files: [
			'src/lib/components/ai-elements/InlineCitation.svelte',
			'src/lib/features/threads/components/SourceCardList.svelte',
			'src/lib/features/threads/components/SourceLinkList.svelte',
			'src/lib/features/threads/components/SourceLinkRow.svelte',
			'src/lib/features/threads/components/SourcesPanel.svelte',
			'src/lib/features/threads/components/deep-viz/SourceCardList.svelte',
			'src/lib/features/threads/components/deep-viz/PaperPills.svelte'
		],
		rules: {
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		// Explore / discovery render EXTERNAL research URLs (paper/publisher/DOI/OpenAlex, house-ad
		// creatives, news source links) opened in a new tab, plus dynamic/query internal deep links
		// (`/app/explore?topic=…`, `/app/explore/<encoded key>`) and same-page `goto(url)` URL-state
		// writes (q/topic codec) that resolve() cannot model. Same precedent as vendored `ui/**` +
		// `marketing/**` + `settings/**` + thread source cards above. Internal-only reader links still
		// use resolve() inline.
		files: [
			'src/lib/features/discovery/**',
			'src/lib/features/explore/**',
			'src/lib/components/HomeBannerCarousel.svelte'
		],
		rules: {
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		// Citation manager renders EXTERNAL research URLs (DOI/publisher links opened in a new tab) plus
		// internal deep links that resolve() cannot model here: a static settings link
		// (`/app/settings/integrations`) and a dynamic workspace-artifact reader href
		// (`/app/workspaces/<id>/artifacts/<artifactId>`). Same precedent as vendored `ui/**` +
		// `marketing/**` + `settings/**` + thread source cards + discovery/explore above.
		files: ['src/lib/features/citations/**', 'src/lib/components/citation/**'],
		rules: {
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		// Workspaces artifact reader renders EXTERNAL artifact locators — paper DOIs (`https://doi.org/…`),
		// saved-page links, and object-storage file/download URLs (pdf/docx/image) opened or downloaded
		// in a new tab — none of which resolve() can model (it maps internal SvelteKit route ids only).
		// Internal-only crumbs ("Workspace" / "Back to workspace") still use resolve() inline. Same
		// precedent as vendored `ui/**` + `marketing/**` + `settings/**` + thread source cards +
		// discovery/explore + citations above.
		files: ['src/lib/features/workspaces/**'],
		rules: {
			'svelte/no-navigation-without-resolve': 'off'
		}
	}
);

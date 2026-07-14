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
		// Aqsha contract rules (plan §1 no-React, §6 icon contract). Runes-only
		// (§3.4) is enforced at compile time via dynamicCompileOptions in
		// svelte.config.js, which turns legacy syntax into a build error.
		files: ['src/**/*.{ts,js,svelte,svelte.ts}'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: '@lucide/svelte',
							message:
								'Use $lib/icons (Hugeicons) — plan §6 icon contract. iconLibrary is hugeicons.'
						},
						{
							name: 'lucide-svelte',
							message: 'Use $lib/icons (Hugeicons) — plan §6 icon contract.'
						}
					],
					patterns: [
						{
							group: ['@lucide/svelte/*', 'lucide-svelte/*'],
							message: 'Use $lib/icons (Hugeicons) — plan §6 icon contract.'
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
							message: 'No React/Next in apps/svelte (plan §1). Use the Svelte equivalent.'
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
		// (`/sign-up?plan=...`) that resolve() does not model, and Aqsha deploys at domain root
		// (no base path) so resolve()'s only job — prepending `base` — is a no-op here. Keeping the
		// hrefs literal (identical to `apps/web/features/marketing/**`) also keeps the port a clean
		// 1:1 diff for parity review. Same precedent as vendored `ui/**` above. Blog/changelog routes
		// (real dynamic nav) keep the rule ON and use resolve() properly.
		files: ['src/lib/features/marketing/**'],
		rules: {
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		// SettingsRail nav is data-driven: it maps `settingsMenu` (each item carries an exact
		// `/app/settings/<section>` href) to `<a href={item.href}>`, so resolve() cannot be inlined
		// per link (the rule requires a literal arg, Phase 3 gotcha). All settings routes are static
		// and Aqsha deploys at domain root (base path empty → resolve() is a no-op), and web uses
		// `<Link href={item.href}>` verbatim — keeping the hrefs literal is the clean 1:1 parity port.
		// Same precedent as vendored `ui/**` + `features/marketing/**`. Shell-level links into settings
		// (AppSidebar/NavUser) stay outside this folder and keep the rule ON with inline resolve().
		files: ['src/lib/features/settings/**'],
		rules: {
			'svelte/no-navigation-without-resolve': 'off'
		}
	}
);

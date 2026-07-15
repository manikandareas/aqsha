import { describe, expect, it } from 'vitest';
import { buttonVariants } from './index.js';

/**
 * Button variant contract. Locks the Aqsha press choreography: solid variants (default/secondary)
 * carry `.btn-keycap` + `--btn-face`; non-solid variants (outline/ghost/destructive) carry the generic
 * active-translate nudge and NO keycap.
 */
describe('buttonVariants', () => {
	it('default is a keycap driven by --primary', () => {
		const cls = buttonVariants({ variant: 'default' });
		expect(cls).toContain('btn-keycap');
		expect(cls).toContain('[--btn-face:var(--primary)]');
		expect(cls).not.toContain('active:not-aria-[haspopup]:translate-y-px');
	});

	it('secondary is a keycap driven by --secondary', () => {
		const cls = buttonVariants({ variant: 'secondary' });
		expect(cls).toContain('btn-keycap');
		expect(cls).toContain('[--btn-face:var(--secondary)]');
	});

	it('outline/ghost/destructive use the active-translate nudge, not the keycap', () => {
		for (const variant of ['outline', 'ghost', 'destructive'] as const) {
			const cls = buttonVariants({ variant });
			expect(cls, variant).not.toContain('btn-keycap');
			expect(cls, variant).toContain('active:not-aria-[haspopup]:translate-y-px');
		}
	});

	it('link is a plain text link (no keycap, no translate)', () => {
		const cls = buttonVariants({ variant: 'link' });
		expect(cls).toContain('underline');
		expect(cls).not.toContain('btn-keycap');
	});

	it('sizes map to the Aqsha heights', () => {
		expect(buttonVariants({ size: 'default' })).toContain('h-8');
		expect(buttonVariants({ size: 'sm' })).toContain('h-7');
		expect(buttonVariants({ size: 'lg' })).toContain('h-9');
		expect(buttonVariants({ size: 'icon' })).toContain('size-8');
	});
});

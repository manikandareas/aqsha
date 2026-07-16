import { describe, expect, it } from 'vitest';
import { buttonVariants } from './index.js';

/**
 * Button variant contract. Locks the Aqsha press choreography: solid variants
 * (default/secondary/destructive-solid) carry `.btn-keycap` + `--btn-face`; outline and
 * soft-destructive carry the flatter `.btn-lip`; ghost gets a bare active nudge, no depth class.
 */
describe('buttonVariants', () => {
	it('default is a keycap driven by --primary', () => {
		const cls = buttonVariants({ variant: 'default' });
		expect(cls).toContain('btn-keycap');
		expect(cls).toContain('[--btn-face:var(--primary)]');
		expect(cls).not.toContain('btn-lip');
	});

	it('secondary is a keycap driven by --secondary', () => {
		const cls = buttonVariants({ variant: 'secondary' });
		expect(cls).toContain('btn-keycap');
		expect(cls).toContain('[--btn-face:var(--secondary)]');
	});

	it('destructive-solid is a keycap driven by --destructive-strong', () => {
		const cls = buttonVariants({ variant: 'destructive-solid' });
		expect(cls).toContain('btn-keycap');
		expect(cls).toContain('[--btn-face:var(--destructive-strong)]');
	});

	it('outline and soft-destructive use the flat 3px lip, not the keycap', () => {
		for (const variant of ['outline', 'destructive'] as const) {
			const cls = buttonVariants({ variant });
			expect(cls, variant).not.toContain('btn-keycap');
			expect(cls, variant).toContain('btn-lip');
		}
	});

	it('ghost uses the bare active nudge without depth classes', () => {
		const cls = buttonVariants({ variant: 'ghost' });
		expect(cls).not.toContain('btn-keycap');
		expect(cls).not.toContain('btn-lip');
		expect(cls).toContain('active:not-aria-[haspopup]:translate-y-[2px]');
	});

	it('link is a plain text link (no keycap, no lip)', () => {
		const cls = buttonVariants({ variant: 'link' });
		expect(cls).toContain('underline');
		expect(cls).not.toContain('btn-keycap');
		expect(cls).not.toContain('btn-lip');
	});

	it('sizes map to the Aqsha heights (sm 32 / default 40 / lg 46)', () => {
		expect(buttonVariants({ size: 'default' })).toContain('h-10');
		expect(buttonVariants({ size: 'sm' })).toContain('h-8');
		expect(buttonVariants({ size: 'lg' })).toContain('h-[46px]');
		expect(buttonVariants({ size: 'icon' })).toContain('size-10');
	});
});

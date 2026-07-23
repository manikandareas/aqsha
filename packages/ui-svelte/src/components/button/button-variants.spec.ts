import { describe, expect, it } from 'vitest';
import { buttonVariants } from './index.js';

/**
 * Button variant contract. Filled, outline, and tonal buttons share the same
 * restrained interaction class while each face stays tied to its semantic token.
 */
describe('buttonVariants', () => {
	it('default uses the smooth primary gradient face', () => {
		const cls = buttonVariants({ variant: 'default' });
		expect(cls).toContain('btn-smooth');
		expect(cls).toContain('btn-filled-gradient');
		expect(cls).toContain('[--btn-face:var(--primary)]');
	});

	it('secondary uses the smooth secondary gradient face', () => {
		const cls = buttonVariants({ variant: 'secondary' });
		expect(cls).toContain('btn-smooth');
		expect(cls).toContain('btn-filled-gradient');
		expect(cls).toContain('[--btn-face:var(--secondary)]');
	});

	it('destructive-solid uses the shared filled face', () => {
		const cls = buttonVariants({ variant: 'destructive-solid' });
		expect(cls).toContain('btn-smooth');
		expect(cls).toContain('btn-filled-gradient');
		expect(cls).toContain('[--btn-face:var(--destructive-strong)]');
	});

	it('outline uses the shared interaction and outline face', () => {
		const cls = buttonVariants({ variant: 'outline' });
		expect(cls).toContain('btn-smooth');
		expect(cls).toContain('btn-outline-gradient');
	});

	it('destructive uses a tonal face instead of a solid competing CTA', () => {
		const cls = buttonVariants({ variant: 'destructive' });
		expect(cls).toContain('btn-smooth');
		expect(cls).toContain('btn-tonal-gradient');
		expect(cls).toContain('[--btn-tint:var(--destructive)]');
	});

	it('ghost uses the bare active nudge without depth classes', () => {
		const cls = buttonVariants({ variant: 'ghost' });
		expect(cls).not.toContain('btn-smooth');
		expect(cls).toContain('active:not-aria-[haspopup]:translate-y-px');
	});

	it('link is a plain text link without control depth', () => {
		const cls = buttonVariants({ variant: 'link' });
		expect(cls).toContain('underline');
		expect(cls).not.toContain('btn-smooth');
	});

	it('sizes map to the Aqsha heights (sm 32 / default 36 / lg 40)', () => {
		expect(buttonVariants({ size: 'default' })).toContain('h-9');
		expect(buttonVariants({ size: 'sm' })).toContain('h-8');
		expect(buttonVariants({ size: 'lg' })).toContain('h-10');
		expect(buttonVariants({ size: 'icon' })).toContain('size-10');
	});
});

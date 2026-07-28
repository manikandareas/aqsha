import { describe, expect, it } from 'vitest';
import {
	pickClerkDisplayName,
	resolveViewer,
	viewerDisplay,
	viewerInitials,
	type ViewerIdentity
} from './viewer-identity';

describe('pickClerkDisplayName', () => {
	it('fullName → "first last" → username → null', () => {
		expect(pickClerkDisplayName({ fullName: 'Vito Manik' })).toBe('Vito Manik');
		expect(pickClerkDisplayName({ firstName: 'Vito', lastName: 'Manik' })).toBe('Vito Manik');
		expect(pickClerkDisplayName({ username: 'vito' })).toBe('vito');
		expect(pickClerkDisplayName({})).toBeNull();
		expect(pickClerkDisplayName(null)).toBeNull();
	});
});

describe('viewerInitials', () => {
	it('2 huruf dari nama', () => {
		expect(viewerInitials('Vito Manik', 'v@x.com', 'Pengguna')).toBe('VM');
	});
	it('pakai email saat nama = fallback', () => {
		expect(viewerInitials('Pengguna', 'imam.oreo@x.com', 'Pengguna')).toBe('IO');
	});
});

describe('resolveViewer', () => {
	const clerkUser = {
		fullName: 'Clerk Name',
		primaryEmailAddress: { emailAddress: 'clerk@x.com' },
		imageUrl: 'https://img/clerk.png'
	};

	it('base menang bila terisi', () => {
		const base: ViewerIdentity = {
			name: 'Base',
			email: 'base@x.com',
			image: 'https://img/base.png'
		};
		expect(resolveViewer(base, clerkUser)).toEqual(base);
	});

	it('field null base diisi dari Clerk', () => {
		const base: ViewerIdentity = { name: null, email: null, image: null };
		expect(resolveViewer(base, clerkUser)).toEqual({
			name: 'Clerk Name',
			email: 'clerk@x.com',
			image: 'https://img/clerk.png'
		});
	});

	it('base undefined → undefined', () => {
		expect(resolveViewer(undefined, clerkUser)).toBeUndefined();
	});

	it('dua user berbeda → hasil independen (no shared state)', () => {
		const a = resolveViewer({ name: null, email: null, image: null }, { fullName: 'User A' });
		const b = resolveViewer({ name: null, email: null, image: null }, { fullName: 'User B' });
		expect(a?.name).toBe('User A');
		expect(b?.name).toBe('User B');
	});
});

describe('viewerDisplay', () => {
	it('rantai fallback name/email + initials', () => {
		const out = viewerDisplay(
			undefined,
			{ fullName: 'Vito Manik' },
			{
				name: 'Pengguna',
				email: 'fallback@x.com'
			}
		);
		expect(out.name).toBe('Vito Manik');
		expect(out.email).toBe('fallback@x.com');
		expect(out.initials).toBe('VM');
	});

	it('jatuh ke fallback penuh saat tak ada data', () => {
		const out = viewerDisplay(undefined, null, { name: 'Pengguna', email: 'p@x.com' });
		expect(out.name).toBe('Pengguna');
		expect(out.email).toBe('p@x.com');
		expect(out.image).toBeNull();
		expect(out.initials).toBe('PX'); // email 'p@x.com' → p, x
	});
});

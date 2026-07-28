/**
 * Logika viewer identity PURE (tanpa runes/DOM). Dipisah dari `viewer.svelte.ts` agar pure model
 * tetap di `.ts` murni → aman di browser bundle & unit-testable tanpa mount.
 */

export type ViewerIdentity = {
	name: string | null;
	email: string | null;
	image: string | null;
};

/** Subset struktural `UserResource` yang dibaca — helper pure tak perlu type Clerk penuh. */
export type ClerkUserLike =
	| {
			fullName?: string | null;
			firstName?: string | null;
			lastName?: string | null;
			username?: string | null;
			primaryEmailAddress?: { emailAddress?: string | null } | null;
			imageUrl?: string | null;
	  }
	| null
	| undefined;

/** Nama tampilan dari user Clerk: fullName → "first last" → username → null. */
export function pickClerkDisplayName(user: ClerkUserLike): string | null {
	if (!user) return null;
	return (
		user.fullName ||
		[user.firstName, user.lastName].filter(Boolean).join(' ') ||
		user.username ||
		null
	);
}

/** Inisial 2-huruf dari nama (atau email bila nama = fallback). */
export function viewerInitials(name: string, email: string, nameFallback: string): string {
	const source = name === nameFallback ? email : name;
	return source
		.split(/[\s@._-]+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join('');
}

/** Gabung viewer base + user Clerk (base menang bila terisi). */
export function resolveViewer<T extends ViewerIdentity>(
	viewer: T | undefined,
	clerkUser: ClerkUserLike
): T | undefined {
	if (!viewer) return undefined;
	return {
		...viewer,
		name: viewer.name || pickClerkDisplayName(clerkUser),
		email: viewer.email || clerkUser?.primaryEmailAddress?.emailAddress || null,
		image: viewer.image || clerkUser?.imageUrl || null
	};
}

export type ViewerDisplay = {
	name: string;
	email: string;
	image: string | null;
	initials: string;
};

/** Hitung display lengkap dgn fallback wajib. */
export function viewerDisplay(
	viewer: ViewerIdentity | undefined,
	clerkUser: ClerkUserLike,
	fallback: { name: string; email: string }
): ViewerDisplay {
	const name = viewer?.name || pickClerkDisplayName(clerkUser) || fallback.name;
	const email = viewer?.email || clerkUser?.primaryEmailAddress?.emailAddress || fallback.email;
	const image = viewer?.image || clerkUser?.imageUrl || null;
	return { name, email, image, initials: viewerInitials(name, email, fallback.name) };
}

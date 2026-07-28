// Pure formatters for the discovery mosaic. id-only (the surface is Indonesian-first).

// ── Source / time / domain ────────────────────────────────────────────────
export function sourceName(item: {
	kind: string;
	authors?: string[];
	sourceLabel: string;
}): string {
	if (item.authors && item.authors.length > 0) {
		return item.authors.length > 1 ? `${item.authors[0]} dkk.` : item.authors[0];
	}
	return item.sourceLabel;
}

export function relativeTime(ms: number | undefined): string | null {
	if (!ms) return null;
	const diff = Date.now() - ms;
	if (diff < 0) return absoluteDate(ms);
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return 'baru saja';
	if (minutes < 60) return `${minutes} menit lalu`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} jam lalu`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days} hari lalu`;
	return absoluteDate(ms);
}

function absoluteDate(ms: number): string | null {
	try {
		return new Date(ms).toLocaleDateString('id-ID', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	} catch {
		return null;
	}
}

export function formatCitationCount(value: number | undefined): string | null {
	if (value === undefined) return null;
	const count =
		value >= 1_000
			? `${(value / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })}rb`
			: value.toLocaleString('id-ID');
	return `${count} sitasi`;
}

export function topicBadgeClass(topic: string): string {
	const t = topic.toLowerCase();
	if (t.includes('agent') || t.includes('reason'))
		return 'bg-lavender-soft text-lavender-foreground';
	if (t.includes('world') || t.includes('robot')) return 'bg-coral-soft text-coral-foreground';
	if (t.includes('image') || t.includes('video') || t.includes('3d'))
		return 'bg-sky-soft text-sky-foreground';
	return 'bg-lemon-soft text-lemon-foreground';
}

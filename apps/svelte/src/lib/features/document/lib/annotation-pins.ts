export type PinCandidate = {
	id: string;
	page: number;
	top: number;
	left: number;
	status: 'open' | 'sent';
	/** Teks acuan anotasi tak lagi ditemukan di dokumen; pin hanya boleh ditawari hapus. */
	floating: boolean;
};

export type PlacedPin = PinCandidate & { number: number };

const DEFAULT_MIN_GAP = 26;

/**
 * Urutkan pin mengikuti urutan baca dokumen lalu geser yang bertabrakan ke bawah. Penomoran
 * dihitung dari urutan akhir sehingga nomor pin selalu naik saat mata bergerak turun — pembacaan
 * ini yang membuat nomor pin dan nomor chip composer dapat dipercaya sebagai rujukan yang sama.
 */
export function placePins(
	candidates: readonly PinCandidate[],
	options: { minGap?: number } = {}
): PlacedPin[] {
	const minGap = options.minGap ?? DEFAULT_MIN_GAP;
	const sorted = [...candidates].sort((a, b) => a.page - b.page || a.top - b.top);
	let lastPage: number | null = null;
	let lastTop = Number.NEGATIVE_INFINITY;
	return sorted.map((candidate, i) => {
		if (candidate.page !== lastPage) {
			lastPage = candidate.page;
			lastTop = Number.NEGATIVE_INFINITY;
		}
		const top = Math.max(candidate.top, lastTop + minGap);
		lastTop = top;
		return { ...candidate, top, number: i + 1 };
	});
}

/** Cermin `DOI_RE` di services — apps/svelte tidak boleh mengimpor paket itu. */
const DOI_RE = /10\.\d{4,9}\/[-._;()/:a-z0-9]+/i;

/**
 * Dipakai aksi "Tempel DOI". Pembacaan clipboard baru terjadi saat aksi dipilih,
 * bukan saat menu dibuka, karena izin clipboard tidak seragam antar-browser dan
 * menu yang isinya berubah-ubah tanpa sebab sulit dipahami pengguna.
 */
export function extractDoiFromText(text: string): string | null {
	const match = text.trim().match(DOI_RE);
	if (!match) return null;
	return match[0].replace(/[.,;)]+$/, '');
}

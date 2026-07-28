import { format, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';

/** "2026-06-27" → "27 Juni 2026" (locale Indonesia). Satu sumber untuk blog & changelog. */
export function formatDateId(isoDate: string): string {
	return format(parseISO(isoDate), 'd MMMM yyyy', { locale: id });
}

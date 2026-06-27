import { format, parseISO } from "date-fns";
import { id } from "date-fns/locale";

/** "2026-06-27" → "27 Juni 2026" (locale Indonesia). */
export function formatPostDate(isoDate: string): string {
  return format(parseISO(isoDate), "d MMMM yyyy", { locale: id });
}

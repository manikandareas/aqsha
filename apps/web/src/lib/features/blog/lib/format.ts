import { formatDateId } from '$lib/dates';

/** "2026-06-27" → "27 Juni 2026" (locale Indonesia). Delegasi ke util bersama. */
export const formatPostDate = formatDateId;

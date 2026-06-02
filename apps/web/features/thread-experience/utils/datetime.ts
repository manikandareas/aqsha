import {
  format,
  formatDuration,
  intervalToDuration,
  type DurationUnit,
  type Locale,
} from "date-fns";
import { id as idLocale } from "date-fns/locale";

const compactRunDurationLocale = {
  ...idLocale,
  formatDistance: (token: string, count: number) => {
    const unit = compactRunDurationUnits[token] ?? "";
    return `${count}${unit}`;
  },
} satisfies Locale;

const compactRunDurationUnits: Record<string, string> = {
  xSeconds: "s",
  xMinutes: "m",
  xHours: "j",
  xDays: "h",
};

const threadDateFormat = "d MMM yyyy";
const runDurationUnits: DurationUnit[] = ["days", "hours", "minutes", "seconds"];

export function formatDate(timestamp: number) {
  return format(new Date(timestamp), threadDateFormat, { locale: idLocale });
}

export function formatCompactDuration({
  start,
  end,
}: {
  start?: number;
  end?: number;
}) {
  if (!start) return "beberapa saat";

  const duration = intervalToDuration({
    start: new Date(start),
    end: new Date(end ?? Date.now()),
  });
  const formatted = formatDuration(duration, {
    format: runDurationUnits,
    locale: compactRunDurationLocale,
    delimiter: " ",
  });

  return formatted || "0s";
}

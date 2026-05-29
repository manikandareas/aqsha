import {
  format,
  formatDistanceToNowStrict,
  formatDuration,
  intervalToDuration,
  isBefore,
  subDays,
  type DurationUnit,
  type Locale,
} from "date-fns";
import { id as idLocale } from "date-fns/locale";

const compactIdLocale = {
  ...idLocale,
  formatDistance: (token: string, count: number) => {
    const unit = compactDistanceUnits[token] ?? "";
    return `${count}${unit}`;
  },
} satisfies Locale;

const compactDistanceUnits: Record<string, string> = {
  lessThanXSeconds: "d",
  xSeconds: "d",
  halfAMinute: "d",
  lessThanXMinutes: "m",
  xMinutes: "m",
  aboutXHours: "j",
  xHours: "j",
  xDays: "h",
  aboutXWeeks: "mg",
  xWeeks: "mg",
  aboutXMonths: "bln",
  xMonths: "bln",
  aboutXYears: "thn",
  xYears: "thn",
  overXYears: "thn",
  almostXYears: "thn",
};

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
const naturalRelativeThresholdDays = 30;
const runDurationUnits: DurationUnit[] = ["days", "hours", "minutes", "seconds"];

export function formatCompactRelativeTime(timestamp: number) {
  return formatDistanceToNowStrict(new Date(timestamp), {
    locale: compactIdLocale,
  });
}

export function formatNaturalRelativeTime(timestamp: number) {
  const date = new Date(timestamp);

  if (isBefore(date, subDays(new Date(), naturalRelativeThresholdDays))) {
    return format(date, threadDateFormat, { locale: idLocale });
  }

  return formatDistanceToNowStrict(date, {
    locale: idLocale,
    addSuffix: true,
  });
}

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

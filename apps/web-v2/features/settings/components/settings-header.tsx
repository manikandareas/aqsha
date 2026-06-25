import { settingsItemForPath, type SettingsKey } from "../lib/settings-menu";

export function SettingsHeader({
  section,
  title,
}: {
  section: SettingsKey;
  title?: string;
}) {
  const item = settingsItemForPath(`/app/settings/${section}`);
  const heading = title ?? item.label;

  return (
    <header className="mb-1">
      <h1 className="font-heading text-[1.75rem] font-bold tracking-tight text-foreground sm:text-[2rem]">
        {heading}
      </h1>
      {item.description ? (
        <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
          {item.description}
        </p>
      ) : null}
    </header>
  );
}

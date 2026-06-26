import { settingsItemForPath, type SettingsKey } from "../lib/settings-menu";

export function SettingsHeader({
  section,
  title,
  description,
}: {
  section: SettingsKey;
  title?: string;
  /** Override teks deskripsi menu. `null` menyembunyikannya. */
  description?: string | null;
}) {
  const item = settingsItemForPath(`/app/settings/${section}`);
  const heading = title ?? item.label;
  const sub = description === undefined ? item.description : description;

  return (
    <header className="mb-1">
      <h1 className="font-heading text-[1.75rem] font-bold tracking-tight text-foreground sm:text-[2rem]">
        {heading}
      </h1>
      {sub ? (
        <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">{sub}</p>
      ) : null}
    </header>
  );
}

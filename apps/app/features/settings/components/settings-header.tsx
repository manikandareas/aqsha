import { settingsItemForPath, type SettingsKey } from "../lib/settings-menu";

export function SettingsHeader({ section, title = "Settings" }: { section: SettingsKey; title?: string }) {
  const item = settingsItemForPath(`/settings/${section}`);

  return (
    <header className="flex flex-col mb-2">
      <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h1>
      <p className="text-sm text-muted-foreground leading-normal mt-1 max-w-2xl">
        {item.description}
      </p>
    </header>
  );
}

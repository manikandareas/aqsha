import { settingsItemForPath, type SettingsKey } from "../lib/settings-menu";

export function SettingsHeader({ section, title = "Settings" }: { section: SettingsKey; title?: string }) {
  const item = settingsItemForPath(`/settings/${section}`);

  return (
    <header className="grid gap-1">
      <h1 className="font-heading text-2xl font-bold leading-tight text-foreground">{title}</h1>
      <p className="text-[13px] font-medium leading-5 text-muted-foreground">{item.description}</p>
    </header>
  );
}

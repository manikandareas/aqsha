"use client";

import { Button } from "@aqsha/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@aqsha/ui/components/card";
import { MonitorIcon, MoonIcon, SunIcon } from "@aqsha/ui/icons";
import { useTheme } from "next-themes";

const OPTIONS = [
  { value: "light", label: "Terang", icon: SunIcon },
  { value: "dark", label: "Gelap", icon: MoonIcon },
  { value: "system", label: "Sistem", icon: MonitorIcon },
] as const;

export default function Page() {
  // `theme` undefined di SSR + render klien pertama (next-themes resolve pasca-mount)
  // → server & hydrate sepakat (active=false) → tanpa mismatch, tanpa flag mounted.
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Tampilan</h1>
        <p className="text-sm text-muted-foreground">Pilih tema antarmuka.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Tema</CardTitle>
          <CardDescription>Mengikuti sistem secara default.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {OPTIONS.map((o) => {
            const Icon = o.icon;
            const active = theme === o.value;
            return (
              <Button
                key={o.value}
                variant={active ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme(o.value)}
              >
                <Icon className="size-4" />
                {o.label}
              </Button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

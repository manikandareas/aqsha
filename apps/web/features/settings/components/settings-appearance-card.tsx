"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTheme } from "next-themes";

export function SettingsAppearanceCard() {
  const { setTheme, theme } = useTheme();

  return (
    <Card id="appearance" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Choose how Aqsha looks on this device.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-1">
            <Label htmlFor="settings-theme">Theme</Label>
            <p className="text-sm text-muted-foreground">Use light mode, dark mode, or follow your system preference.</p>
          </div>
          <Select
            value={theme ?? "system"}
            onValueChange={(value) => {
              if (value) {
                setTheme(value);
              }
            }}
          >
            <SelectTrigger id="settings-theme" className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

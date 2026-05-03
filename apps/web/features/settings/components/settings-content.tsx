import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { getDiceBearAvatarUrl } from "@/lib/avatar";
import type { BetterAuthSession } from "@/lib/server-auth";
import { BookOpenTextIcon, PaletteIcon, ShieldIcon, UserIcon, WalletCardsIcon } from "lucide-react";
import { SettingsAccountCard } from "./settings-account-card";
import { SettingsAppearanceCard } from "./settings-appearance-card";

type SettingsContentProps = {
  session: BetterAuthSession | null;
};

const sections = [
  { id: "profile", title: "Profile", description: "Identity and contact details", icon: UserIcon },
  { id: "appearance", title: "Appearance", description: "Theme and display", icon: PaletteIcon },
  { id: "writing", title: "Writing", description: "Journal defaults", icon: BookOpenTextIcon },
  { id: "usage", title: "Usage & Plan", description: "Limits and account usage", icon: WalletCardsIcon },
  { id: "account", title: "Account", description: "Security and session", icon: ShieldIcon },
] as const;

const usageMetrics = [
  ["Active journals", "Coming soon"],
  ["AI actions", "Coming soon"],
  ["Exports", "Coming soon"],
  ["Source uploads", "Coming soon"],
] as const;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function SettingsSectionNav() {
  return (
    <nav className="lg:sticky lg:top-20 lg:self-start" aria-label="Settings sections">
      <div className="flex gap-2 overflow-x-auto pb-2 lg:grid lg:gap-1 lg:overflow-visible lg:pb-0">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="group flex min-w-44 items-start gap-3 rounded-lg px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
            >
              <Icon className="mt-0.5 size-4 shrink-0" />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium leading-none">{section.title}</span>
                <span className="hidden text-xs leading-snug text-muted-foreground lg:block">
                  {section.description}
                </span>
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

function SettingsRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid gap-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="max-w-md text-sm text-muted-foreground">{description}</div>
      </div>
      <div className="shrink-0 sm:min-w-44 sm:text-right">{children}</div>
    </div>
  );
}

function SettingsProfileCard({ session }: SettingsContentProps) {
  const user = session?.user;
  const name = user?.name ?? "User";
  const email = user?.email ?? "Not signed in";
  const avatarUrl = user?.image ?? getDiceBearAvatarUrl(name);

  return (
    <Card id="profile" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your account identity and contact details.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar size="lg" className="size-14">
            <AvatarImage src={avatarUrl} alt={name} />
            <AvatarFallback>{getInitials(name)}</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-medium">{name}</h2>
              <Badge variant={user?.emailVerified ? "blue" : "outline"}>
                {user?.emailVerified ? "Verified" : "Unverified"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{email}</p>
          </div>
        </div>
        <Separator className="my-5" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="settings-name">Name</Label>
            <Input id="settings-name" value={name} readOnly disabled />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="settings-email">Email</Label>
            <Input id="settings-email" value={email} readOnly disabled />
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Profile editing will be available once account update support is added.
        </p>
      </CardContent>
    </Card>
  );
}

function SettingsWritingCard() {
  return (
    <Card id="writing" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Writing & Journal Defaults</CardTitle>
        <CardDescription>Default preferences for future journals and AI assistance.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        <SettingsRow title="Default journal type" description="Choose the writing format Aqsha should prepare first.">
          <Badge variant="outline">General</Badge>
        </SettingsRow>
        <SettingsRow title="Export format" description="DOCX is currently the supported export format.">
          <Badge variant="outline">DOCX</Badge>
        </SettingsRow>
        <SettingsRow title="AI writing suggestions" description="Persistence for this preference is planned for a later release.">
          <Switch disabled aria-label="AI writing suggestions" />
        </SettingsRow>
      </CardContent>
    </Card>
  );
}

function SettingsUsageCard() {
  return (
    <Card id="usage" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Usage & Plan</CardTitle>
        <CardDescription>Usage reporting will appear here when account metrics are exposed.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {usageMetrics.map(([label, value]) => (
            <div key={label} className="rounded-lg border bg-muted/20 p-3">
              <div className="text-sm font-medium">{label}</div>
              <div className="mt-1 text-sm text-muted-foreground">{value}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function SettingsContent({ session }: SettingsContentProps) {
  return (
    <main className="min-h-0 flex-1 bg-background">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">
        <div className="mb-8 max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage your account, appearance, writing preferences, and security.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <SettingsSectionNav />
          <div className="grid gap-4">
            <SettingsProfileCard session={session} />
            <SettingsAppearanceCard />
            <SettingsWritingCard />
            <SettingsUsageCard />
            <SettingsAccountCard email={session?.user.email ?? ""} />
          </div>
        </div>
      </div>
    </main>
  );
}

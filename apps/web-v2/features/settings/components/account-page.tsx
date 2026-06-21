"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@aqsha/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@aqsha/ui/components/card";
import { Input } from "@aqsha/ui/components/input";
import { Loader2Icon } from "@aqsha/ui/icons";
import { useProfile, useUpdateDisplayName } from "../api";

export function AccountPage() {
  const profile = useProfile();
  const update = useUpdateDisplayName();
  const [name, setName] = useState<string | null>(null);

  // Inisialisasi field dari profil saat data tiba (render-phase, bukan effect).
  const value = name ?? profile.data?.name ?? "";
  const dirty = name !== null && name.trim() !== (profile.data?.name ?? "");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    update.mutate(trimmed);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Akun</h1>
        <p className="text-sm text-muted-foreground">Kelola profil kamu.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nama tampilan</CardTitle>
          <CardDescription>Nama yang muncul di seluruh aplikasi.</CardDescription>
        </CardHeader>
        <CardContent>
          {profile.isPending ? (
            <div className="flex py-2 text-muted-foreground">
              <Loader2Icon className="size-5 animate-spin" />
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-3">
              <Input
                value={value}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder="Nama kamu"
                disabled={update.isPending}
              />
              <div>
                <Button type="submit" size="sm" disabled={!dirty || !value.trim() || update.isPending}>
                  {update.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  Simpan
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>Dikelola lewat akun Clerk kamu.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{profile.data?.email ?? "—"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Foto profil & hapus akun</CardTitle>
          <CardDescription>Avatar dan penghapusan akun tersedia pada fase berikutnya.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Segera hadir.</p>
        </CardContent>
      </Card>
    </div>
  );
}

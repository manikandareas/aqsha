import { UserButton } from "@clerk/nextjs";
import { getServerApi } from "@/lib/api-server";

export const dynamic = "force-dynamic";

export default async function AppHome() {
  const api = await getServerApi();
  const { data: profile } = await api.users.me.get();

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col justify-center gap-6 px-6 py-12">
      <div className="flex items-center justify-between">
        <p className="font-serif text-3xl">Aqsha</p>
        <UserButton />
      </div>
      <div className="space-y-1">
        <p className="text-lg">
          Halo{profile?.name ? `, ${profile.name}` : ""} 👋
        </p>
        <p className="text-sm text-muted-foreground">
          Onboarding selesai. Workspace default sudah dibuat. Surface produk menyusul di fase
          berikutnya.
        </p>
        {profile?.email ? (
          <p className="text-sm text-muted-foreground">Masuk sebagai {profile.email}</p>
        ) : null}
      </div>
    </main>
  );
}

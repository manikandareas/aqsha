import type { ExampleResponse } from "@aqsha/shared";
import { formatServiceLabel } from "@aqsha/shared";

export const dynamic = "force-dynamic";

const fallbackApiUrl = "http://localhost:3001";

async function getExample(apiUrl: string): Promise<{
  data: ExampleResponse | null;
  error: string | null;
}> {
  try {
    const response = await fetch(`${apiUrl}/example`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`API request failed with ${response.status}`);
    }

    const data = (await response.json()) as ExampleResponse;

    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unknown API error",
    };
  }
}

export default async function Home() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? fallbackApiUrl;
  const { data, error } = await getExample(apiUrl);
  const serviceLabel = data?.serviceLabel ?? formatServiceLabel("API offline");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(61,123,255,0.18),_transparent_35%),linear-gradient(180deg,_#f8faff_0%,_#eef3fb_100%)] px-6 py-12">
      <section className="w-full max-w-4xl rounded-[28px] border border-slate-900/8 bg-white/90 p-8 shadow-[0_24px_60px_rgba(22,32,51,0.08)] backdrop-blur md:p-10">
        <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-blue-900">
          Bun Workspace Monorepo
        </span>

        <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-slate-950 md:text-6xl">
          Aqsha is wired end to end.
        </h1>

        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
          This Next.js 16 app was regenerated with the official{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm text-slate-900">
            create-next-app
          </code>{" "}
          CLI and reads{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm text-slate-900">
            NEXT_PUBLIC_API_URL
          </code>{" "}
          to talk to the Elysia service.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-slate-900/8 bg-white p-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              API Base URL
            </div>
            <div className="break-words text-sm font-semibold text-slate-950 md:text-base">
              {apiUrl}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-900/8 bg-white p-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Shared Package Value
            </div>
            <div className="break-words text-sm font-semibold text-slate-950 md:text-base">
              {serviceLabel}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-900/8 bg-white p-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              API Response
            </div>
            <div
              className={`break-words text-sm font-semibold md:text-base ${
                error ? "text-red-700" : "text-slate-950"
              }`}
            >
              {error ?? data?.message ?? "Waiting for API response"}
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}

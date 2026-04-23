import { formatServiceLabel } from "@aqsha/shared";
import { api } from "@/lib/eden";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function getErrorMessage(error: unknown) {
  if (!error) {
    return null;
  }

  if (typeof error === "object" && error !== null) {
    if ("value" in error) {
      const value = error.value;

      if (typeof value === "string") {
        return value;
      }

      if (value instanceof Error) {
        return value.message;
      }
    }

    if ("status" in error && typeof error.status === "number") {
      return `API request failed with ${error.status}`;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown API error";
}

function formatTimestamp(timestamp: unknown) {
  if (!timestamp) {
    return "not returned";
  }

  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }

  if (typeof timestamp === "string") {
    return timestamp;
  }

  return String(timestamp);
}

export default async function Home() {
  const healthResponse = await api.health.get();

  const apiError = getErrorMessage(healthResponse.error);
  const serviceLabel =
    formatServiceLabel(healthResponse.data?.service ?? "API offline");

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Aqsha is wired end to end.</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mt-4 max-w-2xl text-base leading-7 text-foreground md:text-lg">
            This Next.js 16 app was regenerated with the official{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm text-foreground">
              create-next-app
            </code>{" "}
            CLI and now uses Eden Treaty with a shared Elysia app type. It reads{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm text-foreground">
              NEXT_PUBLIC_API_URL
            </code>{" "}
            to talk to the Elysia service.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
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
                  apiError ? "text-red-700" : "text-slate-950"
                }`}
              >
                {apiError ?? "Health endpoint returned successfully"}
              </div>
            </article>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-900/8 bg-slate-950 px-5 py-4 text-sm text-slate-100">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Health Check
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span>Status: {healthResponse.data?.status ?? "offline"}</span>
              <span>
                Service: {healthResponse.data?.service ?? "unavailable"}
              </span>
              <span>
                Timestamp: {formatTimestamp(healthResponse.data?.timestamp)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

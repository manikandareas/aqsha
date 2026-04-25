"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/eden";

type EdenErrorValue = {
  error?: {
    message?: unknown;
  };
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getApiErrorMessage(error: unknown): string {
  if (!error) {
    return "Workspace setup failed. Try again.";
  }

  if (isObject(error)) {
    if ("value" in error) {
      const value = error.value;

      if (isObject(value)) {
        const apiError = (value as EdenErrorValue).error;

        if (isObject(apiError) && typeof apiError.message === "string") {
          return apiError.message;
        }
      }

      if (typeof value === "string") {
        return value;
      }
    }

    if ("status" in error && typeof error.status === "number") {
      if (error.status === 401) {
        return "Sign in again before creating your workspace.";
      }

      return `Workspace setup failed with status ${error.status}.`;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Workspace setup failed. Try again.";
}

export function GetStartedForm() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [workspaceName, setWorkspaceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmedWorkspaceName = workspaceName.trim();
  const canSubmit =
    !isPending &&
    Boolean(session) &&
    trimmedWorkspaceName.length > 0 &&
    !isSubmitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!trimmedWorkspaceName) {
      setError("Workspace name is required.");
      return;
    }

    if (!session) {
      setError("Sign in before creating your workspace.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await api.session["get-started"].post({
        workspaceName: trimmedWorkspaceName,
      });

      if (response.error) {
        setError(getApiErrorMessage(response.error));
        return;
      }

      router.push("/demo");
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full rounded-xl border border-border bg-background p-5 shadow-soft-card sm:p-6"
    >
      <div>
        <h2 className="text-card-title font-bold leading-tight tracking-card-title">
          Create your workspace
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This name appears in your Aqsha sidebar and session context.
        </p>
      </div>

      <div className="mt-6 space-y-2">
        <Label htmlFor="workspaceName">Workspace name</Label>
        <Input
          id="workspaceName"
          name="workspaceName"
          value={workspaceName}
          onChange={(event) => {
            setWorkspaceName(event.target.value);
            setError(null);
          }}
          placeholder="Research Lab"
          autoComplete="organization"
          aria-invalid={Boolean(error)}
          className="h-11 bg-background px-3 text-base md:text-base"
          maxLength={80}
        />
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm leading-5 text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3">
        {!isPending && !session ? (
          <Button
            type="button"
            className="h-10 w-full"
            onClick={() => router.push("/signin")}
          >
            Sign in to continue
            <ArrowRight aria-hidden="true" />
          </Button>
        ) : (
          <Button type="submit" className="h-10 w-full" disabled={!canSubmit}>
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Creating workspace
              </>
            ) : (
              <>
                Continue
                <ArrowRight aria-hidden="true" />
              </>
            )}
          </Button>
        )}
      </div>
    </form>
  );
}

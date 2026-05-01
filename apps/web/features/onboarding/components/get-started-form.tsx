"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCompleteGetStartedMutation } from "@/features/onboarding/lib/mutations";
import { authClient } from "@/lib/auth-client";
import { getEdenErrorMessage } from "@/lib/eden-error";
import { toast } from "@/lib/toast";

const getStartedSchema = z.object({
  workspaceName: z.string().trim().min(1, "Workspace name is required."),
});

type GetStartedFormValues = z.infer<typeof getStartedSchema>;

function getApiErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 401
  ) {
    return "Sign in again before creating your workspace.";
  }

  return getEdenErrorMessage(error, "Workspace setup failed. Try again.");
}

export function GetStartedForm() {
  const router = useRouter();
  const completeGetStartedMutation = useCompleteGetStartedMutation();
  const { data: session, isPending } = authClient.useSession();
  const form = useForm<GetStartedFormValues>({
    resolver: zodResolver(getStartedSchema),
    defaultValues: {
      workspaceName: "",
    },
  });

  const workspaceName = useWatch({
    control: form.control,
    name: "workspaceName",
  });
  const rootError = form.formState.errors.root?.message;
  const canSubmit =
    !isPending &&
    Boolean(session) &&
    workspaceName.trim().length > 0 &&
    !form.formState.isSubmitting &&
    !completeGetStartedMutation.isPending;

  async function handleSubmit(values: GetStartedFormValues): Promise<void> {
    if (!session) {
      form.setError("root", {
        message: "Sign in before creating your workspace.",
      });
      return;
    }

    form.clearErrors("root");

    try {
      await completeGetStartedMutation.mutateAsync({
        workspaceName: values.workspaceName,
      });
      router.push("/demo");
    } catch (cause) {
      const message = getApiErrorMessage(cause);
      form.setError("root", { message });
      toast.error({
        title: "Could not create organization",
        description: message,
      });
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(handleSubmit)}
      className="w-full max-w-[31rem]"
    >
      <div className="space-y-3">
        <Label
          htmlFor="workspaceName"
          className="text-base font-semibold leading-6"
        >
          Organization name
        </Label>
        <Input
          id="workspaceName"
          {...form.register("workspaceName", {
            onChange: () => form.clearErrors("root"),
          })}
          placeholder="Manik's Workspace"
          autoComplete="organization"
          aria-invalid={Boolean(form.formState.errors.workspaceName)}
          className="h-11 rounded-sm bg-background px-3 text-base shadow-soft-card md:text-base"
          maxLength={80}
        />
        {form.formState.errors.workspaceName ? (
          <p className="text-sm text-destructive">
            {form.formState.errors.workspaceName.message}
          </p>
        ) : null}
      </div>

      {rootError ? (
        <p className="mt-3 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm leading-5 text-destructive">
          {rootError}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3">
        {!isPending && !session ? (
          <Button
            type="button"
            className="h-12 w-full bg-foreground text-background shadow-soft-card hover:bg-foreground/90"
            onClick={() => router.push("/signin")}
          >
            Sign in to continue
          </Button>
        ) : (
          <Button
            type="submit"
            className="h-12 w-full bg-foreground text-background shadow-soft-card hover:bg-foreground/90"
            disabled={!canSubmit}
          >
            {form.formState.isSubmitting ||
            completeGetStartedMutation.isPending ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Creating organization
              </>
            ) : (
              "Create organization"
            )}
          </Button>
        )}
      </div>
    </form>
  );
}

"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useCompleteGetStartedMutation } from "@/features/onboarding/lib/mutations";
import { authClient } from "@/lib/auth-client";
import { getEdenErrorMessage } from "@/lib/eden-error";
import { toast } from "@/lib/toast";

function getApiErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 401
  ) {
    return "Sign in again before continuing.";
  }

  return getEdenErrorMessage(error, "Setup failed. Try again.");
}

export function GetStartedForm() {
  const router = useRouter();
  const completeGetStartedMutation = useCompleteGetStartedMutation();
  const { data: session, isPending } = authClient.useSession();
  const isSubmitting = completeGetStartedMutation.isPending;

  async function handleContinue(): Promise<void> {
    if (!session) {
      toast.error({
        title: "Sign in required",
        description: "Sign in before continuing.",
      });
      return;
    }

    try {
      await completeGetStartedMutation.mutateAsync();
      router.push("/app");
      router.refresh();
    } catch (cause) {
      toast.error({
        title: "Could not complete setup",
        description: getApiErrorMessage(cause),
      });
    }
  }

  return (
    <div className="w-full max-w-[31rem]">
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
          type="button"
          className="h-12 w-full bg-foreground text-background shadow-soft-card hover:bg-foreground/90"
          disabled={isPending || isSubmitting}
          onClick={() => void handleContinue()}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Preparing Aqsha
            </>
          ) : (
            "Continue to Aqsha"
          )}
        </Button>
      )}
    </div>
  );
}

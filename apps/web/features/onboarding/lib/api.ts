import { api } from "@/lib/eden";

type CompleteGetStartedInput = {
  workspaceName: string;
};

export async function completeGetStarted({
  workspaceName,
}: CompleteGetStartedInput): Promise<void> {
  const response = await api.session["get-started"].post({ workspaceName });

  if (response.error) {
    throw response.error;
  }
}

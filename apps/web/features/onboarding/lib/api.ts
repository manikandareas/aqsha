import { api } from "@/lib/eden";

export async function completeGetStarted(): Promise<void> {
  const response = await api.session["get-started"].post({});

  if (response.error) {
    throw response.error;
  }
}

export type WaitlistInput = {
  email: string;
  companyOrUniversity?: string;
  website?: string;
};

export type WaitlistApiError = {
  code?: string;
  field?: string;
  message: string;
};

const FALLBACK_MESSAGE = "Permintaan belum berhasil. Coba lagi.";

function apiBaseUrl(): string {
  const raw = import.meta.env.PUBLIC_API_URL ?? "http://localhost:3001";
  return String(raw).replace(/\/$/, "");
}

async function parseError(response: Response): Promise<WaitlistApiError> {
  try {
    const body = (await response.json()) as {
      message?: unknown;
      code?: unknown;
      field?: unknown;
    };
    const message =
      typeof body.message === "string" && body.message.trim().length > 0
        ? body.message
        : FALLBACK_MESSAGE;
    return {
      message,
      code: typeof body.code === "string" ? body.code : undefined,
      field: typeof body.field === "string" ? body.field : undefined,
    };
  } catch {
    return { message: FALLBACK_MESSAGE };
  }
}

async function postJson(path: string, body: unknown): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw { message: FALLBACK_MESSAGE } satisfies WaitlistApiError;
  }

  if (!response.ok) {
    throw await parseError(response);
  }
}

export async function submitWaitlist(input: WaitlistInput): Promise<void> {
  await postJson("/waitlist", input);
}

export async function verifyWaitlist(token: string): Promise<void> {
  await postJson("/waitlist/verify", { token });
}

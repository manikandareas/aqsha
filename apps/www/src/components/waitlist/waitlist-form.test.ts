/// <reference types="bun-types" />

import { expect, test } from "bun:test";

const source = await Bun.file(
  new URL("./waitlist-form.tsx", import.meta.url),
).text();

test("submits a live waitlist form and preserves its accessible states", () => {
  expect(source).toContain(
    'import { submitWaitlist, type WaitlistApiError } from "@/lib/waitlist-api";',
  );
  expect(source).toContain(
    "await submitWaitlist({ email, companyOrUniversity, website });",
  );
  expect(source).toContain('disabled={state === "submitting"}');
  expect(source).toContain('role="alert"');
  expect(source).toContain("Cek email kamu untuk mengonfirmasi pendaftaran.");
  expect(source).not.toMatch(/onSubmit=\{\(event\) => event\.preventDefault\(\)\}/);
});

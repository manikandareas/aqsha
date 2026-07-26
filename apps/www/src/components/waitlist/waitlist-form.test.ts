/// <reference types="bun-types" />

import { expect, test } from "bun:test";

const source = await Bun.file(
  new URL("./waitlist-form.tsx", import.meta.url),
).text();

const verificationSource = await Bun.file(
  new URL("./waitlist-verification.tsx", import.meta.url),
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

test("validates the email client-side before hitting the API", () => {
  expect(source).toContain("EMAIL_PATTERN");
  expect(source).toContain("if (!isValidEmail(email.trim()))");
  // Client-side rejection must return before any request is sent.
  const submitBody = source.slice(
    source.indexOf("async function onSubmit"),
    source.indexOf("await submitWaitlist"),
  );
  expect(submitBody).toContain("return;");
});

test("waitlist steps honor reduced motion and share one success mark", () => {
  for (const [name, text] of [
    ["form", source],
    ["verification", verificationSource],
  ] as const) {
    expect(text, name).toContain("useReducedMotion");
    expect(text, name).toContain("@/components/waitlist/drawn-mark");
  }
  // A dead-end verify page has no way forward — always offer re-registration.
  expect(verificationSource).toContain("WAITLIST_PATH");
});

import { afterEach, describe, expect, test } from "bun:test";
import { publicApp } from "../src/public-app";

const originalOrigins = process.env.PUBLIC_CORS_ORIGINS;

afterEach(() => {
  if (originalOrigins === undefined) delete process.env.PUBLIC_CORS_ORIGINS;
  else process.env.PUBLIC_CORS_ORIGINS = originalOrigins;
});

describe("publicApp", () => {
  test("keeps only public health and waitlist routes", async () => {
    const ping = await publicApp.handle(new Request("http://localhost/ping"));
    expect(ping.status).toBe(200);

    const productRoute = await publicApp.handle(new Request("http://localhost/workspaces"));
    expect(productRoute.status).toBe(404);
  });

  test("accepts CORS only from configured public origins", async () => {
    process.env.PUBLIC_CORS_ORIGINS = "https://aqshara.com, https://staging.aqshara.com";

    const allowed = await publicApp.handle(
      new Request("http://localhost/waitlist", {
        method: "OPTIONS",
        headers: {
          origin: "https://aqshara.com",
          "access-control-request-method": "POST",
        },
      }),
    );
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://aqshara.com");

    const rejected = await publicApp.handle(
      new Request("http://localhost/waitlist", {
        method: "OPTIONS",
        headers: {
          origin: "https://untrusted.example",
          "access-control-request-method": "POST",
        },
      }),
    );
    expect(rejected.headers.get("access-control-allow-origin")).toBeNull();
  });
});

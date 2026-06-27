import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Next 16 menamai middleware sebagai `proxy.ts` (port dari apps/web).
const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;
  const { isAuthenticated, redirectToSignIn } = await auth();
  if (!isAuthenticated) {
    return redirectToSignIn();
  }
});

export const config = {
  matcher: [
    // `mastra-api` di-exclude: ia proxy ke server `@aqsha/agent` Mastra yang punya auth-nya
    // sendiri (`server.auth` MastraAuthClerk). Tanpa exclude, Clerk middleware akan
    // 307-redirect fetch/stream (bukan 401) → biarkan runtime agent yang auth.
    "/((?!mastra-api|_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};

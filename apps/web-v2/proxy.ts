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
    // `eve/v1` di-exclude: route eve di-proxy `withEve` ke proses eve (yang
    // punya auth channel sendiri). Clerk middleware di sini akan 307-redirect
    // fetch/stream (bukan 401) → biarkan eve yang menegakkan auth.
    "/((?!eve/v1|_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};

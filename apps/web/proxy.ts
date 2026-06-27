import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Next 16 menamai middleware sebagai `proxy.ts` (port dari apps/web).
// `/blog` + metadata SEO (sitemap/robots) WAJIB publik supaya bisa di-crawl
// Googlebot tanpa auth — kalau tidak, Clerk 307-redirect ke /sign-in.
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/blog(.*)",
  "/sitemap.xml",
  "/robots.txt",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;
  const { isAuthenticated, redirectToSignIn } = await auth();
  if (!isAuthenticated) {
    return redirectToSignIn();
  }
});

export const config = {
  matcher: [
    // `eve/v1` di-exclude: rewrite Next (next.config) mem-proxy route eve ke app
    // `@aqsha/agent` (punya auth channel Clerk sendiri). Tanpa exclude, Clerk
    // middleware akan 307-redirect fetch/stream (bukan 401) → biarkan eve yang auth.
    "/((?!eve/v1|_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};

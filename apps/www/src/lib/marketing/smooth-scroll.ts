import LocomotiveScroll from "locomotive-scroll";

/**
 * Anchor offset for Lenis scrollTo — mirrors the fixed marketing header
 * (`scroll-mt-[72px]` on landing sections) since Lenis ignores scroll-margin.
 */
const ANCHOR_OFFSET = -72;

/**
 * Landing-only smooth scroll (Locomotive v5 on top of Lenis). Native scroll is
 * preserved, so the fixed header, `client:visible` islands, and the Motion
 * `ScrollParallax` drift keep working. Reduced motion skips init entirely —
 * the page falls back to native scrolling and CSS `scroll-behavior: smooth`.
 */
export function initLandingSmoothScroll(): LocomotiveScroll | null {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return null;
  }

  return new LocomotiveScroll({
    lenisOptions: {
      lerp: 0.1,
      smoothWheel: true,
      anchors: { offset: ANCHOR_OFFSET },
    },
  });
}

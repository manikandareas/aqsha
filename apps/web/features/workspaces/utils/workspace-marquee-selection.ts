import { MAX_CONTEXT_ARTIFACTS } from "@/lib/context-selection";

export type MarqueePoint = {
  x: number;
  y: number;
};

export type MarqueeRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type MarqueeTarget = {
  id: string;
  rect: Pick<DOMRect, "left" | "right" | "top" | "bottom">;
};

export function normalizeMarqueeRect(
  start: MarqueePoint,
  current: MarqueePoint,
): MarqueeRect {
  const left = Math.min(start.x, current.x);
  const right = Math.max(start.x, current.x);
  const top = Math.min(start.y, current.y);
  const bottom = Math.max(start.y, current.y);

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

export function rectsIntersect(
  a: Pick<MarqueeRect, "left" | "right" | "top" | "bottom">,
  b: Pick<MarqueeRect, "left" | "right" | "top" | "bottom">,
) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function intersectingTargetIds(
  selectionRect: Pick<MarqueeRect, "left" | "right" | "top" | "bottom">,
  targets: MarqueeTarget[],
) {
  return targets.flatMap((target) =>
    rectsIntersect(selectionRect, target.rect) ? [target.id] : [],
  );
}

export function applyMarqueeSelection({
  currentIds,
  hitIds,
  visibleIds,
  mode,
}: {
  currentIds: string[];
  hitIds: string[];
  visibleIds: string[];
  mode: "add" | "toggle";
}) {
  const hitSet = new Set(hitIds);

  if (mode === "toggle") {
    const currentSet = new Set(currentIds);
    const next = currentIds.filter((id) => !hitSet.has(id));
    for (const id of visibleIds) {
      if (hitSet.has(id) && !currentSet.has(id)) {
        next.push(id);
      }
    }
    return [...new Set(next)].slice(0, MAX_CONTEXT_ARTIFACTS);
  }

  const currentSet = new Set(currentIds);
  const next = [...currentIds];
  for (const id of visibleIds) {
    if (hitSet.has(id) && !currentSet.has(id)) {
      next.push(id);
    }
  }
  return [...new Set(next)].slice(0, MAX_CONTEXT_ARTIFACTS);
}

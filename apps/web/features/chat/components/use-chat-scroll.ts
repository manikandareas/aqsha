import { useCallback, useEffect, useRef, useState } from "react";

const BOTTOM_THRESHOLD = 100;
const USER_SCROLL_TIMEOUT = 150;

export function useChatScroll(resetKey: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const isUserScrollingRef = useRef(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const checkIfAtBottom = useCallback(() => {
    const container = containerRef.current;

    if (!container) {
      return true;
    }

    return (
      container.scrollTop + container.clientHeight >=
      container.scrollHeight - BOTTOM_THRESHOLD
    );
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
  }, []);

  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    let scrollTimeout: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      isUserScrollingRef.current = true;
      clearTimeout(scrollTimeout);

      const atBottom = checkIfAtBottom();
      setIsAtBottom(atBottom);
      isAtBottomRef.current = atBottom;

      scrollTimeout = setTimeout(() => {
        isUserScrollingRef.current = false;
      }, USER_SCROLL_TIMEOUT);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [checkIfAtBottom]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const scrollIfNeeded = () => {
      if (!isAtBottomRef.current || isUserScrollingRef.current) {
        return;
      }

      requestAnimationFrame(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "auto",
        });
        setIsAtBottom(true);
        isAtBottomRef.current = true;
      });
    };

    const mutationObserver = new MutationObserver(scrollIfNeeded);
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const resizeObserver = new ResizeObserver(scrollIfNeeded);
    resizeObserver.observe(container);

    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    scrollToBottom("auto");
  }, [resetKey, scrollToBottom]);

  return {
    containerRef,
    isAtBottom,
    scrollToBottom,
  };
}

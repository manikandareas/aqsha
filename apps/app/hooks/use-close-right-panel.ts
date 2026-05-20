"use client";

import { useCallback } from "react";
import { useSidebar } from "@/components/ui/sidebar";

export function useCloseRightPanel() {
  const { isMobile, setOpen, setOpenMobile } = useSidebar();

  return useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
      return;
    }
    setOpen(false);
  }, [isMobile, setOpen, setOpenMobile]);
}

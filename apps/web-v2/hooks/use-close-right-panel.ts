"use client";import { useSidebar } from "@/components/ui/sidebar";

export function useCloseRightPanel() {
  const { isMobile, setOpen, setOpenMobile } = useSidebar();

  return () => {
    if (isMobile) {
      setOpenMobile(false);
      return;
    }
    setOpen(false);
  };
}

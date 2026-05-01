"use client";

import "sileo/styles.css";

import { useTheme } from "next-themes";
import { Toaster as SileoToaster } from "sileo";

export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <SileoToaster
      position="top-center"
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      options={{
        fill: "var(--sileo-toast-fill)",
        roundness: 16,
        styles: {
          title: "sileo-toast-title",
          description: "sileo-toast-description",
          badge: "sileo-toast-badge",
          button: "sileo-toast-button",
        },
      }}
    />
  );
}

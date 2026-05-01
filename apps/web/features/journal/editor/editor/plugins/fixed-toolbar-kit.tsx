"use client";

import { createPlatePlugin } from "platejs/react";

import { FixedToolbar } from "@/features/journal/editor/components/fixed-toolbar";
import { FixedToolbarButtons } from "@/components/ui/fixed-toolbar-buttons";

export const FixedToolbarKit = [
  createPlatePlugin({
    key: "fixed-toolbar",
    render: {
      /** Below the scrollable editor, like the workspace shell bottom bar. */
      afterContainer: () => (
        <FixedToolbar>
          <FixedToolbarButtons />
        </FixedToolbar>
      ),
    },
  }),
];

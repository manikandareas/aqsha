"use client";

import { WandSparklesIcon } from "lucide-react";
import { createPlatePlugin } from "platejs/react";

import { AIToolbarButton } from "@/components/ui/ai-toolbar-button";
import { FixedToolbar } from "@/features/journal/editor/components/fixed-toolbar";
import { ToolbarGroup } from "@/components/ui/toolbar";

export const PlateAiMinimalToolbarKit = [
  createPlatePlugin({
    key: "plate-ai-minimal-toolbar",
    render: {
      beforeEditable: () => (
        <FixedToolbar>
          <ToolbarGroup>
            <AIToolbarButton tooltip="AI commands">
              <WandSparklesIcon className="size-4" />
            </AIToolbarButton>
          </ToolbarGroup>
        </FixedToolbar>
      ),
    },
  }),
];

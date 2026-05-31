"use client";

import mermaid from "mermaid";
import { Loader2Icon } from "@aqsha/ui/icons";
import { useEffect, useId, useState } from "react";

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  flowchart: { htmlLabels: false },
});

export function MermaidArtifactViewer({ source }: { source: string }) {
  const reactId = useId();
  const diagramId = `artifact-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [rendered, setRendered] = useState<{
    source: string;
    svgUrl: string;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let svgUrl: string | null = null;

    void mermaid
      .render(diagramId, source)
      .then((result) => {
        if (cancelled) return;
        svgUrl = URL.createObjectURL(
          new Blob([result.svg], { type: "image/svg+xml" }),
        );
        setRendered({ source, svgUrl, error: null });
      })
      .catch((renderError: unknown) => {
        if (cancelled) return;
        setRendered({
          source,
          svgUrl: "",
          error: renderError instanceof Error
            ? renderError.message
            : "Diagram Mermaid tidak bisa dirender.",
        });
      });

    return () => {
      cancelled = true;
      if (svgUrl) {
        URL.revokeObjectURL(svgUrl);
      }
    };
  }, [diagramId, source]);

  const activeRender = rendered?.source === source ? rendered : null;

  if (!activeRender) {
    return (
      <div className="flex min-h-[420px] w-full items-center justify-center gap-2 text-[13px] font-medium text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Merender diagram…
      </div>
    );
  }

  if (activeRender.error) {
    return (
      <p className="rounded-[8px] border border-destructive/30 bg-destructive/5 p-3 text-[13px] font-medium text-destructive">
        {activeRender.error}
      </p>
    );
  }

  return (
    <div className="mermaid-artifact-canvas flex h-full min-h-[420px] w-full items-center justify-center overflow-auto p-4">
      <object
        data={activeRender.svgUrl}
        type="image/svg+xml"
        aria-label="Diagram Mermaid"
        className="h-full max-h-full w-full max-w-full"
      />
    </div>
  );
}

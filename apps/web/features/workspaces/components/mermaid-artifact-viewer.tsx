"use client";

import mermaid from "mermaid";
import { Loader2Icon } from "lucide-react";
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
    svg: string;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    void mermaid
      .render(diagramId, source)
      .then((result) => {
        if (cancelled) return;
        setRendered({ source, svg: result.svg, error: null });
      })
      .catch((renderError: unknown) => {
        if (cancelled) return;
        setRendered({
          source,
          svg: "",
          error: renderError instanceof Error
            ? renderError.message
            : "Diagram Mermaid tidak bisa dirender.",
        });
      });

    return () => {
      cancelled = true;
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
    <div
      className="mermaid-artifact-canvas flex h-full min-h-[420px] w-full items-center justify-center overflow-auto p-4 [&_svg]:h-full [&_svg]:max-h-full [&_svg]:max-w-full [&_svg]:w-full"
      dangerouslySetInnerHTML={{ __html: activeRender.svg }}
    />
  );
}

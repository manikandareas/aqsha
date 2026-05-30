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
      <div className="flex min-h-[240px] items-center justify-center gap-2 rounded-[8px] border border-border bg-muted/25 text-[13px] font-medium text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Merender diagram…
      </div>
    );
  }

  if (activeRender.error) {
    return (
      <div className="grid gap-3">
        <p className="rounded-[8px] border border-destructive/30 bg-destructive/5 p-3 text-[13px] font-medium text-destructive">
          {activeRender.error}
        </p>
        <pre className="overflow-auto rounded-[8px] border border-border bg-muted/35 p-4 text-[12px] leading-6">
          {source}
        </pre>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div
        className="overflow-auto rounded-[8px] border border-border bg-background p-4"
        dangerouslySetInnerHTML={{ __html: activeRender.svg }}
      />
      <pre className="overflow-auto rounded-[8px] border border-border bg-muted/35 p-4 text-[12px] leading-6">
        {source}
      </pre>
    </div>
  );
}

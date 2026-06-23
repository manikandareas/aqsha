import type { ReactNode } from "react";

export function WorkflowCodePanel({ lines }: { lines: ReactNode[] }) {
  return (
    <div className="min-w-0">
      <div className="min-h-[16rem] rounded-2xl border border-border bg-card p-6 shadow-sm sm:min-h-[18rem] sm:p-8">
        <pre className="overflow-x-auto font-mono text-[13px] leading-[1.85] text-card-foreground sm:text-sm sm:leading-[1.9]">
          <code>
            {lines.map((line) => (
              <span key={reactNodeTextKey(line)} className="block">
                {line}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}

function reactNodeTextKey(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(reactNodeTextKey).join("");
  }
  if (node && typeof node === "object" && "props" in node) {
    const props = node.props as { children?: ReactNode };
    return reactNodeTextKey(props.children);
  }
  return "line";
}

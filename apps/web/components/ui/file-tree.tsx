"use client";

import { useState } from "react";
import {
  ChevronRightIcon,
  ExternalLinkIcon,
  FileCodeIcon,
  FileIcon,
  FileImageIcon,
  FileJsonIcon,
  FileTextIcon,
  FolderIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export interface FileNode {
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
  extension?: string;
  href?: string | null;
  subtitle?: string;
}

interface FileTreeProps {
  data: FileNode[];
  className?: string;
  title?: string;
}

interface FileItemProps {
  node: FileNode;
  depth: number;
  isLast: boolean;
  parentPath: boolean[];
}

const getFileIcon = (extension?: string) => {
  const iconMap: Record<
    string,
    { color: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    css: { color: "text-[oklch(0.65_0.2_280)]", Icon: FileCodeIcon },
    document: { color: "text-muted-foreground", Icon: FileTextIcon },
    json: { color: "text-[oklch(0.75_0.15_85)]", Icon: FileJsonIcon },
    js: { color: "text-[oklch(0.8_0.18_90)]", Icon: FileCodeIcon },
    jsx: { color: "text-[oklch(0.7_0.2_200)]", Icon: FileCodeIcon },
    md: { color: "text-muted-foreground", Icon: FileTextIcon },
    png: { color: "text-[oklch(0.65_0.12_160)]", Icon: FileImageIcon },
    source: { color: "text-primary", Icon: FileTextIcon },
    svg: { color: "text-[oklch(0.7_0.15_160)]", Icon: FileImageIcon },
    ts: { color: "text-[oklch(0.6_0.15_230)]", Icon: FileCodeIcon },
    tsx: { color: "text-[oklch(0.65_0.18_220)]", Icon: FileCodeIcon },
    url: { color: "text-primary", Icon: FileTextIcon },
    default: { color: "text-muted-foreground", Icon: FileIcon },
  };

  return iconMap[extension || "default"] || iconMap.default;
};

function FileItem({ node, depth, isLast, parentPath }: FileItemProps) {
  const [isOpen, setIsOpen] = useState(true);

  const isFolder = node.type === "folder";
  const hasChildren = isFolder && node.children && node.children.length > 0;
  const fileIcon = getFileIcon(node.extension);
  const FileIconComponent = fileIcon.Icon;
  const content = (
    <>
      {parentPath.map((hasLine, index) =>
        hasLine ? (
          <span
            className="absolute bottom-0 top-0 w-px bg-border/45 transition-colors duration-200 group-hover:bg-primary/35"
            key={index}
            style={{ left: `${index * 16 + 15}px` }}
          />
        ) : null,
      )}

      {depth > 0 ? (
        <span
          className={cn(
            "absolute top-0 w-px bg-border/45 transition-colors duration-200 group-hover:bg-primary/35",
            isLast ? "h-1/2" : "bottom-0",
          )}
          style={{ left: `${(depth - 1) * 16 + 15}px` }}
        />
      ) : null}

      {depth > 0 ? (
        <span
          className="absolute h-px w-3 bg-border/45 transition-colors duration-200 group-hover:bg-primary/35"
          style={{ left: `${(depth - 1) * 16 + 16}px`, top: "18px" }}
        />
      ) : null}

      <div
        className={cn(
          "flex size-4 items-center justify-center transition-transform duration-200 ease-out",
          isFolder && isOpen && "rotate-90",
        )}
      >
        {isFolder ? (
          <ChevronRightIcon className="size-3 text-muted-foreground transition-colors duration-200 group-hover:text-primary" />
        ) : null}
      </div>

      <div
        className={cn(
          "flex size-5 items-center justify-center rounded opacity-80 transition-all duration-200 group-hover:scale-110",
          isFolder ? "text-[oklch(0.78_0.14_85)]" : fileIcon.color,
        )}
      >
        {isFolder ? (
          <FolderIcon className="size-4 fill-current" />
        ) : (
          <FileIconComponent className="size-4" />
        )}
      </div>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "truncate font-mono text-sm transition-colors duration-200 group-hover:text-foreground",
            isFolder ? "text-foreground/90" : "text-muted-foreground",
          )}
        >
          {node.name}
        </span>
        {node.subtitle ? (
          <span className="truncate text-xs text-muted-foreground/75">
            {node.subtitle}
          </span>
        ) : null}
      </span>

      {node.href ? (
        <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      ) : null}
    </>
  );

  const itemClassName = cn(
    "group relative flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5",
    "transition-all duration-200 ease-out hover:bg-file-tree-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
    isFolder ? "cursor-pointer" : node.href ? "cursor-alias" : "cursor-default",
  );

  return (
    <div className="select-none">
      {node.href && !isFolder ? (
        <a
          className={itemClassName}
          href={node.href}
          rel="noreferrer"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          target="_blank"
        >
          {content}
        </a>
      ) : isFolder ? (
        <button
          aria-expanded={isOpen}
          className={itemClassName}
          onClick={() => setIsOpen(!isOpen)}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          type="button"
        >
          {content}
        </button>
      ) : (
        <div
          className={itemClassName}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {content}
        </div>
      )}

      {hasChildren && (
        <div
          className={cn(
            "overflow-hidden transition-opacity duration-300 ease-out",
            isOpen ? "opacity-100" : "h-0 opacity-0",
          )}
        >
          {node.children!.map((child, index) => (
            <FileItem
              depth={depth + 1}
              isLast={index === node.children!.length - 1}
              key={`${child.type}:${child.name}:${index}`}
              node={child}
              parentPath={[...parentPath, !isLast]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({
  data,
  className,
  title = "explorer",
}: FileTreeProps) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col rounded-[18px] border border-border/50 bg-file-tree-bg p-3 font-mono",
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-2 border-b border-border/30 pb-3">
        <div className="flex gap-1.5">
          <div className="size-2.5 rounded-full bg-[oklch(0.65_0.2_25)]" />
          <div className="size-2.5 rounded-full bg-[oklch(0.75_0.18_85)]" />
          <div className="size-2.5 rounded-full bg-[oklch(0.65_0.18_150)]" />
        </div>
        <span className="ml-2 truncate text-xs text-muted-foreground">
          {title}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {data.map((node, index) => (
          <FileItem
            depth={0}
            isLast={index === data.length - 1}
            key={`${node.type}:${node.name}:${index}`}
            node={node}
            parentPath={[]}
          />
        ))}
      </div>
    </div>
  );
}

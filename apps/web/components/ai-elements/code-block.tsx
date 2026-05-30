"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { codeToHtml, type BundledLanguage } from "shiki";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CodeBlockContextValue = {
  code: string;
};

const CodeBlockContext = createContext<CodeBlockContextValue | null>(null);

function useCodeBlockContext() {
  const context = useContext(CodeBlockContext);
  if (!context) {
    throw new Error("CodeBlock subcomponents must be used within CodeBlock.");
  }
  return context;
}

type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string;
  language: BundledLanguage;
  showLineNumbers?: boolean;
  children?: ReactNode;
};

export function CodeBlock({
  code,
  language,
  showLineNumbers = false,
  children,
  className,
  ...props
}: CodeBlockProps) {
  const [html, setHtml] = useState("");
  const [error, setError] = useState<string | null>(null);
  const contextValue = useMemo(() => ({ code }), [code]);

  useEffect(() => {
    let mounted = true;

    void codeToHtml(code || " ", {
      lang: language,
      theme: "github-light",
    })
      .then((result) => {
        if (!mounted) return;
        setHtml(result);
        setError(null);
      })
      .catch((highlightError: unknown) => {
        if (!mounted) return;
        setHtml("");
        setError(highlightError instanceof Error ? highlightError.message : "Syntax highlighting failed.");
      });

    return () => {
      mounted = false;
    };
  }, [code, language]);

  return (
    <CodeBlockContext.Provider value={contextValue}>
      <div
        data-slot="code-block"
        className={cn("overflow-hidden rounded-[8px] border border-border bg-background", className)}
        {...props}
      >
        {children}
        {error ? (
          <p className="border-b border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] font-medium text-destructive">
            {error}
          </p>
        ) : null}
        {html ? (
          <div
            className={cn(
              "code-block-content overflow-auto text-[12px] leading-6",
              showLineNumbers ? "[&_code]:counter-reset:line [&_span.line]:before:mr-4 [&_span.line]:before:inline-block [&_span.line]:before:w-6 [&_span.line]:before:text-right [&_span.line]:before:text-muted-foreground/70 [&_span.line]:before:content-[counter(line)] [&_span.line]:counter-increment:line" : null,
              "[&_pre]:m-0 [&_pre]:min-h-[360px] [&_pre]:bg-transparent! [&_pre]:p-4",
            )}
            // Shiki returns escaped, syntax-highlighted HTML.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="min-h-[360px] overflow-auto p-4 text-[12px] leading-6 text-foreground">
            {code || "No source content."}
          </pre>
        )}
      </div>
    </CodeBlockContext.Provider>
  );
}

export function CodeBlockHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="code-block-header"
      className={cn(
        "flex min-h-9 items-center justify-between gap-3 border-b border-border bg-muted/35 px-3",
        className,
      )}
      {...props}
    />
  );
}

export function CodeBlockTitle({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="code-block-title"
      className={cn("flex min-w-0 items-center gap-2 text-muted-foreground", className)}
      {...props}
    />
  );
}

export function CodeBlockFilename({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="code-block-filename"
      className={cn("truncate font-mono text-[11px] font-semibold uppercase tracking-[0.08em]", className)}
      {...props}
    />
  );
}

export function CodeBlockActions({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="code-block-actions"
      className={cn("flex shrink-0 items-center gap-1", className)}
      {...props}
    />
  );
}

export function CodeBlockCopyButton({
  className,
  timeout = 2000,
  onCopy,
  onError,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "type" | "size" | "variant"> & {
  timeout?: number;
  onCopy?: () => void;
  onError?: (error: Error) => void;
}) {
  const { code } = useCodeBlockContext();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeoutId = window.setTimeout(() => setCopied(false), timeout);
    return () => window.clearTimeout(timeoutId);
  }, [copied, timeout]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={copied ? "Copied source" : "Copy source"}
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          onCopy?.();
        } catch (copyError: unknown) {
          onError?.(copyError instanceof Error ? copyError : new Error("Copy failed."));
        }
      }}
      {...props}
    >
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
    </Button>
  );
}

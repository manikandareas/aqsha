"use client";

import { CheckIcon, CopyIcon } from "@aqsha/ui/icons";
import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { codeToTokens, type BundledLanguage } from "shiki";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CodeBlockContextValue = {
  code: string;
};

const CodeBlockContext = createContext<CodeBlockContextValue | null>(null);

function useCodeBlockContext() {
  const context = use(CodeBlockContext);
  if (!context) {
    throw new Error("CodeBlock subcomponents must be used within CodeBlock.");
  }
  return context;
}

type HighlightToken = {
  content: string;
  offset: number;
  color?: string;
};

type HighlightState =
  | {
      tokens: HighlightToken[][];
      error: null;
    }
  | {
      tokens: null;
      error: string | null;
    };

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
  const [highlight, setHighlight] = useState<HighlightState>({
    tokens: null,
    error: null,
  });
  const contextValue = { code };

  useEffect(() => {
    let mounted = true;

    void codeToTokens(code || " ", {
      lang: language,
      theme: "github-light",
    })
      .then((result) => {
        if (!mounted) return;
        setHighlight({ tokens: result.tokens, error: null });
      })
      .catch((highlightError: unknown) => {
        if (!mounted) return;
        setHighlight({
          tokens: null,
          error:
            highlightError instanceof Error
              ? highlightError.message
              : "Syntax highlighting failed.",
        });
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
        {highlight.error ? (
          <p className="border-b border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] font-medium text-destructive">
            {highlight.error}
          </p>
        ) : null}
        {highlight.tokens ? (
          <pre
            className={cn(
              "code-block-content m-0 min-h-[360px] overflow-auto bg-transparent p-4 text-[12px] leading-6",
              showLineNumbers && "[counter-reset:line]",
            )}
          >
            <code>
              {highlight.tokens.map((line, lineIndex) => (
                <span
                  key={highlightLineKey(line, lineIndex)}
                  className={cn(
                    "block min-h-6 whitespace-pre",
                    showLineNumbers &&
                      "[counter-increment:line] before:mr-4 before:inline-block before:w-6 before:text-right before:text-muted-foreground/70 before:content-[counter(line)]",
                  )}
                >
                  {line.map((token) => (
                    <span
                      key={`${token.offset}:${token.content}`}
                      style={{ color: token.color }}
                    >
                      {token.content}
                    </span>
                  ))}
                  {line.length === 0 ? " " : null}
                </span>
              ))}
            </code>
          </pre>
        ) : (
          <pre className="min-h-[360px] overflow-auto p-4 text-[12px] leading-6 text-foreground">
            {code || "No source content."}
          </pre>
        )}
      </div>
    </CodeBlockContext.Provider>
  );
}

function highlightLineKey(line: HighlightToken[], lineIndex: number) {
  const content = line.map((token) => token.content).join("");
  return content ? `line:${content}` : `line:${lineIndex + 1}`;
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
  const copiedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const showCopiedConfirmation = () => {
    if (copiedResetTimerRef.current) {
      clearTimeout(copiedResetTimerRef.current);
    }
    setCopied(true);
    copiedResetTimerRef.current = setTimeout(() => {
      setCopied(false);
      copiedResetTimerRef.current = null;
    }, timeout);
  };

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
          showCopiedConfirmation();
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

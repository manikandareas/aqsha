import type { UIMessage } from "ai";
import { Streamdown } from "streamdown";

function textFromParts(parts: UIMessage["parts"]): string {
  return parts
    .filter((part): part is { type: "text"; text: string } =>
      part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("");
}

export function MessageList({ messages }: { messages: UIMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="flex min-h-full items-center justify-center px-6 py-16 text-center">
        <div className="max-w-md space-y-3 rounded-2xl border border-dashed border-border bg-card px-6 py-8 shadow-sm">
          <p className="text-2xl font-bold tracking-[-0.625px] text-foreground">
            Ready when you are
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            Ask a question, draft an idea, or use this temporary thread to think through your next step.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[820px] flex-col gap-5 px-4 pb-56 pt-4 sm:px-6 lg:pt-6">
      {messages.map((message) => {
        const text = textFromParts(message.parts);
        const isUser = message.role === "user";

        return (
          <div key={message.id} className={isUser ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                isUser
                  ? "max-w-full rounded-2xl border border-border bg-card px-4 py-2.5 text-sm leading-6 text-card-foreground shadow-sm sm:max-w-[82%]"
                  : "max-w-full text-[15px] leading-7 text-foreground sm:max-w-[92%]"
              }
            >
              {isUser ? (
                <p className="whitespace-pre-wrap">{text}</p>
              ) : (
                <div className="prose prose-neutral max-w-none dark:prose-invert prose-p:my-3 prose-strong:text-foreground prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none prose-a:text-primary">
                  <Streamdown>{text}</Streamdown>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

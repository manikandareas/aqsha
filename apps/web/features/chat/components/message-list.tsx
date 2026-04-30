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
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:py-10">
      {messages.map((message) => {
        const text = textFromParts(message.parts);
        const isUser = message.role === "user";

        return (
          <div key={message.id} className={isUser ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                isUser
                  ? "max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground shadow-sm sm:max-w-[75%]"
                  : "max-w-[90%] rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 text-sm leading-6 text-card-foreground shadow-sm sm:max-w-[82%]"
              }
            >
              {isUser ? (
                <p className="whitespace-pre-wrap">{text}</p>
              ) : (
                <div className="prose prose-sm max-w-none dark:prose-invert">
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

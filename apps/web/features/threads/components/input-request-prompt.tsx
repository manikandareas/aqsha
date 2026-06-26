"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isApprovalRequest, type InputResponsePayload, type PendingInputRequest } from "../lib/eve-timeline";

type InputOption = NonNullable<PendingInputRequest["options"]>[number];

/**
 * Copy approval ter-lokalisasi per tool. eve meng-generate prompt approval dalam bahasa
 * Inggris (`Approve tool call: <toolName>`) + label "Yes"/"No" dan membocorkan nama tool
 * mentah, jadi kita ganti dengan copy Indonesia di sini. Tool tak dikenal → `DEFAULT_APPROVAL`.
 */
const APPROVAL_COPY: Record<
  string,
  { prompt: string; approve: string; deny: string; danger?: boolean }
> = {
  delete_artifact: {
    prompt: "Hapus dokumen ini? Tindakan ini permanen dan tidak bisa dibatalkan.",
    approve: "Hapus",
    deny: "Batal",
    danger: true,
  },
};

const DEFAULT_APPROVAL = { prompt: "Setujui tindakan ini?", approve: "Setujui", deny: "Tolak" } as const;

function optionVariant(style?: "default" | "primary" | "danger") {
  switch (style) {
    case "danger":
      return "destructive" as const;
    case "primary":
      return "default" as const;
    default:
      return "outline" as const;
  }
}

/**
 * Kartu HITL gaya Cursor — dipasang di atas composer saat eve parkir di `input.requested`
 * (approval tool atau `ask_question`). Approval pakai copy ter-lokalisasi; `ask_question`
 * pakai prompt/opsi yang ditulis model apa adanya.
 */
export function InputRequestPrompt({
  requests,
  onRespond,
}: {
  requests: readonly PendingInputRequest[];
  onRespond: (response: InputResponsePayload) => void;
}) {
  if (requests.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 pb-2 animate-in slide-in-from-bottom-2 duration-200">
      {requests.map((request) => (
        <InputRequestCard key={request.requestId} request={request} onRespond={onRespond} />
      ))}
    </div>
  );
}

function InputRequestCard({
  request,
  onRespond,
}: {
  request: PendingInputRequest;
  onRespond: (response: InputResponsePayload) => void;
}) {
  const copy = isApprovalRequest(request) ? (APPROVAL_COPY[request.toolName] ?? DEFAULT_APPROVAL) : null;

  const prompt = copy?.prompt ?? request.prompt;
  const options: readonly InputOption[] = copy
    ? [
        { id: "approve", label: copy.approve, style: copy.danger ? "danger" : "primary" },
        { id: "deny", label: copy.deny, style: "default" },
      ]
    : (request.options ?? []);

  // Hint teks bebas hanya untuk pertanyaan (bukan approval) — user boleh jawab di composer.
  const showFreeformHint =
    copy === null && (request.allowFreeform || request.display === "text" || options.length === 0);

  return (
    <div
      className={cn(
        "rounded-xl border border-border/85 bg-card/95 px-3.5 py-3 shadow-sm",
        "animate-in fade-in slide-in-from-bottom-1 duration-200",
      )}
    >
      <p className="text-sm font-medium leading-5 text-foreground">{prompt}</p>
      {options.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {options.map((opt) => (
            <div key={opt.id} className="flex min-w-0 flex-col gap-0.5">
              <Button
                type="button"
                size="sm"
                variant={optionVariant(opt.style)}
                onClick={() => onRespond({ requestId: request.requestId, optionId: opt.id })}
              >
                {opt.label}
              </Button>
              {opt.description ? (
                <span className="max-w-48 px-0.5 text-[10px] leading-4 text-muted-foreground">
                  {opt.description}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {showFreeformHint ? (
        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
          Atau ketik jawaban di composer di bawah.
        </p>
      ) : null}
    </div>
  );
}

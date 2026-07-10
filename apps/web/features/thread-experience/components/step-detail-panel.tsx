"use client";

import type { DeepStepDetail, ToolRow } from "@/features/threads/lib/timeline-types";
import { DetailPanelShell } from "./detail-panel-chrome";
import { SourceLinkList } from "./source-link-list";
import { useThreadPanelData } from "./thread-panel-context";

/**
 * Generic step detail panel — the full content of any expandable tool step that isn't
 * a plan or sub-question search (verify, counter-evidence, normal-chat search results).
 * Resolves by tool-call id; sources link out to their URL.
 */
export function StepDetailPanel({ toolCallId }: { toolCallId: string }) {
  const lookups = useThreadPanelData();
  const step = lookups?.steps.get(toolCallId) ?? null;

  if (!step) {
    return (
      <DetailPanelShell title="Detail">
        <p className="text-[13px] text-muted-foreground">
          Detail langkah ini belum tersedia. Coba lagi setelah proses selesai.
        </p>
      </DetailPanelShell>
    );
  }

  return (
    <DetailPanelShell title={step.title}>
      {step.detail ? (
        <StepBody detail={step.detail} />
      ) : step.rows && step.rows.length > 0 ? (
        <StepRows rows={step.rows} />
      ) : (
        <p className="text-[13px] text-muted-foreground">Tidak ada detail tambahan.</p>
      )}
    </DetailPanelShell>
  );
}

/** Baris scalar Masukan/Hasil tool biasa — nilai PENUH (panel = sumber kebenaran tak terpotong). */
function StepRows({ rows }: { rows: ToolRow[] }) {
  const groups: { label: string; group: ToolRow["group"] }[] = [
    { label: "Masukan", group: "input" },
    { label: "Hasil", group: "output" },
  ];
  return (
    <div className="grid gap-4">
      {groups.map(({ label, group }) => {
        const items = rows.filter((r) => r.group === group);
        if (items.length === 0) return null;
        return (
          <dl key={group} className="grid gap-1.5">
            <dt className="font-medium text-[11px] text-muted-foreground/70">{label}</dt>
            {items.map((row) => (
              <div key={row.key} className="grid gap-0.5">
                <dt className="text-[12px] text-muted-foreground">{row.label}</dt>
                <dd className="whitespace-pre-wrap break-words text-[13px] leading-6 text-foreground">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        );
      })}
    </div>
  );
}

function StepBody({ detail }: { detail: DeepStepDetail }) {
  switch (detail.kind) {
    case "search-flat":
      return <SourceLinkList sources={detail.sources} />;
    case "search":
      return (
        <div className="grid gap-4">
          {detail.subSearches.map((sub) => (
            <div key={sub.index} className="grid gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground/70">
                {sub.subQuestion}
              </span>
              <SourceLinkList sources={sub.sources ?? []} />
            </div>
          ))}
        </div>
      );
    case "plan":
      return (
        <div className="grid gap-3">
          {detail.plan ? (
            <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-foreground">
              {detail.plan}
            </p>
          ) : null}
          {detail.subQuestions.length > 0 ? (
            <ul className="list-disc space-y-1 pl-4 text-[13px] text-muted-foreground">
              {detail.subQuestions.map((q, i) => (
                <li key={`${i}-${q.slice(0, 24)}`}>{q}</li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    case "text":
      return (
        <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-foreground">
          {detail.text}
        </p>
      );
    case "citations":
      return (
        <p className="text-[13px] text-muted-foreground">
          {detail.count > 0
            ? `${detail.count} sumber diberi nomor sitasi [n].`
            : "Belum ada sumber bernomor."}
        </p>
      );
    default:
      return null;
  }
}

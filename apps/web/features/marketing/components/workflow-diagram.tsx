export function WorkflowDiagram() {
  return (
    <div className="relative min-h-[17rem] overflow-hidden rounded-2xl border border-border bg-muted sm:min-h-[19.75rem]">
      <div className="absolute inset-0 bg-[linear-gradient(32deg,transparent_49.75%,var(--border)_50%,transparent_50.25%),linear-gradient(148deg,transparent_49.75%,var(--border)_50%,transparent_50.25%)]" />
      <div className="absolute left-1/2 top-1/2 h-16 w-[32rem] -translate-x-1/2 -translate-y-1/2 -rotate-[31deg] rounded-full border border-border bg-card shadow-sm" />
      <div className="absolute left-1/2 top-1/2 h-9 w-[20rem] -translate-x-1/2 -translate-y-[42%] -rotate-[31deg] rounded-full bg-muted text-center text-[0.8rem] font-medium leading-9 text-muted-foreground">
        source notes
      </div>
      <div className="absolute left-1/2 top-1/2 h-9 w-[21rem] -translate-x-[42%] translate-y-[28%] -rotate-[31deg] rounded-full bg-muted text-center text-[0.8rem] font-medium leading-9 text-muted-foreground">
        paper library
      </div>
      <div className="absolute left-1/2 top-1/2 h-10 w-44 -translate-x-[38%] -translate-y-[155%] -rotate-[31deg] rounded-full border border-border bg-card text-center text-[0.82rem] font-semibold leading-10 text-card-foreground shadow-sm">
        cited answer
      </div>
    </div>
  );
}

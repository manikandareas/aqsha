export function WorkflowCopyBlock({
  phase,
  title,
  body,
  items,
}: {
  phase: string;
  title: string;
  body: string;
  items: [string, string][];
}) {
  return (
    <article className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {phase}
      </p>
      <h3 className="font-heading mt-2 text-xl font-normal leading-tight tracking-normal text-foreground sm:text-2xl">
        {title}
      </h3>
      <p className="mt-3 max-w-[31rem] text-pretty text-base leading-snug text-muted-foreground sm:mt-4 sm:text-lg sm:leading-snug">
        {body}
      </p>
      <div className="mt-8 grid gap-x-8 gap-y-6 sm:mt-10 sm:grid-cols-2">
        {items.map(([label, description]) => (
          <div key={label}>
            <p className="text-sm font-medium leading-snug text-foreground sm:text-[15px]">
              {label}
            </p>
            <p className="mt-1 text-sm leading-snug text-muted-foreground sm:text-[15px] sm:leading-snug">
              {description}
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}

export function BillingErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-[12px] border border-[var(--coral-soft-border)] bg-[var(--coral-soft)] px-4 py-3 text-sm font-medium leading-6 text-[var(--coral)]">
      {message}
    </div>
  );
}

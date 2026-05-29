export function BillingErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-[12px] border border-coral-soft-border bg-coral-soft px-4 py-3 text-sm font-medium leading-6 text-coral-foreground">
      {message}
    </div>
  );
}

export function BillingNoticeBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-[12px] border border-mint-soft-border bg-mint-soft px-4 py-3 text-sm font-medium leading-6 text-mint-foreground">
      {message}
    </div>
  );
}

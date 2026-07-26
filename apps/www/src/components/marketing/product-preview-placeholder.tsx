import type { ProductPreview } from "@/data/features";
import { cn } from "@/lib/utils";

export function ProductPreviewPlaceholder({
  preview,
  className,
}: {
  preview: ProductPreview;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      data-product-preview={preview.surface}
      className={cn(
        "absolute inset-0 grid place-items-center bg-muted/45 p-5 text-center",
        className,
      )}
    >
      <div className="max-w-[16rem] rounded-xl border-2 border-dashed border-border bg-card/85 px-4 py-5">
        <p className="text-xs font-semibold text-muted-foreground">Preview produk</p>
        <p className="font-heading mt-2 text-lg font-medium text-foreground">
          {preview.title}
        </p>
        <p className="mt-1 text-sm leading-snug text-muted-foreground">
          {preview.caption}
        </p>
      </div>
    </div>
  );
}

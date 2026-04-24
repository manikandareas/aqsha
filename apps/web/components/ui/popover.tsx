"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "@/lib/utils";

type PopoverAnchorValue = React.ComponentProps<
  typeof PopoverPrimitive.Positioner
>["anchor"];

type PopoverVirtualAnchorRef = React.RefObject<
  Exclude<PopoverAnchorValue, undefined | (() => Element | null)>
>;

type PopoverContentEvent = {
  preventDefault: () => void;
};

type PopoverContentProps = PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  > & {
    onCloseAutoFocus?: (event: PopoverContentEvent) => void;
    onEscapeKeyDown?: (event: KeyboardEvent) => void;
    onOpenAutoFocus?: (event: PopoverContentEvent) => void;
  };

const PopoverAnchorContext = React.createContext<{
  anchor: PopoverAnchorValue;
  setAnchor: React.Dispatch<React.SetStateAction<PopoverAnchorValue>>;
} | null>(null);

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  const [anchor, setAnchor] = React.useState<PopoverAnchorValue>(undefined);

  return (
    <PopoverAnchorContext.Provider value={{ anchor, setAnchor }}>
      <PopoverPrimitive.Root data-slot="popover" {...props} />
    </PopoverAnchorContext.Provider>
  );
}

function PopoverAnchor({
  asChild,
  children,
  virtualRef,
  ...props
}: React.ComponentProps<"div"> & {
  asChild?: boolean;
  virtualRef?: PopoverVirtualAnchorRef;
}) {
  const context = React.useContext(PopoverAnchorContext);

  React.useEffect(() => {
    if (!context || !virtualRef) return;

    context.setAnchor(virtualRef.current);

    return () => {
      context.setAnchor(undefined);
    };
  }, [context, virtualRef]);

  const ref = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (!context || virtualRef) return;

      context.setAnchor(node ?? undefined);
    },
    [context, virtualRef],
  );

  if (!children) {
    return null;
  }

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      ...props,
      ref,
    });
  }

  return (
    <div data-slot="popover-anchor" ref={ref} {...props}>
      {children}
    </div>
  );
}

type PopoverTriggerProps = PopoverPrimitive.Trigger.Props & {
  render?: React.ReactElement;
};

function PopoverTrigger({
  nativeButton,
  render,
  ...props
}: PopoverTriggerProps) {
  const resolvedNativeButton =
    nativeButton ?? (render && render.type !== "button" ? false : undefined);

  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      nativeButton={resolvedNativeButton}
      render={render}
      {...props}
    />
  );
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  onCloseAutoFocus,
  onEscapeKeyDown,
  onKeyDownCapture,
  onOpenAutoFocus,
  side = "bottom",
  sideOffset = 4,
  ...props
}: PopoverContentProps) {
  const context = React.useContext(PopoverAnchorContext);

  React.useEffect(() => {
    onOpenAutoFocus?.({
      preventDefault: () => undefined,
    });

    return () => {
      onCloseAutoFocus?.({
        preventDefault: () => undefined,
      });
    };
  }, [onCloseAutoFocus, onOpenAutoFocus]);

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        anchor={context?.anchor}
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          {...props}
          data-slot="popover-content"
          onKeyDownCapture={(event) => {
            if (event.key === "Escape") {
              onEscapeKeyDown?.(event.nativeEvent);
            }

            onKeyDownCapture?.(event);
          }}
          className={cn(
            "z-50 flex w-72 origin-(--transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  );
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  );
}

function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
};

"use client"

import * as React from "react"
import type { VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { inputGroupAddonVariants } from "./input-group-variants"

function InputGroupAddon({
  className,
  align = "inline-start",
  onPointerDown,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onPointerDown={(event) => {
        onPointerDown?.(event)
        if (event.defaultPrevented) {
          return
        }
        if (
          (event.target as HTMLElement).closest(
            "button,input,textarea,select,a"
          )
        ) {
          return
        }
        event.preventDefault()
        event.currentTarget.parentElement?.querySelector("input")?.focus()
      }}
      {...props}
    />
  )
}

export { InputGroupAddon }

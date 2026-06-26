import * as React from "react"

import { cn } from "../lib/cn"

function Card({ ref, className, ...props }: React.ComponentPropsWithRef<"div">) {
  return <div ref={ref} className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...props} />
}
Card.displayName = "Card"

function CardHeader({ ref, className, ...props }: React.ComponentPropsWithRef<"div">) {
  return <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
}
CardHeader.displayName = "CardHeader"

function CardTitle({ ref, className, ...props }: React.ComponentPropsWithRef<"div">) {
  return <div ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
}
CardTitle.displayName = "CardTitle"

function CardDescription({ ref, className, ...props }: React.ComponentPropsWithRef<"p">) {
  return <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
}
CardDescription.displayName = "CardDescription"

function CardContent({ ref, className, ...props }: React.ComponentPropsWithRef<"div">) {
  return <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
}
CardContent.displayName = "CardContent"

function CardFooter({ ref, className, ...props }: React.ComponentPropsWithRef<"div">) {
  return <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
}
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }

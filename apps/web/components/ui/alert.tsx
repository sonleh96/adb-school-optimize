import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva("relative w-full rounded-[14px] border px-4 py-3 text-sm", {
  variants: {
    variant: {
      default: "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)]",
      destructive: "border-[rgba(180,35,24,0.28)] bg-[#fff4f2] text-[#5c1d16]",
      warning: "border-[rgba(168,85,10,0.3)] bg-[#fdf6ec] text-[#5c3a0e]",
      success: "border-[rgba(21,127,61,0.3)] bg-[#eef7f0] text-[#14532d]",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn("mb-1 font-[family-name:var(--font-display)] font-semibold leading-none", className)}
      {...props}
    />
  )
);
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-sm leading-relaxed", className)} {...props} />
  )
);
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };

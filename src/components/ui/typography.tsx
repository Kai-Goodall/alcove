import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const typographyVariants = cva("tracking-normal", {
  variants: {
    variant: {
      h1: "text-balance text-[26px] font-semibold leading-[30px]",
      h2: "text-balance text-[21px] font-semibold leading-[26px]",
      h3: "text-balance text-[16px] font-semibold leading-[20px]",
      body: "text-pretty text-[14px] leading-[18px] text-muted-foreground",
      label: "text-[14px] font-medium leading-none",
      caption: "text-pretty text-[13px] leading-[16px] text-muted-foreground",
    },
  },
  defaultVariants: {
    variant: "body",
  },
});

type TypographyVariant = NonNullable<
  VariantProps<typeof typographyVariants>["variant"]
>;

const defaultElements: Record<TypographyVariant, React.ElementType> = {
  h1: "h1",
  h2: "h2",
  h3: "h3",
  body: "p",
  label: "span",
  caption: "span",
};

export interface TypographyProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof typographyVariants> {
  as?: React.ElementType;
}

function Typography({
  as,
  className,
  variant = "body",
  ...props
}: TypographyProps) {
  const Comp = as ?? defaultElements[variant ?? "body"];

  return (
    <Comp
      className={cn(typographyVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Typography, typographyVariants };


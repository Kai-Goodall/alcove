import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const typographyVariants = cva("", {
  variants: {
    variant: {
      h1: "text-balance text-[26px] font-medium leading-[26px] tracking-[-0.38px]",
      h2: "text-balance text-[20px] font-medium leading-[26px] tracking-[-0.2px]",
      h3: "text-balance text-[16px] font-medium leading-[18px] tracking-[-0.1px]",
      body: "text-pretty text-[14px] font-normal leading-[18px] tracking-[-0.24px] text-muted-foreground",
      label: "text-[14px] font-medium leading-none tracking-[-0.2px]",
      caption:
        "text-pretty text-[13px] font-normal leading-[16px] tracking-[-0.2px] text-muted-foreground",
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


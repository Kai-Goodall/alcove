import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/_lib/utils";

type MotionSafeInputProps = Omit<
  React.ComponentPropsWithoutRef<"input">,
  "onAnimationStart" | "onDrag" | "onDragEnd" | "onDragStart"
>;

export interface InputProps extends MotionSafeInputProps {
  invalid?: boolean;
}

const MotionInput = motion.input;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      invalid = false,
      type = "text",
      ...props
    },
    ref,
  ) => {
    const shouldReduceMotion = useReducedMotion();
    const backgroundColor = "var(--card)";
    const boxShadow = invalid
      ? "var(--shadow-input-invalid)"
      : "var(--shadow-input)";
    const focusBoxShadow = invalid
      ? "var(--shadow-input-invalid)"
      : "var(--shadow-input-focus)";
    const transition = shouldReduceMotion
      ? { duration: 0 }
      : { type: "spring" as const, duration: 0.16, bounce: 0 };

    return (
      <MotionInput
        ref={ref}
        type={type}
        aria-invalid={invalid || undefined}
        initial={false}
        animate={{ backgroundColor, boxShadow }}
        whileFocus={{ boxShadow: focusBoxShadow }}
        transition={transition}
        className={cn(
          "squircle h-9 w-full rounded-[24px] px-3 text-[14px] leading-none text-foreground outline-none placeholder:text-placeholder",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };

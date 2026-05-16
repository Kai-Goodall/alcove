import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipOpenContext = React.createContext(false);

type TooltipProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>;

function Tooltip({
  open: openProp,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: TooltipProps) {
  const [open, setOpen] = React.useState(defaultOpen ?? false);
  const isControlled = openProp !== undefined;
  const value = isControlled ? openProp : open;

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  return (
    <TooltipPrimitive.Root
      open={value}
      onOpenChange={handleOpenChange}
      {...props}
    >
      <TooltipOpenContext.Provider value={value}>
        {children}
      </TooltipOpenContext.Provider>
    </TooltipPrimitive.Root>
  );
}

type TooltipContentProps = Omit<
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>,
  "onAnimationStart" | "onDrag" | "onDragEnd" | "onDragStart"
> & {
  compact?: boolean;
};

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(
  (
    { className, sideOffset = 10, compact = false, children, ...props },
    ref,
  ) => {
    const open = React.useContext(TooltipOpenContext);
    const shouldReduceMotion = useReducedMotion();
    const enterTransition = shouldReduceMotion
      ? { duration: 0 }
      : { type: "spring" as const, duration: 0.15, bounce: 0 };
    const exitTransition = shouldReduceMotion
      ? { duration: 0 }
      : { type: "tween" as const, duration: 0.1, ease: "easeOut" as const };

    return (
      <AnimatePresence>
        {open ? (
          <TooltipPrimitive.Portal forceMount>
            <TooltipPrimitive.Content
              ref={ref}
              sideOffset={sideOffset}
              className="z-50"
              forceMount
              {...props}
            >
              <motion.div
                initial={
                  shouldReduceMotion
                    ? false
                    : { opacity: 0, y: 2, scale: 0.97 }
                }
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: enterTransition,
                }}
                exit={{
                  opacity: 0,
                  y: 2,
                  scale: 0.97,
                  transition: exitTransition,
                }}
                style={{
                  transformOrigin:
                    "var(--radix-tooltip-content-transform-origin)",
                }}
                className={cn(
                  "max-w-[200px] rounded-[14px] bg-card text-foreground shadow-tooltip",
                  compact
                    ? "px-3 py-2 text-[14px] font-semibold leading-none"
                    : "px-4 py-3 text-[14px] leading-[18px]",
                  className,
                )}
              >
                {children}
              </motion.div>
            </TooltipPrimitive.Content>
          </TooltipPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    );
  },
);
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { useSquircle } from "@/_lib/use-squircle";
import { cn } from "@/_lib/utils";

const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverOpenContext = React.createContext(false);

type PopoverProps = React.ComponentPropsWithoutRef<
  typeof PopoverPrimitive.Root
>;

function Popover({
  open: openProp,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: PopoverProps) {
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
    <PopoverPrimitive.Root
      open={value}
      onOpenChange={handleOpenChange}
      {...props}
    >
      <PopoverOpenContext.Provider value={value}>
        {children}
      </PopoverOpenContext.Provider>
    </PopoverPrimitive.Root>
  );
}

type PopoverContentProps = Omit<
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>,
  "onAnimationStart" | "onDrag" | "onDragEnd" | "onDragStart"
>;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(
  (
    {
      className,
      sideOffset = 8,
      align = "end",
      collisionPadding = 8,
      children,
      ...props
    },
    ref,
  ) => {
    const open = React.useContext(PopoverOpenContext);
    const wrapperRef = React.useRef<HTMLDivElement>(null);
    const squircleRef = React.useRef<HTMLDivElement>(null);
    useSquircle(squircleRef, 24, { wrapperRef });

    return (
      <AnimatePresence>
        {open ? (
          <PopoverPrimitive.Portal forceMount>
            <PopoverPrimitive.Content
              ref={ref}
              sideOffset={sideOffset}
              align={align}
              collisionPadding={collisionPadding}
              data-overlay-content=""
              className="z-50"
              forceMount
              {...props}
            >
              <motion.div
                ref={wrapperRef}
                className="relative"
                // No enter animation per spec — appears instantly. Exit only.
                initial={false}
                animate={{ opacity: 1 }}
                exit={{
                  opacity: 0,
                  transition: {
                    type: "tween" as const,
                    duration: 0.14,
                    ease: "easeOut" as const,
                  },
                }}
                style={{
                  transformOrigin:
                    "var(--radix-popover-content-transform-origin)",
                }}
              >
                <div
                  ref={squircleRef}
                  className={cn(
                    "rounded-[24px] bg-card text-foreground shadow-tooltip outline-none",
                    className,
                  )}
                >
                  {children}
                </div>
              </motion.div>
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    );
  },
);
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };

import * as React from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { IconChevronDownFill18 } from "nucleo-ui-fill-18";
import { Icon } from "@/_components/ui/icon";
import { useSquircle } from "@/_lib/use-squircle";
import { cn } from "@/_lib/utils";

const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;

type SelectTriggerProps = React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.Trigger
>;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  SelectTriggerProps
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative inline-flex h-[34px] shrink-0 cursor-default items-center justify-center gap-1 rounded-full bg-card px-3 outline-none",
      "text-[14px] font-medium leading-none tracking-[-0.2px] text-primary",
      "shadow-button transition-colors hover:bg-button-hover",
      "before:absolute before:-inset-0.75 before:pointer-events-none before:content-['']",
      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:pointer-events-none disabled:opacity-45",
      className,
    )}
    {...props}
  >
    <span className="px-1">{children}</span>
    <Icon
      glyph={IconChevronDownFill18}
      size={14}
      className="text-secondary"
    />
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

type SelectContentProps = Omit<
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>,
  "onAnimationStart" | "onDrag" | "onDragEnd" | "onDragStart"
>;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  SelectContentProps
>(
  (
    {
      className,
      position = "popper",
      sideOffset = 8,
      align = "end",
      children,
      ...props
    },
    ref,
  ) => {
    const wrapperRef = React.useRef<HTMLDivElement>(null);
    const squircleRef = React.useRef<HTMLDivElement>(null);
    useSquircle(squircleRef, 16, { wrapperRef });
    const setRefs = React.useCallback(
      (el: HTMLDivElement | null) => {
        wrapperRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) {
          (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }
      },
      [ref],
    );

    return (
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          ref={setRefs}
          position={position}
          sideOffset={sideOffset}
          align={align}
          data-overlay-content=""
          className="z-50 outline-none"
          style={{
            transformOrigin: "var(--radix-select-content-transform-origin)",
          }}
          {...props}
        >
          <div
            ref={squircleRef}
            className={cn(
              "min-w-[137px] rounded-[16px] bg-card text-foreground shadow-tooltip outline-none",
              className,
            )}
          >
            <SelectPrimitive.Viewport className="flex flex-col items-stretch p-1">
              {children}
            </SelectPrimitive.Viewport>
          </div>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    );
  },
);
SelectContent.displayName = SelectPrimitive.Content.displayName;

type SelectItemProps = React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.Item
>;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  SelectItemProps
>(({ className, children, ...props }, forwardedRef) => {
  const squircleRef = React.useRef<HTMLDivElement>(null);
  useSquircle(squircleRef, 12);
  const setRefs = React.useCallback(
    (el: HTMLDivElement | null) => {
      squircleRef.current = el;
      if (typeof forwardedRef === "function") forwardedRef(el);
      else if (forwardedRef) {
        (
          forwardedRef as React.MutableRefObject<HTMLDivElement | null>
        ).current = el;
      }
    },
    [forwardedRef],
  );

  return (
    <SelectPrimitive.Item
      ref={setRefs}
      className={cn(
        "flex w-full cursor-pointer items-center justify-end rounded-[12px] px-3 py-2 outline-none",
        "text-[14px] font-medium leading-none tracking-[-0.2px] text-primary",
        "transition-colors",
        "data-[highlighted]:bg-surface-sunken data-[state=checked]:text-secondary",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
});
SelectItem.displayName = SelectPrimitive.Item.displayName;

export {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
};

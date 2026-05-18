import * as React from "react";
import { LayoutGroup, motion } from "motion/react";
import { Tabs } from "radix-ui";
import { cn } from "@/_lib/utils";

export type SegmentItem = {
  value: string;
  label: string;
};

export interface SegmentedTabsProps {
  items: SegmentItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  "aria-label"?: string;
}

function SegmentedTabs({
  items,
  value,
  onValueChange,
  className,
  "aria-label": ariaLabel = "Tabs",
}: SegmentedTabsProps) {
  const instanceId = React.useId();
  const activeTabBackgroundLayoutId = `${instanceId}-active-tab-background`;

  const listRef = React.useRef<HTMLDivElement>(null);
  const triggerRefs = React.useRef<Record<string, HTMLButtonElement | null>>(
    {},
  );
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [hoverRect, setHoverRect] = React.useState<{
    x: number;
    width: number;
  } | null>(null);
  // Bumped each time the cursor (re-)enters the container, so the hover bg
  // remounts and runs its scale/fade-in `initial` at the correct position
  // instead of sliding in from the previous resting place.
  const [sessionKey, setSessionKey] = React.useState(0);

  React.useLayoutEffect(() => {
    if (!hovered) return;
    const trigger = triggerRefs.current[hovered];
    const list = listRef.current;
    if (!trigger || !list) return;
    const tr = trigger.getBoundingClientRect();
    const lr = list.getBoundingClientRect();
    setHoverRect({ x: tr.left - lr.left, width: tr.width });
  }, [hovered]);

  const handleEnter = (val: string) => {
    setHovered((prev) => {
      if (prev === null) setSessionKey((k) => k + 1);
      return val;
    });
  };

  return (
    <Tabs.Root value={value} onValueChange={onValueChange}>
      <Tabs.List
        ref={listRef}
        aria-label={ariaLabel}
        onMouseLeave={() => setHovered(null)}
        className={cn(
          "relative inline-flex h-[34px] items-center gap-1 rounded-full",
          className,
        )}
      >
        {hoverRect ? (
          <motion.span
            key={sessionKey}
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 h-full rounded-full bg-button-ghost-hover"
            initial={{
              x: hoverRect.x,
              width: hoverRect.width,
              opacity: 0,
              scale: 0.85,
            }}
            animate={{
              x: hoverRect.x,
              width: hoverRect.width,
              opacity: hovered ? 0.5 : 0,
              scale: hovered ? 1 : 0.85,
            }}
            transition={{ type: "spring", duration: 0.28, bounce: 0 }}
          />
        ) : null}
        <LayoutGroup id={instanceId}>
          {items.map((item) => {
            const active = item.value === value;

            return (
              <Tabs.Trigger
                key={item.value}
                value={item.value}
                ref={(el) => {
                  triggerRefs.current[item.value] = el;
                }}
                onMouseEnter={() => handleEnter(item.value)}
                onFocus={() => handleEnter(item.value)}
                className="relative h-[34px] rounded-full px-3 text-[14px] font-medium leading-none text-foreground outline-none before:absolute before:-inset-0.75 before:pointer-events-none before:content-[''] after:absolute after:inset-y-0 after:-inset-x-0.5 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {active ? (
                  <motion.span
                    layoutId={activeTabBackgroundLayoutId}
                    className="absolute inset-0 rounded-full bg-control-active"
                    initial={false}
                    transition={{ type: "spring", duration: 0.28, bounce: 0 }}
                  />
                ) : null}
                <span className="relative z-10">{item.label}</span>
              </Tabs.Trigger>
            );
          })}
        </LayoutGroup>
      </Tabs.List>
    </Tabs.Root>
  );
}

export { SegmentedTabs };
